from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from app.core.config import settings


@dataclass(frozen=True)
class Rendition:
    name: str              # always "720p" — the single quality students receive
    height: int            # actual encoded height (≤ 720; we never upscale)
    bitrate_kbps: int      # used as the MAX bitrate cap (-maxrate), not a fixed target
    audio_kbps: int
    crf: int               # quality target: lower = better quality + bigger; 23 ≈ visually lossless


# Single-quality policy: every upload is normalised to ONE 720p HLS rendition.
#   - CRF makes the encoder spend only as many bits as the content needs to hit the
#     target quality, and -maxrate caps the peak so a high-bitrate source can't blow
#     past the rung (a 1080p/4K upload is compressed down to ~720p bandwidth).
#   - A source already at/under 720p is re-encoded at its own height. We never upscale
#     (e.g. a 480p upload stays 480p) because upscaling only inflates file size and
#     adds zero real detail.
TARGET_HEIGHT = 720
VIDEO_MAXRATE_KBPS = 2800
AUDIO_KBPS = 96
CRF = 23


def rendition_for(source_height: int) -> Rendition:
    """The single 720p rendition, capped to the source height (never upscale)."""
    height = TARGET_HEIGHT if source_height <= 0 else min(TARGET_HEIGHT, source_height)
    height -= height % 2          # libx264 / yuv420p require even dimensions
    if height <= 0:
        height = TARGET_HEIGHT
    return Rendition(
        name="720p",
        height=height,
        bitrate_kbps=VIDEO_MAXRATE_KBPS,
        audio_kbps=AUDIO_KBPS,
        crf=CRF,
    )


# Hardware-encoder device nodes. VAAPI (AMD/Intel) exposes a render node under
# /dev/dri; NVIDIA exposes /dev/nvidia0. A present node is necessary but not
# sufficient — ffmpeg must also be built with the matching encoder.
VAAPI_DEVICE = "/dev/dri/renderD128"
NVIDIA_DEVICE = "/dev/nvidia0"


@lru_cache(maxsize=None)
def _ffmpeg_has_encoder(name: str) -> bool:
    """True if `ffmpeg -encoders` lists the given encoder (e.g. 'h264_vaapi')."""
    try:
        out = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10
        )
        return name in (out.stdout + out.stderr)
    except (FileNotFoundError, subprocess.SubprocessError):
        return False


def _vaapi_available() -> bool:
    """AMD/Intel hardware H.264 via VAAPI: render node present AND ffmpeg built with it."""
    return os.path.exists(VAAPI_DEVICE) and _ffmpeg_has_encoder("h264_vaapi")


def _nvenc_available() -> bool:
    """NVIDIA hardware H.264 via NVENC: device present AND ffmpeg built with it."""
    return os.path.exists(NVIDIA_DEVICE) and _ffmpeg_has_encoder("h264_nvenc")


@lru_cache(maxsize=1)
def select_encoder() -> str:
    """Choose the H.264 encoder. Returns one of 'vaapi' | 'nvenc' | 'libx264'.

    GPU-FIRST by design — the GPU does the work whenever it's reachable, and the
    CPU (libx264) is reserved as a fallback. Driven by settings.VIDEO_ENCODER:

      - 'auto' (default): prefer AMD/Intel VAAPI, then NVIDIA NVENC, else CPU.
                          A GPU encoder is chosen only when its device + ffmpeg
                          support are actually present, so a CPU-only box (e.g. a
                          Linux container under Docker Desktop on Windows) goes
                          straight to libx264 — no wasted failed attempt.
      - 'vaapi'/'nvenc' : FORCE that GPU encoder (recommended in production so the
                          GPU always does the work). Selection does NOT pre-check
                          the device; run_encode() still falls back to libx264 at
                          runtime if the GPU encode fails, so a transient GPU
                          issue can never drop a video.
      - 'cpu'           : force libx264.

    Cached for the worker process lifetime.
    """
    pref = (settings.VIDEO_ENCODER or "auto").strip().lower()
    if pref == "cpu":
        return "libx264"
    if pref in ("vaapi", "nvenc"):
        return pref
    # auto — GPU-first detection with CPU fallback.
    if _vaapi_available():
        return "vaapi"
    if _nvenc_available():
        return "nvenc"
    return "libx264"


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@dataclass
class ProbeResult:
    duration_seconds: int
    height: int
    has_video: bool
    has_audio: bool


