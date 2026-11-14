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


INTERVAL_SECONDS = 2
COLOR_NAMES = ("red", "yellow", "green", "cyan", "blue", "magenta")


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


def frame_features(frame, previous_gray):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    colored = (hsv[:, :, 1] >= 32) & (hsv[:, :, 2] >= 32)
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
        frame_index = 0
        sample_index = 0
        next_frame = 0
        while capture.grab():
            if frame_index == next_frame:
                ok, frame = capture.retrieve()
                if not ok or frame is None:
                    raise ValueError(f"Could not decode frame {frame_index}")
                values, previous_gray = frame_features(frame, previous_gray)
                features.append({"t": frame_index / fps, **values})
                sample_index += 1
                next_frame = round(sample_index * INTERVAL_SECONDS * fps)
            frame_index += 1

        if not features:
            raise ValueError(f"Video contains no readable frames: {video_path}")
        if math.isfinite(reported_frames) and reported_frames > frame_index:
            raise ValueError(
                f"Video stopped after {frame_index} frames; "
                f"metadata reports {reported_frames:g}"
            )
        return features
    finally:
        capture.release()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, help="Path to the input video")
    parser.add_argument(
        "output", type=Path, help="Path to the {id}.json file in a features directory"
    )
    parser.add_argument("--nasa-id", type=int, required=True, help="NASA SVS visualization ID")
    args = parser.parse_args()

    try:
        if args.nasa_id <= 0:
            raise ValueError("NASA visualization ID must be positive")
        if (
            args.output.parent.name != "features"
            or args.output.suffix != ".json"
            or not args.output.stem
        ):
            raise ValueError("Feature output must be {id}.json in a features directory")
        track_id = args.output.stem
        track_output = args.output.parent.parent / "tracks.json"
        tracks = (
            json.loads(track_output.read_text(encoding="utf-8"))
            if track_output.exists()
            else []
        )
        if not isinstance(tracks, list) or any(
            not isinstance(track, dict) or "id" not in track for track in tracks
        ):
            raise ValueError("tracks.json must contain a list of tracks with IDs")
        track = extract_track(args.nasa_id, args.video, track_id)
        features = extract_features(args.video)
        for index, existing in enumerate(tracks):
            if existing["id"] == track_id:
                tracks[index] = track
                break
        else:
            tracks.append(track)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(features, indent=2) + "\n", encoding="utf-8")
        track_output.write_text(json.dumps(tracks, indent=2) + "\n", encoding="utf-8")
    except (ValueError, OSError, cv2.error) as error:
        parser.exit(1, f"Error: {error}\n")
    print(f"Wrote {len(features)} samples to {args.output}")
    print(f"Wrote track metadata to {track_output}")


if __name__ == "__main__":
    main()
