import { useEffect, useRef, useState } from "react";
import { absoluteApiUrl, extractErrorMessage } from "@/lib/api";
import { fetchPlaybackInfo, type PlaybackInfo, type PendingPlayback } from "@/services/video.service";
import { cn } from "@/lib/utils";

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
  // Monotonic "generation" of the active load. Each effect run bumps it; the
  // cleanup bumps it again to invalidate any in-flight async work. attachHls and
  // its async error handler capture their generation and bail the moment it no
  // longer matches — so they never setState after unmount or touch a destroyed
  // hls.js instance (the stale-closure race).
  const loadIdRef = useRef(0);

  useEffect(() => {
    const myId = ++loadIdRef.current;
    const isCurrent = () => loadIdRef.current === myId;
    setState({ kind: "loading" });
    retryCountRef.current = 0;

    const load = async () => {
      try {
        const info = await fetchPlaybackInfo(videoId);
        if (!isCurrent()) return;
        if ((info as PendingPlayback).status && (info as PendingPlayback).status !== "ready") {
          const pending = info as PendingPlayback;
          setState({
            kind: "pending",
            message: pending.message || "Video is still being optimized — try again shortly.",
          });
          return;
        }
        const playback = info as PlaybackInfo;
        setState({ kind: "playing", info: playback });
        await attachHls(playback, myId);
      } catch (e) {
        if (isCurrent()) setState({ kind: "error", message: extractErrorMessage(e, "Failed to load video") });
      }
    };

    load();

    return () => {
      loadIdRef.current++; // invalidate this load generation
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

  async function attachHls(info: PlaybackInfo, loadId: number) {
    const isCurrent = () => loadIdRef.current === loadId;
    const el = videoRef.current;
    if (!el || !isCurrent()) return;
    const manifestUrl = absoluteApiUrl(info.manifest_url);

    // Native HLS (Safari, iOS) — the OS plays the stream directly.
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = manifestUrl;
      return;
    }

    const Hls = (await import("hls.js")).default;
    if (!isCurrent()) return; // unmounted/changed during the dynamic import
    if (!Hls.isSupported()) {
      if (isCurrent()) setState({ kind: "error", message: "HLS playback is not supported by this browser." });
      return;
    }

    // Every video is a single 720p rendition, so there is no quality ladder to manage.
    // Buffer settings are tuned to keep playback smooth on poor networks.
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
      backBufferLength: 30,
      fragLoadingMaxRetry: 6,
      fragLoadingMaxRetryTimeout: 8000,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      xhrSetup: (xhr: XMLHttpRequest) => {
        // Same-origin cookie auth for the playlist gate (segments are signed).
        xhr.withCredentials = true;
      },
    });
    if (!isCurrent()) {
      // The effect was cleaned up while we awaited the import — don't leak.
      try {
        hls.destroy();
      } catch {
        /* ignore */
      }
      return;
    }
    hlsRef.current = hls;
    hls.loadSource(manifestUrl);
    hls.attachMedia(el);

    hls.on(Hls.Events.ERROR, async (_event: unknown, data: any) => {
      // Ignore everything once this load is stale or this isn't the live instance.
      if (!isCurrent() || hlsRef.current !== hls || !data.fatal) return;
      // Network error → segment URLs likely rotated/expired. Re-fetch the
      // playlist (re-authorized) and re-attach with fresh signed URLs.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        try {
          const fresh = await fetchPlaybackInfo(videoId);
          if (!isCurrent() || hlsRef.current !== hls) return;
          if ((fresh as PlaybackInfo).manifest_url) {
            try {
              hls.destroy();
            } catch {
              /* ignore */
            }
            hlsRef.current = null;
            const playback = fresh as PlaybackInfo;
            setState({ kind: "playing", info: playback });
            await attachHls(playback, loadId);
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
      if (isCurrent()) {
        setState({ kind: "error", message: "Playback error — refresh the page to try again." });
      }
      try {
        hls.destroy();
      } catch {
        /* ignore */
      }
      if (hlsRef.current === hls) hlsRef.current = null;
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
