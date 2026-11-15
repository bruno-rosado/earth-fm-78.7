import copy
import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import music_config as service

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
TRACKS = json.loads((DATA_DIR / "tracks.json").read_text())
FULL_TRACK = next(track for track in TRACKS if track["id"] == "ecco2_sst_flow")
FEATURES = FULL_TRACK["features"]


class MusicConfigTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_track_list_has_everything_and_summary_is_current(self):
        tracks = self.client.get("/api/tracks").json()
        # The list also includes this machine's imports (library.json), if any.
        catalog_ids = {track["id"] for track in TRACKS}
        self.assertEqual([t for t in tracks if t["id"] in catalog_ids], TRACKS)
        self.assertTrue(all("config" not in track for track in TRACKS))
        for track in tracks:
            self.assertEqual(track["summary"], service.summarize_features(track["features"]))

    def test_malformed_features_are_rejected(self):
        invalid = copy.deepcopy(FEATURES)
        invalid[0]["color"]["neutral"] = 1
        with self.assertRaises(service.MusicConfigError):
            service.summarize_features(invalid)
        for change in (lambda f: f[1]["grid"].pop(), lambda f: f[0]["grid"][2][3].__setitem__(2, 1.5),
                       lambda f: f[0]["grid"][2][3].__setitem__(3, -2), lambda f: f[0].pop("grid")):
            invalid = copy.deepcopy(FEATURES)
            change(invalid)
            with self.subTest(change=change), self.assertRaises(service.MusicConfigError):
                service.summarize_features(invalid)

    def test_summary_describes_each_latitude_band(self):
        bands = service.summarize_features(FEATURES)["latitude_bands"]
        self.assertEqual(len(bands), 8)
        tropics, antarctic = bands[3], bands[-1]
        self.assertGreater(tropics["temperature"], antarctic["temperature"])
        self.assertLess(tropics["flow"], 0)  # equatorial currents run west


if __name__ == "__main__":
    unittest.main()