def ffprobe(source_path: str) -> ProbeResult:
    """Returns duration + max video stream height. Raises RuntimeError on failure."""
    if not ffmpeg_available():
        raise RuntimeError("ffmpeg/ffprobe not installed")
    proc = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-print_format", "json",
            "-show_format", "-show_streams",
            source_path,
        ],
        capture_output=True, text=True, timeout=60
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {proc.stderr.strip()[:500]}")
    data = json.loads(proc.stdout or "{}")
    streams = data.get("streams") or []
    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    height = 0
    for s in video_streams:
        try:
            h = int(s.get("height") or 0)
            if h > height:
                height = h
        except (TypeError, ValueError):
            continue
    fmt = data.get("format") or {}
    try:
        duration = int(float(fmt.get("duration") or 0))
    except (TypeError, ValueError):
        duration = 0
    return ProbeResult(
        duration_seconds=duration,
        height=height,
        has_video=bool(video_streams),
        has_audio=bool(audio_streams),
    )


def build_hls_command(source: str, out_dir: str, rendition: Rendition, encoder: str, has_audio: bool) -> list[str]:
    """Single ffmpeg invocation producing master.m3u8 + one 720p variant playlist.

    `encoder` is one of 'vaapi' | 'nvenc' | 'libx264' (see select_encoder). One
    decode pass, one scaled output. The master playlist is kept (with a single
    entry) so the student streaming path — manifest → variant → segment — stays
    byte-for-byte identical regardless of which encoder produced it.
    """
    cmd: list[str] = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning"]

    if encoder == "vaapi":
        # Bind the AMD/Intel render node for hardware scale + encode.
        cmd += ["-vaapi_device", VAAPI_DEVICE]

    cmd += ["-i", source, "-map", "0:v:0"]
    if has_audio:
        cmd += ["-map", "0:a:0?"]

    if encoder == "vaapi":
        # AMD/Intel hardware H.264. Upload frames to the GPU as NV12, scale on the
        # GPU, encode with h264_vaapi. VBR with a target just under the cap keeps
        # the 720p stream streaming-friendly while -maxrate/-bufsize bound the peak
        # so a high-bitrate source can't blow past the rung. No -pix_fmt yuv420p:
        # the frames live on GPU surfaces, not in software pixel formats.
        cmd += ["-vf", f"format=nv12,hwupload,scale_vaapi=-2:{rendition.height}"]
        cmd += [
            "-c:v", "h264_vaapi",
            "-rc_mode", "VBR",
            "-b:v", f"{int(rendition.bitrate_kbps * 0.85)}k",
            "-maxrate", f"{rendition.bitrate_kbps}k",
            "-bufsize", f"{rendition.bitrate_kbps * 2}k",
        ]
    elif encoder == "nvenc":
        # NVIDIA hardware H.264: constant-quality (-cq mirrors CRF), capped by -maxrate.
        cmd += ["-vf", f"scale=-2:{rendition.height}"]
        cmd += [
            "-c:v", "h264_nvenc",
            "-preset", "p4",
            "-rc", "vbr",
            "-cq", str(rendition.crf),
            "-b:v", "0",
            "-maxrate", f"{rendition.bitrate_kbps}k",
            "-bufsize", f"{rendition.bitrate_kbps * 2}k",
            "-pix_fmt", "yuv420p",
        ]
    else:
        # libx264 (CPU): CRF quality target, capped by -maxrate so we never exceed
        # the rung. Thread-capped so a daytime encode can't grab both cores and
        # starve the API on a 2 vCPU box.
        cmd += ["-vf", f"scale=-2:{rendition.height}"]
        cmd += [
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", str(rendition.crf),
            "-maxrate", f"{rendition.bitrate_kbps}k",
            "-bufsize", f"{rendition.bitrate_kbps * 2}k",
            "-threads", str(max(1, settings.FFMPEG_THREADS)),
            "-pix_fmt", "yuv420p",
        ]

    if has_audio:
        cmd += ["-c:a", "aac", "-b:a", f"{rendition.audio_kbps}k", "-ac", "2", "-ar", "48000"]

    var_map = f"v:0,a:0,name:{rendition.name}" if has_audio else f"v:0,name:{rendition.name}"
    seg_seconds = max(2, settings.HLS_SEGMENT_SECONDS)
    cmd += [
        "-f", "hls",
        "-hls_time", str(seg_seconds),
        "-hls_playlist_type", "vod",
        "-hls_segment_type", "mpegts",
        "-hls_flags", "independent_segments",
        "-hls_segment_filename", os.path.join(out_dir, "%v", "seg_%05d.ts"),
        "-master_pl_name", "master.m3u8",
        "-var_stream_map", var_map,
        os.path.join(out_dir, "%v", "index.m3u8"),
    ]
    return cmd


