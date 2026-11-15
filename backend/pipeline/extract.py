"""Extract video features and track metadata from a NASA SVS visualization."""

import argparse
import json
import math
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

import cv2
import numpy as np


INTERVAL_SECONDS = 1
COLOR_NAMES = ("red", "yellow", "green", "cyan", "blue", "magenta")
# The map is equirectangular: rows are latitude bands (north first), columns are
# longitude slices (west first). The player scans one column at a time.
GRID_ROWS = 8
GRID_COLS = 24
FLOW_WIDTH = 640


def nasa_url(url):
    if not isinstance(url, str):
        raise ValueError("NASA metadata is missing an asset URL")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or parsed.hostname != "svs.gsfc.nasa.gov":
        raise ValueError(f"Unexpected NASA asset URL: {url}")
    return parsed._replace(scheme="https").geturl()


def video_duration(video_path):
    capture = cv2.VideoCapture(str(video_path))
    try:
        if not capture.isOpened():
            raise ValueError(f"Could not open video: {video_path}")
        fps = capture.get(cv2.CAP_PROP_FPS)
        frames = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        if not all(math.isfinite(value) and value > 0 for value in (fps, frames)):
            raise ValueError(f"Could not determine video duration: {video_path}")
        return frames / fps
    finally:
        capture.release()


def extract_track(nasa_id, video_path, track_id):
    try:
        with urlopen(f"https://svs.gsfc.nasa.gov/api/{nasa_id}", timeout=30) as response:
            data = json.load(response)
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not retrieve NASA visualization {nasa_id}: {error}") from error

    if not isinstance(data, dict):
        raise ValueError(f"NASA visualization {nasa_id} returned invalid metadata")
    title = data.get("title")
    image = data.get("main_image")
    if not isinstance(title, str) or not title.strip() or not isinstance(image, dict):
        raise ValueError(f"NASA visualization {nasa_id} is missing a title or cover image")

    video_urls = set()
    for group in data.get("media_groups", []):
        for item in group.get("items", []):
            asset = item.get("instance")
            if (
                isinstance(asset, dict)
                and asset.get("media_type") == "Movie"
                and asset.get("filename") == video_path.name
            ):
                video_urls.add(nasa_url(asset.get("url")))
    if len(video_urls) != 1:
        raise ValueError(
            f"Expected one NASA video URL for {video_path.name}, found {len(video_urls)}"
        )

    return {
        "id": track_id,
        "title": title,
        "cover": nasa_url(image.get("url")),
        "video": video_urls.pop(),
        "duration": video_duration(video_path),
    }


def colored_mask(hsv):
    return (hsv[:, :, 1] >= 32) & (hsv[:, :, 2] >= 32)


def warmth(hue):
    """Map an OpenCV hue (0-179) on a blue-to-red colormap to 0 (cold) .. 1 (warm)."""
    hue = hue.astype(np.float32)
    return np.where(hue > 150, 1.0, np.clip(1 - hue / 120, 0, 1))


def cell_slices(length, count):
    edges = np.linspace(0, length, count + 1).round().astype(int)
    return [slice(start, stop) for start, stop in zip(edges, edges[1:])]


