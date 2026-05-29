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
    name: str        # "480p" | "720p" | "1080p"
    height: int
    bitrate_kbps: int
    audio_kbps: int


RENDITION_LADDER: list[Rendition] = [
    Rendition(name="480p", height=480, bitrate_kbps=800, audio_kbps=64),
    Rendition(name="720p", height=720, bitrate_kbps=2500, audio_kbps=96),
    Rendition(name="1080p", height=1080, bitrate_kbps=5000, audio_kbps=128),
]


def renditions_for(source_height: int) -> list[Rendition]:
    """Pick renditions ≤ source height. Never upscale."""
    if source_height <= 0:
        return [RENDITION_LADDER[0]]
    chosen = [r for r in RENDITION_LADDER if r.height <= source_height]
    if not chosen:
        # Source is smaller than the smallest ladder rung — encode at source resolution
        # using the smallest profile's bitrate.
        chosen = [RENDITION_LADDER[0]]
    return chosen


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


def build_hls_command(source: str, out_dir: str, renditions: list[Rendition], use_nvenc: bool) -> list[str]:
    """Single ffmpeg invocation producing master.m3u8 + per-rendition variant playlists.

    Uses one decode pass with -filter_complex split to make multiple scaled outputs.
    """
    n = len(renditions)
    # filter_complex: split into N streams, scale each
    split = f"[0:v]split={n}" + "".join(f"[v{i}]" for i in range(n))
    scales = "; ".join(
        f"[v{i}]scale=-2:{r.height}[v{i}o]" for i, r in enumerate(renditions)
    )
    filter_complex = f"{split}; {scales}"

    codec = "h264_nvenc" if use_nvenc else "libx264"
    preset = "p4" if use_nvenc else "veryfast"

    cmd: list[str] = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "warning", "-i", source]
    cmd += ["-filter_complex", filter_complex]

    var_stream_parts: list[str] = []
    for i, r in enumerate(renditions):
        cmd += [
            "-map", f"[v{i}o]",
            f"-c:v:{i}", codec,
            f"-preset:v:{i}" if use_nvenc else "-preset", preset if not use_nvenc else "p4",
        ]
        # NVENC vs libx264 quality controls
        if use_nvenc:
            cmd += [
                f"-rc:v:{i}", "vbr",
                f"-b:v:{i}", f"{r.bitrate_kbps}k",
                f"-maxrate:v:{i}", f"{int(r.bitrate_kbps * 1.07)}k",
                f"-bufsize:v:{i}", f"{int(r.bitrate_kbps * 1.5)}k",
            ]
        else:
            cmd += [
                f"-b:v:{i}", f"{r.bitrate_kbps}k",
                f"-maxrate:v:{i}", f"{int(r.bitrate_kbps * 1.07)}k",
                f"-bufsize:v:{i}", f"{int(r.bitrate_kbps * 1.5)}k",
            ]
        var_stream_parts.append(f"v:{i},a:{i},name:{r.name}")

    # Replicate the audio stream once per rendition so each variant can have its own bitrate
    for i, r in enumerate(renditions):
        cmd += ["-map", "a:0?"]
    for i, r in enumerate(renditions):
        cmd += [f"-b:a:{i}", f"{r.audio_kbps}k"]
    cmd += ["-c:a", "aac", "-ac", "2", "-ar", "48000"]

    seg_seconds = max(2, settings.HLS_SEGMENT_SECONDS)
    cmd += [
        "-f", "hls",
        "-hls_time", str(seg_seconds),
        "-hls_playlist_type", "vod",
        "-hls_segment_type", "mpegts",
        "-hls_flags", "independent_segments",
        "-hls_segment_filename", os.path.join(out_dir, "%v", "seg_%05d.ts"),
        "-master_pl_name", "master.m3u8",
        "-var_stream_map", " ".join(var_stream_parts),
        os.path.join(out_dir, "%v", "index.m3u8"),
    ]
    return cmd


def run_encode(source_path: str, out_dir: str, renditions: list[Rendition]) -> None:
    """Synchronously encode the source into HLS variants under out_dir.

    Raises RuntimeError(stderr) on non-zero exit.
    """
    os.makedirs(out_dir, exist_ok=True)
    for r in renditions:
        os.makedirs(os.path.join(out_dir, r.name), exist_ok=True)

    use_nvenc = has_nvenc()
    cmd = build_hls_command(source_path, out_dir, renditions, use_nvenc)
    print(f"[FFMPEG] encoder={'NVENC' if use_nvenc else 'libx264'} renditions={[r.name for r in renditions]}")
    proc = subprocess.run(cmd, capture_output=True, text=True)
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
