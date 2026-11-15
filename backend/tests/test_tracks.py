import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import tracks

CATALOG_PATH = Path(__file__).resolve().parents[1] / "data" / "tracks.json"


TRACK = {
    "id": "ocean-pulse",
    "title": "Ocean Pulse",
    "description": "A view of moving currents.",
    "cover": "/media/ocean.jpg",
    "video": "/media/ocean.mp4",
    "duration": 12.0,
    "nasa_id": 42,
    "source": "https://svs.gsfc.nasa.gov/42/",
    "summary": {"sample_count": 1},
    "config": {"bpm": 72},
    "features": [{"t": 0.0, "grid": [[[1.0, 0.5, 0.2, -0.3]]]}],
}


class TrackRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.catalog_path = Path(self.temp.name) / "tracks.json"
        self.catalog_path.write_text(json.dumps([TRACK]), encoding="utf-8")
        patcher = patch.object(tracks, "TRACKS_PATH", self.catalog_path)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    def test_curated_catalog_contains_the_two_extracted_svs_tracks(self):
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        by_id = {track["id"]: track for track in catalog}
        for track_id in ("svs5687", "svs5688"):
            with self.subTest(track_id=track_id):
                track = by_id[track_id]
                self.assertEqual(track["nasa_id"], int(track_id.removeprefix("svs")))
                self.assertEqual(len(track["features"]), 30)
                self.assertEqual(track["summary"]["sample_count"], 30)
                self.assertEqual(track["config"]["track_id"], track_id)
                self.assertEqual(track["video"], f"/media/{track_id}.mp4")
                self.assertEqual(track["cover"], f"/media/{track_id}_cover.jpg")

    def test_catalog_returns_cards_without_player_data_or_media_urls(self):
        response = self.client.get("/api/tracks")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{
            "id": "ocean-pulse",
            "title": "Ocean Pulse",
            "description": "A view of moving currents.",
            "cover": "/media/ocean.jpg",
            "duration": 12.0,
            "source": "https://svs.gsfc.nasa.gov/42/",
        }])

    def test_track_details_and_feature_timeline_load_separately(self):
        details = self.client.get("/api/tracks/ocean-pulse")
        features = self.client.get("/api/tracks/ocean-pulse/features")
        self.assertEqual(details.status_code, 200)
        self.assertEqual(details.json()["video"], TRACK["video"])
        self.assertEqual(details.json()["config"], TRACK["config"])
        self.assertNotIn("features", details.json())
        self.assertEqual(features.status_code, 200)
        self.assertEqual(features.json(), TRACK["features"])

    def test_unknown_track_returns_not_found_for_details_and_features(self):
        self.assertEqual(self.client.get("/api/tracks/missing").status_code, 404)
        self.assertEqual(self.client.get("/api/tracks/missing/features").status_code, 404)

    def test_curated_mvp_does_not_expose_import_or_live_generation_routes(self):
        for path in ("/api/search", "/api/imports", "/api/music-config"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)


if __name__ == "__main__":
    unittest.main()
