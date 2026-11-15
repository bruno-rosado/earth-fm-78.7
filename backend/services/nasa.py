"""NASA Scientific Visualization Studio (SVS) API client.

Search returns titles only, so cards are built by fetching each visualization's
detail page and picking a playable movie plus a thumbnail from it.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import cv2
import httpx2 as httpx
import numpy as np

API = "https://svs.gsfc.nasa.gov/api"
HOST = "svs.gsfc.nasa.gov"
TIMEOUT = 20
CACHE_SECONDS = 600
# Result types that are videos. Galleries, images, and interactives are skipped.
VIDEO_TYPES = {"Visualization", "Animation", "Produced Video", "Hyperwall Visual", "B-Roll"}
MIN_WIDTH = 960  # smallest movie that still looks good wrapped on the globe
MAX_BYTES = 400 * 1024 * 1024
EXTENSION_RANK = {"mp4": 0, "m4v": 0, "mov": 1, "webm": 2}
THUMB_DIR = Path(__file__).resolve().parents[1] / "data" / "thumbs"
THUMB_WIDTH = 640

_cache = {}
_cache_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=8)


class NasaError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


def nasa_url(url):
    if not isinstance(url, str):
        raise NasaError(502, "NASA metadata is missing an asset URL")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.hostname != HOST:
        raise NasaError(502, f"Unexpected NASA asset URL: {url}")
    return parsed._replace(scheme="https").geturl()


def _cached(key, compute):
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]
    value = compute()
    with _cache_lock:
        _cache[key] = (now + CACHE_SECONDS, value)
    return value


def _get_json(url, params=None):
    try:
        response = httpx.get(url, params=params, timeout=TIMEOUT, follow_redirects=True)
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException:
        raise NasaError(504, "NASA's visualization service timed out. Try again.") from None
    except (httpx.HTTPError, ValueError):
        raise NasaError(502, "Could not reach NASA's visualization service.") from None


def details(nasa_id):
    """Full SVS record for one visualization, cached."""
    data = _cached(("details", nasa_id), lambda: _get_json(f"{API}/{nasa_id}"))
    if not isinstance(data, dict) or not isinstance(data.get("title"), str):
        raise NasaError(404, f"NASA visualization {nasa_id} was not found")
    return data


def _movies(group):
    return [
        item["instance"] for item in group.get("items", [])
        if isinstance(item.get("instance"), dict) and item["instance"].get("media_type") == "Movie"
    ]


def _video_groups(data):
    """Media groups that contain movies, main video player first."""
    groups = [group for group in data.get("media_groups", []) if _movies(group)]
    groups.sort(key=lambda group: 0 if group.get("widget") == "Video player" else 1)
    return groups


def _extension(asset):
    return str(asset.get("filename", "")).rsplit(".", 1)[-1].lower()


def choose_movie(group):
    """Smallest movie that is still at least MIN_WIDTH wide; mp4 before webm."""
    movies = [m for m in _movies(group) if isinstance(m.get("width"), int) and _extension(m) in EXTENSION_RANK]
    if not movies:
        return None
    large = [m for m in movies if m["width"] >= MIN_WIDTH]
    # Smallest of the large ones; if none is large enough, the largest available.
    sign = 1 if large else -1
    return min(large or movies, key=lambda m: (sign * m["width"], EXTENSION_RANK[_extension(m)]))


def choose_thumbnail(data, group):
    """A web-sized still from the video's group, else the page's main image."""
    images = [
        item["instance"] for item in group.get("items", [])
        if isinstance(item.get("instance"), dict) and item["instance"].get("media_type") == "Image"
        and isinstance(item["instance"].get("width"), int) and _extension(item["instance"]) in ("jpg", "jpeg", "png")
    ]
    web = [image for image in images if 300 <= image["width"] <= 1200]
    pick = max(web, key=lambda image: image["width"]) if web else (min(images, key=lambda i: i["width"]) if images else None)
    if pick is None:
        main = data.get("main_image")
        return nasa_url(main["url"]) if isinstance(main, dict) else None
    return nasa_url(pick["url"])


def card(nasa_id):
    """What the frontend needs to show a visualization and decide to import it."""
    data = details(nasa_id)
    groups = _video_groups(data)
    movie = next((m for m in (choose_movie(g) for g in groups) if m), None)
    if movie is None:
        return None
    group = next(g for g in groups if movie in _movies(g))
    video_url = nasa_url(movie["url"])
    size = _cached(("size", video_url), lambda: content_length(video_url))
    thumbnail = choose_thumbnail(data, group)
    return {
        "nasa_id": data["id"],
        "title": data["title"].strip(),
        "description": _plain(data.get("description")),
        "release_date": (data.get("release_date") or "")[:10],
        # Served resized by our own thumbnail route; NASA's previews are several MB each.
        "thumbnail": f"/api/thumbs/{data['id']}.jpg" if thumbnail else None,
        "thumbnail_source": thumbnail,
        "video": {"url": video_url, "width": movie["width"], "height": movie.get("height"),
                  "format": _extension(movie), "size_mb": round(size / 1_000_000) if size else None,
                  "too_large": bool(size and size > MAX_BYTES)},
        "source": f"https://svs.gsfc.nasa.gov/{data['id']}/",
    }


def _plain(text):
    if not isinstance(text, str):
        return ""
    out, skip = [], False
    for char in text:
        if char == "<":
            skip = True
        elif char == ">":
            skip = False
        elif not skip:
            out.append(char)
    return " ".join("".join(out).split())[:400]


def cards(nasa_ids):
    """Cards for several visualizations at once, skipping ones without video."""
    def safe(nasa_id):
        try:
            return card(nasa_id)
        except NasaError:
            return None
    return [c for c in _pool.map(safe, nasa_ids) if c]


def search(query, limit=12):
    query = " ".join(query.split())[:120]
    if not query:
        return []
    def run():
        # A few spares cover results without a usable movie; each costs a detail fetch.
        data = _get_json(f"{API}/search/", {"search": query, "limit": limit + 6})
        results = data.get("results", []) if isinstance(data, dict) else []
        ids = [r["id"] for r in results if r.get("result_type") in VIDEO_TYPES and isinstance(r.get("id"), int)]
        return cards(ids)[:limit]
    return _cached(("search", query.lower(), limit), run)


def content_length(url):
    try:
        response = httpx.head(url, timeout=TIMEOUT, follow_redirects=True)
        response.raise_for_status()
        return int(response.headers.get("content-length", 0)) or None
    except (httpx.HTTPError, ValueError):
        return None


def thumbnail_file(nasa_id):
    """Path to a cached, resized JPEG thumbnail, downloading it on first use."""
    path = THUMB_DIR / f"{nasa_id}.jpg"
    if path.exists():
        return path
    info = card(nasa_id)
    if not info or not info["thumbnail_source"]:
        raise NasaError(404, "No thumbnail for that visualization")
    try:
        response = httpx.get(info["thumbnail_source"], timeout=TIMEOUT, follow_redirects=True)
        response.raise_for_status()
        image = cv2.imdecode(np.frombuffer(response.content, np.uint8), cv2.IMREAD_COLOR)
    except httpx.HTTPError:
        raise NasaError(502, "Could not fetch the thumbnail from NASA") from None
    if image is None:
        raise NasaError(502, "NASA's thumbnail could not be decoded")
    scale = THUMB_WIDTH / image.shape[1]
    if scale < 1:
        image = cv2.resize(image, (THUMB_WIDTH, max(1, round(image.shape[0] * scale))), interpolation=cv2.INTER_AREA)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp.jpg")
    cv2.imwrite(str(temporary), image, [cv2.IMWRITE_JPEG_QUALITY, 82])
    temporary.replace(path)
    return path