def _priority_prefix() -> list[str]:
    """Run the encoder at low CPU + IO priority so it always yields to the API
    and Postgres. nice/ionice are Linux-only; skip gracefully if unavailable
    (e.g. local non-Linux dev)."""
    prefix: list[str] = []
    if shutil.which("nice"):
        prefix += ["nice", "-n", "10"]
    if shutil.which("ionice"):
        prefix += ["ionice", "-c2", "-n7"]
    return prefix


def run_encode(source_path: str, out_dir: str, rendition: Rendition, has_audio: bool) -> str:
    """Synchronously encode the source into a single 720p HLS variant under out_dir.

    GPU-FIRST with a guaranteed CPU fallback: tries the selected encoder; if it is
    a hardware encoder (vaapi/nvenc) and ffmpeg fails or times out, the output dir
    is wiped and the encode is retried once on libx264 — so a video is NEVER
    dropped because of a GPU hiccup. Runs niced/io-throttled with a hard timeout so
    a corrupt/huge upload can't pin the worker (and the box) indefinitely.

    Returns the encoder that actually produced the output ('vaapi'|'nvenc'|'libx264').
    Raises RuntimeError(stderr) only if even the CPU fallback fails.
    """
    from shutil import rmtree

    chosen = select_encoder()
    timeout_s = max(60, settings.ENCODE_TIMEOUT_SECONDS)

    # Try the chosen encoder, then libx264 as a safety net (unless already CPU).
    attempts = [chosen] if chosen == "libx264" else [chosen, "libx264"]

    last_err = ""
    for idx, enc in enumerate(attempts):
        is_fallback = idx > 0
        # Each attempt starts from a clean output dir: a failed HW attempt may have
        # left a partial master.m3u8 / segments behind. makedirs also creates the
        # rendition subfolder ffmpeg writes into.
        rmtree(out_dir, ignore_errors=True)
        os.makedirs(os.path.join(out_dir, rendition.name), exist_ok=True)

        cmd = _priority_prefix() + build_hls_command(source_path, out_dir, rendition, enc, has_audio)
        label = enc if not is_fallback else f"{enc} (CPU fallback after {chosen} failure)"
        print(
            f"[FFMPEG] encoder={label} rendition={rendition.name}@{rendition.height}p "
            f"audio={has_audio} threads={settings.FFMPEG_THREADS} timeout={timeout_s}s"
        )
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        except subprocess.TimeoutExpired:
            last_err = f"ffmpeg timed out after {timeout_s}s — source too large/long or stalled"
            print(f"[FFMPEG] {enc} timed out after {timeout_s}s.")
            if not is_fallback and enc != "libx264":
                print("[FFMPEG] Falling back to CPU (libx264).")
            continue
        if proc.returncode == 0:
            return enc
        # Truncate to avoid massive DB strings.
        last_err = (proc.stderr or proc.stdout or "")[-2000:]
        print(f"[FFMPEG] {enc} failed (exit {proc.returncode}).")
        if not is_fallback and enc != "libx264":
            print("[FFMPEG] Falling back to CPU (libx264).")

    raise RuntimeError(f"ffmpeg failed (encoder={chosen}, CPU fallback exhausted): {last_err}")


def safe_segment_path(hls_dir: str, rendition: str, seg_name: str) -> Optional[str]:
    """Resolve rendition/seg_name inside hls_dir without allowing traversal.

    Returns absolute path if safe and exists; None otherwise.
    """
    if "/" in rendition or "\\" in rendition or ".." in rendition:
        return None
    if "/" in seg_name or "\\" in seg_name or ".." in seg_name:
        return None
    candidate = os.path.normpath(os.path.join(hls_dir, rendition, seg_name))
    base = os.path.normpath(hls_dir)
    if not candidate.startswith(base + os.sep):
        return None
    if not os.path.isfile(candidate):
        return None
    return candidate


def safe_playlist_path(hls_dir: str, name: str) -> Optional[str]:
    """Resolve a playlist file (master.m3u8 or <rendition>/index.m3u8) safely."""
    if ".." in name:
        return None
    candidate = os.path.normpath(os.path.join(hls_dir, name))
    base = os.path.normpath(hls_dir)
    if not candidate.startswith(base + os.sep):
        return None
    if not os.path.isfile(candidate):
        return None
    return candidate
