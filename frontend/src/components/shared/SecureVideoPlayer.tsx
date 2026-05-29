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

  // Fetch playback info + spin up hls.js
  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
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

    // Native HLS (Safari, iOS)
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = manifestUrl;
      return;
    }

    // hls.js for everyone else — lazy-imported to keep the main bundle small
    const Hls = (await import("hls.js")).default;
    if (!Hls.isSupported()) {
      setState({ kind: "error", message: "HLS playback is not supported by this browser." });
      return;
    }
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 30,
      // Send cookies on all variant/segment requests
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
      },
    });
    hlsRef.current = hls;
    hls.loadSource(manifestUrl);
    hls.attachMedia(el);
    hls.on(Hls.Events.ERROR, async (_event, data) => {
      if (data.fatal) {
        // Token likely expired — re-fetch playback-info once and re-attach
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryCountRef.current < 2) {
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
        setState({ kind: "error", message: "Playback error — refresh the page to try again." });
        try {
          hls.destroy();
        } catch {
          /* ignore */
        }
        hlsRef.current = null;
      }
    });
  }

  const watermarkText =
    watermarkOverride ||
    (state.kind === "playing" ? state.info.watermark_email : "");

  const cornerClasses =
    watermarkCorner === "bottom-right" ? "bottom-3 right-3" : "top-3 right-3";

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
