"""Import a NASA visualization as a track: download its movie and thumbnail,
extract features, and add it to the library. Work runs on one background
thread; the API polls job status.

tracks.json is the catalog shipped with the repo. Imported tracks go to
library.json in the same shape (metadata, features, summary), which is ignored by git along with their media, so each machine
has its own library and never commits hundreds of megabytes of video."""

import json
import logging
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import NamedTemporaryFile

import httpx2 as httpx

from . import nasa
from .music_config import summarize_features

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
MEDIA_DIR = BACKEND_DIR / "media"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
from pipeline.extract import extract_features, video_duration  # noqa: E402
from pipeline.transcode import transcode  # noqa: E402

logger = logging.getLogger(__name__)

MAX_DURATION = 8 * 60  # seconds; longer videos take too long to analyze

_jobs = {}
_jobs_lock = threading.Lock()
_tracks_lock = threading.Lock()
_worker = ThreadPoolExecutor(max_workers=1)  # feature extraction is CPU-heavy


class ImportFailed(Exception):
    pass


def track_id_for(nasa_id):
    return f"svs{nasa_id}"


def _read(name):
    path = DATA_DIR / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def _has_media(track):
    video = track.get("video", "")
    return not video.startswith("/media/") or (MEDIA_DIR / video[len("/media/"):]).exists()


def read_tracks():
    """Shipped catalog plus this machine's imports, skipping tracks whose video is missing."""
    with _tracks_lock:
        return [t for t in _read("tracks.json") + _read("library.json") if _has_media(t)]


def _write_json(path, value, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as file:
        if pretty:
            json.dump(value, file, indent=2)
        else:
            json.dump(value, file, separators=(",", ":"))
        file.write("\n")
        temporary = Path(file.name)
    temporary.chmod(0o644)  # temp files are private by default
    temporary.replace(path)


def _upsert_track(track):
    with _tracks_lock:
        library = [t for t in _read("library.json") if t["id"] != track["id"]]
        library.append(track)
        _write_json(DATA_DIR / "library.json", library, pretty=True)


def find_track(nasa_id):
    return next((t for t in read_tracks() if t.get("nasa_id") == nasa_id), None)


def remove(track_id):
    """Delete an imported track and its files. Catalog tracks can't be removed."""
    with _tracks_lock:
        library = _read("library.json")
        track = next((t for t in library if t["id"] == track_id), None)
        if track is None:
            return False
        _write_json(DATA_DIR / "library.json", [t for t in library if t["id"] != track_id], pretty=True)
    for url in (track.get("video"), track.get("cover")):
        if isinstance(url, str) and url.startswith("/media/"):
            (MEDIA_DIR / url[len("/media/"):]).unlink(missing_ok=True)
    return True


def public(job):
    return {key: job[key] for key in ("id", "nasa_id", "status", "progress", "message", "track")}


def get_job(job_id):
    with _jobs_lock:
        job = _jobs.get(job_id)
    return public(job) if job else None


def start(nasa_id):
    """Return a job for this visualization, reusing one already running."""
    track = find_track(nasa_id)
    with _jobs_lock:
        for job in _jobs.values():
            if job["nasa_id"] == nasa_id and job["status"] not in ("done", "error"):
                return public(job)
        job = {"id": uuid.uuid4().hex[:12], "nasa_id": nasa_id, "status": "queued", "progress": 0.0,
               "message": "Waiting to start", "track": track}
        _jobs[job["id"]] = job
    if track:
        _update(job, status="done", progress=1.0, message="Already in your library")
    else:
        _worker.submit(_run, job)
    return public(job)


def _update(job, **changes):
    with _jobs_lock:
        job.update(changes)


def _download(url, destination, job, phase_message):
    size = nasa.content_length(url)
    if size and size > nasa.MAX_BYTES:
        raise ImportFailed(f"That video is {size // 1_000_000} MB, over the {nasa.MAX_BYTES // 1_000_000} MB limit.")
    received = 0
    try:
        with httpx.stream("GET", url, timeout=60, follow_redirects=True) as response:
            response.raise_for_status()
            with NamedTemporaryFile("wb", dir=destination.parent, suffix=".part", delete=False) as file:
                temporary = Path(file.name)
                for chunk in response.iter_bytes(1 << 18):
                    file.write(chunk)
                    received += len(chunk)
                    if received > nasa.MAX_BYTES:
                        raise ImportFailed("That video is too large to import.")
                    if size:
                        _update(job, progress=received / size, message=f"{phase_message} {received // 1_000_000} / {size // 1_000_000} MB")
        temporary.chmod(0o644)
        temporary.replace(destination)
    except httpx.HTTPError:
        raise ImportFailed("The download from NASA failed. Try again.") from None
    finally:
        for leftover in destination.parent.glob("*.part"):
            leftover.unlink(missing_ok=True)


def _optimize(source, destination, job):
    """Shrink the download to a light H.264 mp4. On any failure keep the original."""
    _update(job, status="transcoding", progress=0.0, message="Optimizing video for playback")
    try:
        transcode(source, destination, video_duration(source),
                  progress=lambda f: _update(job, progress=f, message=f"Optimizing video for playback {f:.0%}"))
    except Exception as error:  # noqa: BLE001 - the original still works
        logger.warning("Could not transcode %s, keeping the original: %s", source.name, error)
        return source
    if source != destination:
        source.unlink(missing_ok=True)
    return destination


def _run(job):
    nasa_id = job["nasa_id"]
    track_id = track_id_for(nasa_id)
    try:
        _update(job, status="downloading", message="Reading NASA's catalog")
        card = nasa.card(nasa_id)
        if card is None:
            raise ImportFailed("That visualization has no downloadable video.")
        video_path = MEDIA_DIR / f"{track_id}.{card['video']['format']}"
        cover_path = MEDIA_DIR / f"{track_id}_cover.jpg"
        _download(card["video"]["url"], video_path, job, "Downloading")
        try:
            # Reuse the resized thumbnail as the track cover.
            cover_path.write_bytes(nasa.thumbnail_file(nasa_id).read_bytes())
            cover_path.chmod(0o644)
        except (nasa.NasaError, OSError):
            cover_path = None

        video_path = _optimize(video_path, MEDIA_DIR / f"{track_id}.mp4", job)
        duration = video_duration(video_path)
        if duration > MAX_DURATION:
            video_path.unlink(missing_ok=True)
            raise ImportFailed(f"That video is {duration / 60:.0f} minutes long; the limit is {MAX_DURATION // 60}.")
        _update(job, status="analyzing", progress=0.0, message="Analyzing the video")
        features = extract_features(video_path, progress=lambda f: _update(job, progress=f, message=f"Analyzing the video {f:.0%}"))
        track = {
            "id": track_id,
            "nasa_id": nasa_id,
            "title": card["title"],
            "description": card["description"],
            "cover": f"/media/{cover_path.name}" if cover_path else None,
            "video": f"/media/{video_path.name}",
            "duration": round(duration, 3),
            "source": card["source"],
        }
        summary = summarize_features(features)
        track.update(features=features, summary=summary)
        _upsert_track(track)
        _update(job, status="done", progress=1.0, message="Ready to play", track=track)
    except (ImportFailed, nasa.NasaError, ValueError, OSError) as error:
        _update(job, status="error", message=str(error) or "Import failed")
    except Exception:  # noqa: BLE001 - never leave a job stuck in "analyzing"
        _update(job, status="error", message="Import failed unexpectedly.")
        raise

