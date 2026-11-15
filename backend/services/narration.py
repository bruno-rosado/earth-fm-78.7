"""Render narration once; the browser adjusts the resulting audio continuously.

macOS uses its installed system voice. Linux can use espeak-ng or espeak.
Text is passed on stdin, never interpreted as shell arguments or code.
"""
import hashlib
import io
import logging
import shutil
import subprocess
import sys
import tempfile
import threading
import wave
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "narration"
MAX_ENTRIES = 16
MAX_TEXT = 6000
MAX_AUDIO_BYTES = 24 * 1024 * 1024
VERSION = 1
_lock = threading.Lock()
logger = logging.getLogger(__name__)


class NarrationUnavailable(Exception):
    pass


def _engine():
    if sys.platform == "darwin" and Path("/usr/bin/say").is_file():
        return "say", "/usr/bin/say"
    for name in ("espeak-ng", "espeak"):
        executable = shutil.which(name)
        if executable:
            return name, executable
    raise NarrationUnavailable("Audio narration needs a system voice on the server: macOS say, or espeak-ng on Linux. The written transcript is still available.")


def _valid_audio(data):
    if not 44 <= len(data) <= MAX_AUDIO_BYTES:
        return False
    try:
        with wave.open(io.BytesIO(data)) as audio:
            valid = (audio.getcomptype() == "NONE" and audio.getnchannels() in (1, 2)
                     and audio.getsampwidth() in (1, 2, 3, 4) and audio.getframerate() > 0
                     and audio.getnframes() > 0 and audio.getnframes() / audio.getframerate() <= 600)
            return valid and len(audio.readframes(audio.getnframes())) == audio.getnframes() * audio.getnchannels() * audio.getsampwidth()
    except (wave.Error, EOFError, ValueError):
        return False


def _render(text, engine, executable):
    with tempfile.TemporaryDirectory(prefix="earth-fm-narration-") as directory:
        output = Path(directory) / "voice.wav"
        if engine == "say":
            command = [executable, "-r", "175", "--file-format=WAVE", "--data-format=LEI16@22050", "-o", str(output)]
        else:
            command = [executable, "--stdin", "-s", "175", "-w", str(output)]
        try:
            subprocess.run(command, input=text, text=True, capture_output=True, timeout=45, check=True)
            data = output.read_bytes()
        except (OSError, subprocess.SubprocessError):
            raise NarrationUnavailable("The server could not prepare narration. The written transcript is still available.") from None
        if not _valid_audio(data):
            raise NarrationUnavailable("The system voice did not return playable narration. The written transcript is still available.")
        return data


def render_narration(content):
    text = " ".join(content.split())
    if not text or len(text) > MAX_TEXT:
        raise ValueError(f"Narration must contain 1–{MAX_TEXT} characters.")
    engine, executable = _engine()
    key = hashlib.sha256(f"{VERSION}:{engine}:{text}".encode()).hexdigest()
    with _lock:
        cached = CACHE_DIR / f"{key}.wav"
        try:
            data = cached.read_bytes()
            if _valid_audio(data):
                try:
                    cached.touch()
                except OSError:
                    pass
                return data
        except OSError:
            pass
        data = _render(text, engine, executable)
        temporary = None
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            # The rendering lock serializes publication and bounded cache cleanup.
            with tempfile.NamedTemporaryFile(dir=CACHE_DIR, suffix=".tmp", delete=False) as file:
                temporary = Path(file.name)
                file.write(data)
            temporary.replace(cached)
            files = sorted(CACHE_DIR.glob("*.wav"), key=lambda path: path.stat().st_mtime, reverse=True)
            for old in files[MAX_ENTRIES:]:
                old.unlink(missing_ok=True)
        except OSError:
            logger.warning("Narration could not be cached; serving the rendered audio directly.")
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass
        return data
