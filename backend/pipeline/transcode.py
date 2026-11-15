"""Re-encode an imported video to a small H.264 file that plays smoothly in browsers."""

import subprocess
import threading
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2

MAX_WIDTH = 1280
MAX_FPS = 30
TIMEOUT = 10 * 60  # seconds


class TranscodeError(Exception):
    pass


def ffmpeg_args(ffmpeg, source, output, source_fps=0):
    args = [str(ffmpeg), "-y", "-i", str(source), "-an",
            "-vf", f"scale='min({MAX_WIDTH},iw)':-2",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if source_fps > MAX_FPS:
        args += ["-r", str(MAX_FPS)]
    return args + ["-f", "mp4", "-progress", "pipe:1", "-nostats", str(output)]


def _source_fps(path):
    capture = cv2.VideoCapture(str(path))
    try:
        return capture.get(cv2.CAP_PROP_FPS) or 0
    finally:
        capture.release()


def transcode(source, destination, duration=0, progress=None):
    """Write an optimized copy of source to destination, replacing it atomically."""
    import imageio_ffmpeg

    try:
        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:  # noqa: BLE001
        raise TranscodeError(f"ffmpeg is not available: {error}") from None
    with NamedTemporaryFile(dir=destination.parent, suffix=".tmp", delete=False) as file:
        temporary = Path(file.name)
    process = None
    try:
        process = subprocess.Popen(ffmpeg_args(ffmpeg, source, temporary, _source_fps(source)),
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        timer = threading.Timer(TIMEOUT, process.kill)
        timer.start()
        try:
            for line in process.stdout:
                if progress and duration and line.startswith("out_time_us="):
                    try:
                        progress(min(max(int(line.split("=", 1)[1]) / (duration * 1_000_000), 0.0), 1.0))
                    except ValueError:
                        pass  # ffmpeg prints N/A before the first frame
            code = process.wait()
        finally:
            timer.cancel()
        if code != 0:
            raise TranscodeError(f"ffmpeg exited with code {code}")
        temporary.chmod(0o644)
        temporary.replace(destination)
    except OSError as error:
        raise TranscodeError(str(error)) from None
    finally:
        if process and process.poll() is None:
            process.kill()
        temporary.unlink(missing_ok=True)
