import { useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "@/lib/api";
import { fetchPlaybackInfo, type PlaybackInfo, type PendingPlayback } from "@/services/video.service";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8085"}`;

interface Props {
  videoId: string;
  /** Override watermark text — defaults to the backend-provided email. */
  watermarkOverride?: string;
  className?: string;
  /** Top-right (default) or bottom-right corner of the player */
  watermarkCorner?: "top-right" | "bottom-right";
}

type LoadState =
  | { kind: "loading" }
  | { kind: "pending"; message: string }
  | { kind: "playing"; info: PlaybackInfo }
  | { kind: "error"; message: string };

interface QualityLevel {
  index: number;       // hls.js level index (-1 = auto)
  height: number;
  label: string;       // "1080p", "720p", etc.
}

function absolutize(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url}`;
}

export function SecureVideoPlayer({
  videoId,
  watermarkOverride,
  className,
  watermarkCorner = "top-right",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const retryCountRef = useRef(0);

  // Quality selector state
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = Auto
  const [activeHeight, setActiveHeight] = useState<number | null>(null); // which rendition is actually playing
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setLevels([]);
    setCurrentLevel(-1);
    setActiveHeight(null);
    retryCountRef.current = 0;

    const load = async () => {
      try {
        const info = await fetchPlaybackInfo(videoId);
        if (cancelled) return;
        if ((info as PendingPlayback).status && (info as PendingPlayback).status !== "ready") {
          const pending = info as PendingPlayback;
          setState({
            kind: "pending",
            message: pending.message || "Video is still being optimized — try again tomorrow.",
          });
          return;
        }
        const playback = info as PlaybackInfo;
        setState({ kind: "playing", info: playback });
        await attachHls(playback);
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: extractErrorMessage(e, "Failed to load video") });
      }
    };

    load();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {
          /* ignore */
        }
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  async function attachHls(info: PlaybackInfo) {
    const el = videoRef.current;
    if (!el) return;
    const manifestUrl = absolutize(info.manifest_url);

    // Native HLS (Safari, iOS) — the OS handles ABR; no custom level menu there.
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = manifestUrl;
      return;
    }

    const Hls = (await import("hls.js")).default;
    if (!Hls.isSupported()) {
      setState({ kind: "error", message: "HLS playback is not supported by this browser." });
      return;
    }

    // Tuned for smooth playback on POOR networks:
    //  - startLevel -1: let ABR pick a safe starting quality from measured bandwidth
    //  - maxBufferLength 60s: buffer ahead aggressively so brief drops don't stall
    //  - capLevelToPlayerSize: don't waste bandwidth on a resolution bigger than the player
    //  - fragLoadingMaxRetry / manifestLoadingMaxRetry: survive transient network errors
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      startLevel: -1,
      capLevelToPlayerSize: true,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      backBufferLength: 30,
      fragLoadingMaxRetry: 6,
      fragLoadingMaxRetryTimeout: 8000,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      xhrSetup: (xhr: XMLHttpRequest) => {
        xhr.withCredentials = true;
      },
    });
    hlsRef.current = hls;
    hls.loadSource(manifestUrl);
    hls.attachMedia(el);

    hls.on(Hls.Events.MANIFEST_PARSED, (_e: unknown, data: any) => {
      // Build the quality menu from the available renditions, highest first.
      const lv: QualityLevel[] = (data.levels || [])
        .map((l: any, i: number) => ({
          index: i,
          height: l.height || 0,
          label: l.height ? `${l.height}p` : `Level ${i + 1}`,
        }))
        .sort((a: QualityLevel, b: QualityLevel) => b.height - a.height);
      setLevels(lv);
    });

    // Reflect which rendition ABR (or the user) is currently playing.
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e: unknown, data: any) => {
      const lvl = hls.levels?.[data.level];
      if (lvl) setActiveHeight(lvl.height || null);
    });

    hls.on(Hls.Events.ERROR, async (_event: unknown, data: any) => {
      if (!data.fatal) return;
      // Network error → token likely expired. Re-fetch playback-info and re-attach.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        try {
          const fresh = await fetchPlaybackInfo(videoId);
          if ((fresh as PlaybackInfo).manifest_url) {
            hls.destroy();
            hlsRef.current = null;
            const playback = fresh as PlaybackInfo;
            setState({ kind: "playing", info: playback });
            await attachHls(playback);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      // Media error → try to recover in place before giving up.
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        try {
          hls.recoverMediaError();
          return;
        } catch {
          /* ignore */
        }
      }
      setState({ kind: "error", message: "Playback error — refresh the page to try again." });
      try {
        hls.destroy();
      } catch {
        /* ignore */
      }
      hlsRef.current = null;
    });
  }

  const selectQuality = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (hls) {
      // -1 tells hls.js to resume automatic adaptive switching.
      hls.currentLevel = levelIndex;
      // For a snappier manual switch, also set the next/load level.
      if (levelIndex !== -1) hls.loadLevel = levelIndex;
    }
    setCurrentLevel(levelIndex);
    setMenuOpen(false);
  };

  const watermarkText =
    watermarkOverride ||
    (state.kind === "playing" ? state.info.watermark_email : "");

  const cornerClasses =
    watermarkCorner === "bottom-right" ? "bottom-3 right-3" : "top-3 right-3";

  const currentLabel =
    currentLevel === -1
      ? `Auto${activeHeight ? ` (${activeHeight}p)` : ""}`
      : levels.find((l) => l.index === currentLevel)?.label || "Auto";

  return (
    <div className={cn("relative w-full bg-black rounded-xl overflow-hidden aspect-video", className)}>
      {state.kind === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-white/70 text-body-sm">
          Loading video…
        </div>
      )}

      {state.kind === "pending" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <span className="icon text-white/70 text-[40px]">hourglass_empty</span>
            <p className="text-white/90 font-medium mt-2">Pending optimization</p>
            <p className="text-white/60 text-body-sm mt-1 max-w-sm mx-auto">{state.message}</p>
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <span className="icon text-danger text-[40px]">error</span>
            <p className="text-white/90 font-medium mt-2">Can't play this video</p>
            <p className="text-white/60 text-body-sm mt-1 max-w-sm mx-auto">{state.message}</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        controls
        playsInline
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
        crossOrigin="use-credentials"
        className={cn(
          "w-full h-full",
          state.kind === "playing" ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      {/* Quality selector — only shown when there's more than one rendition */}
      {state.kind === "playing" && levels.length > 1 && (
        <div className="absolute bottom-14 right-3 z-10">
          {menuOpen && (
            <div className="mb-2 min-w-[120px] rounded-lg bg-black/85 backdrop-blur-sm border border-white/10 overflow-hidden shadow-lg">
              <button
                onClick={() => selectQuality(-1)}
                className={cn(
                  "w-full text-left px-3 py-2 text-[13px] hover:bg-white/10 transition-colors flex items-center justify-between gap-2",
                  currentLevel === -1 ? "text-primary font-semibold" : "text-white/90"
                )}
              >
                Auto
                {currentLevel === -1 && <span className="icon text-[16px]">check</span>}
              </button>
              {levels.map((l) => (
                <button
                  key={l.index}
                  onClick={() => selectQuality(l.index)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[13px] hover:bg-white/10 transition-colors flex items-center justify-between gap-2",
                    currentLevel === l.index ? "text-primary font-semibold" : "text-white/90"
                  )}
                >
                  {l.label}
                  {currentLevel === l.index && <span className="icon text-[16px]">check</span>}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white text-[12px] font-medium border border-white/10 transition-colors"
            title="Video quality"
          >
            <span className="icon text-[16px]">settings</span>
            {currentLabel}
          </button>
        </div>
      )}

      {/* Watermark overlay — fixed corner, semi-transparent, mix-blend so it stays visible on any frame */}
      {state.kind === "playing" && watermarkText && (
        <div
          className={cn(
            "pointer-events-none select-none absolute px-2.5 py-1 rounded-md font-mono text-[12px] text-white",
            cornerClasses
          )}
          style={{
            mixBlendMode: "difference",
            opacity: 0.55,
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          {watermarkText}
        </div>
      )}
    </div>
  );
}
