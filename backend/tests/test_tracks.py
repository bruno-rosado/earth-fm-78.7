import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import tracks
from backend.services import imports

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
        patcher = patch.object(imports, "DATA_DIR", Path(self.temp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    def test_curated_catalog_contains_only_the_selected_ocean_track(self):
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        self.assertEqual([track["id"] for track in catalog], ["ecco2_sst_flow"])
        track = catalog[0]
        self.assertEqual(track["nasa_id"], 3912)
        self.assertEqual(track["summary"]["sample_count"], len(track["features"]))
        self.assertTrue(track["video"].startswith("/media/"))
        self.assertTrue(track["cover"].startswith("/media/"))
        self.assertTrue(track["features"])

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

    def test_music_styles_are_not_generated_by_a_live_api_route(self):
        for path in ("/api/music-config",):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)


if __name__ == "__main__":
    unittest.main()