def grid_features(frame, following):
    """Per cell: [presence, temperature, raw flow speed, flow direction].

    Flow is measured between a sampled frame and the frame right after it, so it
    reflects how fast the drawn currents are moving at that moment. Speed is
    normalized across the whole video in finish_grids.
    """
    height = round(frame.shape[0] * FLOW_WIDTH / frame.shape[1])
    small = cv2.resize(frame, (FLOW_WIDTH, height), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    colored = colored_mask(hsv)
    heat = warmth(hsv[:, :, 0])
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    if following is None:
        flow = np.zeros((*gray.shape, 2), np.float32)
    else:
        next_gray = cv2.cvtColor(
            cv2.resize(following, (FLOW_WIDTH, height), interpolation=cv2.INTER_AREA),
            cv2.COLOR_BGR2GRAY,
        )
        flow = cv2.calcOpticalFlowFarneback(gray, next_gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    speed = np.hypot(flow[:, :, 0], flow[:, :, 1])

    grid = []
    for rows in cell_slices(height, GRID_ROWS):
        band = []
        for cols in cell_slices(FLOW_WIDTH, GRID_COLS):
            mask = colored[rows, cols]
            count = np.count_nonzero(mask)
            if count == 0:
                band.append([0.0, 0.0, 0.0, 0.0])
                continue
            cell_speed = float(np.mean(speed[rows, cols][mask]))
            dx = float(np.mean(flow[rows, cols, 0][mask]))
            band.append([
                count / mask.size,
                float(np.mean(heat[rows, cols][mask])),
                cell_speed,
                max(-1.0, min(1.0, dx / cell_speed)) if cell_speed > 1e-6 else 0.0,
            ])
        grid.append(band)
    return grid


def finish_grids(features):
    """Smooth flow over neighboring samples, then scale speed to 0-1.

    Single frame pairs are noisy, so speed and direction use a 1-2-1 average over
    time. Speed is divided by the 98th percentile of ocean cells, so the busiest
    currents reach 1.
    """
    grids = np.array([sample["grid"] for sample in features], dtype=np.float64)
    if len(grids) > 2:
        padded = np.concatenate([grids[:1], grids, grids[-1:]])
        grids[..., 2:] = (padded[:-2, ..., 2:] + 2 * padded[1:-1, ..., 2:] + padded[2:, ..., 2:]) / 4
    speeds = grids[..., 2][grids[..., 0] > 0]
    scale = float(np.percentile(speeds, 98)) if speeds.size else 0.0
    grids[..., 2] = np.clip(grids[..., 2] / scale, 0, 1) if scale > 0 else 0
    grids[..., 3] = np.clip(grids[..., 3], -1, 1)
    grids[grids[..., 0] == 0] = 0
    for sample, grid in zip(features, grids.round(4)):
        sample["grid"] = grid.tolist()


def frame_features(frame, previous_gray):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    colored = colored_mask(hsv)
    hue_bins = np.bincount(hsv[:, :, 0][colored] // 30, minlength=6)
    pixel_count = gray.size
    color = {
        name: float(count / pixel_count)
        for name, count in zip(COLOR_NAMES, hue_bins)
    }
    color["neutral"] = float(np.count_nonzero(~colored) / pixel_count)

    return {
        "brightness": float(np.mean(gray) / 255),
        "motion": (
            float(np.mean(cv2.absdiff(gray, previous_gray)) / 255)
            if previous_gray is not None
            else 0.0
        ),
        "contrast": float(np.std(gray) / 127.5),
        "color": color,
    }, gray


def extract_features(video_path):
    capture = cv2.VideoCapture(str(video_path))
    try:
        if not capture.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        fps = capture.get(cv2.CAP_PROP_FPS)
        if not math.isfinite(fps) or fps < 1 / INTERVAL_SECONDS:
            raise ValueError(f"Unsupported or invalid video frame rate: {fps}")

        reported_frames = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        features = []
        previous_gray = None
        pending = None  # a sampled frame waiting for its next frame to measure flow
        frame_index = 0
        sample_index = 0
        next_frame = 0
        while capture.grab():
            sampled = frame_index == next_frame
            if sampled or pending is not None:
                ok, frame = capture.retrieve()
                if not ok or frame is None:
                    raise ValueError(f"Could not decode frame {frame_index}")
                if pending is not None:
                    pending["grid"] = grid_features(pending.pop("frame"), frame)
                    pending = None
                if sampled:
                    values, previous_gray = frame_features(frame, previous_gray)
                    pending = {"t": round(frame_index / fps, 4), **values, "frame": frame}
                    features.append(pending)
                    sample_index += 1
                    next_frame = round(sample_index * INTERVAL_SECONDS * fps)
            frame_index += 1
        if pending is not None:
            pending["grid"] = grid_features(pending.pop("frame"), None)

        if not features:
            raise ValueError(f"Video contains no readable frames: {video_path}")
        if math.isfinite(reported_frames) and reported_frames > frame_index:
            raise ValueError(
                f"Video stopped after {frame_index} frames; "
                f"metadata reports {reported_frames:g}"
            )
        finish_grids(features)
        return features
    finally:
        capture.release()


TRACKS_PATH = Path(__file__).resolve().parents[1] / "data" / "tracks.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, help="Path to the input video")
    parser.add_argument("track_id", help="Track ID to add or update in data/tracks.json")
    parser.add_argument("--nasa-id", type=int, help="NASA SVS visualization ID")
    parser.add_argument(
        "--features-only",
        action="store_true",
        help="Only re-extract features; keep the track's existing metadata",
    )
    args = parser.parse_args()

    try:
        if not args.features_only and (args.nasa_id is None or args.nasa_id <= 0):
            raise ValueError("A positive --nasa-id is required unless --features-only is set")
        tracks = json.loads(TRACKS_PATH.read_text(encoding="utf-8")) if TRACKS_PATH.exists() else []
        if not isinstance(tracks, list) or any(
            not isinstance(track, dict) or "id" not in track for track in tracks
        ):
            raise ValueError("tracks.json must contain a list of tracks with IDs")
        existing = next((track for track in tracks if track["id"] == args.track_id), None)
        if args.features_only and existing is None:
            raise ValueError(f"Track {args.track_id} is not in tracks.json yet")
        track = existing if args.features_only else {
            **(existing or {}), **extract_track(args.nasa_id, args.video, args.track_id)
        }
        features = extract_features(args.video)
        # The summary and default config are refreshed by build_tracks.py.
        track = {**track, "features": features}
        if existing is None:
            tracks.append(track)
        else:
            tracks[tracks.index(existing)] = track
        TRACKS_PATH.parent.mkdir(parents=True, exist_ok=True)
        TRACKS_PATH.write_text(json.dumps(tracks, separators=(",", ":")) + "\n", encoding="utf-8")
    except (ValueError, OSError, cv2.error) as error:
        parser.exit(1, f"Error: {error}\n")
    print(f"Wrote {len(features)} samples for {args.track_id} to {TRACKS_PATH}")
    print("Next: python -m backend.pipeline.build_tracks")


if __name__ == "__main__":
    main()
