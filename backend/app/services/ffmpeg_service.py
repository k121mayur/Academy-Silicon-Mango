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


@lru_cache(maxsize=1)
def has_nvenc() -> bool:
    """Detect NVENC support. Cached for the worker process lifetime.

    True only if:
      - ENABLE_GPU is set, AND
      - /dev/nvidia0 exists, AND
      - ffmpeg reports h264_nvenc in its encoders list.
    """
    if not settings.ENABLE_GPU:
        return False
    if not os.path.exists("/dev/nvidia0"):
        return False
    try:
        out = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10
        )
        return "h264_nvenc" in (out.stdout + out.stderr)
    except (FileNotFoundError, subprocess.SubprocessError):
        return False


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


def build_hls_command(source: str, out_dir: str, rendition: Rendition, use_nvenc: bool, has_audio: bool) -> list[str]:
    """Single ffmpeg invocation producing master.m3u8 + one 720p variant playlist.

    One decode pass, one scaled output. The master playlist is kept (with a single
    entry) so the student streaming path — manifest → variant → segment — stays
    byte-for-byte identical regardless of how many qualities exist.
    """
    codec = "h264_nvenc" if use_nvenc else "libx264"

    cmd: list[str] = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-i", source]
    cmd += ["-map", "0:v:0"]
    if has_audio:
        cmd += ["-map", "0:a:0?"]

    cmd += ["-vf", f"scale=-2:{rendition.height}"]
    if use_nvenc:
        # NVENC: constant-quality (-cq mirrors CRF), capped by -maxrate.
        cmd += [
            "-c:v", codec,
            "-preset", "p4",
            "-rc", "vbr",
            "-cq", str(rendition.crf),
            "-b:v", "0",
            "-maxrate", f"{rendition.bitrate_kbps}k",
            "-bufsize", f"{rendition.bitrate_kbps * 2}k",
        ]
    else:
        # libx264: CRF quality target, capped by -maxrate so we never exceed the rung.
        cmd += [
            "-c:v", codec,
            "-preset", "veryfast",
            "-crf", str(rendition.crf),
            "-maxrate", f"{rendition.bitrate_kbps}k",
            "-bufsize", f"{rendition.bitrate_kbps * 2}k",
            # Cap CPU encoder threads so a daytime encode can't grab both cores
            # and starve the API on a 2 vCPU box.
            "-threads", str(max(1, settings.FFMPEG_THREADS)),
        ]
    cmd += ["-pix_fmt", "yuv420p"]

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


def run_encode(source_path: str, out_dir: str, rendition: Rendition, has_audio: bool) -> None:
    """Synchronously encode the source into a single 720p HLS variant under out_dir.

    Runs the encoder niced/io-throttled and with a hard timeout so a corrupt or
    huge upload can't pin the worker (and the box) indefinitely.

    Raises RuntimeError(stderr) on non-zero exit or timeout.
    """
    # makedirs creates out_dir as well as the rendition subfolder ffmpeg writes into.
    os.makedirs(os.path.join(out_dir, rendition.name), exist_ok=True)

    use_nvenc = has_nvenc()
    cmd = _priority_prefix() + build_hls_command(source_path, out_dir, rendition, use_nvenc, has_audio)
    timeout_s = max(60, settings.ENCODE_TIMEOUT_SECONDS)
    print(
        f"[FFMPEG] encoder={'NVENC' if use_nvenc else 'libx264'} "
        f"rendition={rendition.name}@{rendition.height}p audio={has_audio} "
        f"threads={settings.FFMPEG_THREADS} timeout={timeout_s}s"
    )
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
    except subprocess.TimeoutExpired:
        raise RuntimeError(
            f"ffmpeg timed out after {timeout_s}s — source too large/long or stalled"
        )
    if proc.returncode != 0:
        # Truncate to avoid massive DB strings
        err = (proc.stderr or proc.stdout or "")[-2000:]
        raise RuntimeError(f"ffmpeg failed (exit {proc.returncode}): {err}")


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
