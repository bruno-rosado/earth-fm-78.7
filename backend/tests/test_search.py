import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import imports, nasa
from backend.routes import tracks

SVS_3912 = json.loads((Path(__file__).parent / "fixtures" / "svs_3912.json").read_text())


def fake_card(nasa_id):
    if nasa_id == 3912:
        return {"nasa_id": 3912, "title": "Global Sea Surface Currents and Temperature", "description": "",
                "release_date": "2012-01-01", "thumbnail": "/api/thumbs/3912.jpg", "thumbnail_source": "https://svs.gsfc.nasa.gov/x.jpg",
                "video": {"url": "https://svs.gsfc.nasa.gov/v.mp4", "width": 960, "height": 540, "format": "webm", "size_mb": 15, "too_large": False},
                "source": "https://svs.gsfc.nasa.gov/3912/"}
    if nasa_id == 42:
        return {**fake_card(3912), "nasa_id": 42, "title": "Other", "track": None}
    return None


class NasaChooserTests(unittest.TestCase):
    def test_picks_smallest_movie_at_least_min_width_and_web_thumbnail(self):
        groups = nasa._video_groups(SVS_3912)
        self.assertEqual(groups[0]["widget"], "Video player")
        movie = nasa.choose_movie(groups[0])
        self.assertEqual((movie["filename"], movie["width"]), ("ecco2_sst_flow.webmhd.webm", 960))
        self.assertEqual(nasa.choose_thumbnail(SVS_3912, groups[0]).rsplit("/", 1)[1], "flat_global_ecco2_2028x1024.25000_web.png")

    def test_rejects_urls_off_nasa_and_strips_html(self):
        with self.assertRaises(nasa.NasaError):
            nasa.nasa_url("https://evil.example.com/video.mp4")
        self.assertEqual(nasa.nasa_url("http://svs.gsfc.nasa.gov/a.mp4"), "https://svs.gsfc.nasa.gov/a.mp4")
        self.assertEqual(nasa._plain("Hello <b>world</b>\n  there"), "Hello world there")

    def test_description_keeps_science_text_without_nasa_media_file_inventory(self):
        self.assertEqual(
            nasa._plain("<p>A hurricane moves across the ocean &amp; brings rain.</p> || storm_print.jpg (1024x576) [138 KB] || storm.mp4 (1920x1080) [18 MB] ||"),
            "A hurricane moves across the ocean & brings rain.",
        )
        self.assertEqual(nasa._plain(None), "")


class SearchRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        data = Path(self.temp.name)
        (data / "tracks.json").write_text(json.dumps([{"id": "ecco2_sst_flow", "nasa_id": 3912, "title": "Ocean", "video": "/media/x.mp4", "duration": 1}]))
        for target, value in ((imports, "DATA_DIR"), (imports, "MEDIA_DIR")):
            patcher = patch.object(target, value, data)
            patcher.start()
            self.addCleanup(patcher.stop)
        (data / "x.mp4").write_bytes(b"")
        patcher = patch.object(nasa, "card", side_effect=fake_card)
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.object(tracks, "TRACKS_PATH", data / "tracks.json")
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.object(imports, "_jobs", {})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    def test_search_marks_cards_already_in_the_library(self):
        with patch.object(nasa, "_get_json", return_value={"results": [
            {"id": 3912, "result_type": "Visualization"}, {"id": 42, "result_type": "Visualization"},
            {"id": 7, "result_type": "Gallery"}, {"id": 99, "result_type": "Visualization"},
        ]}):
            nasa._cache.clear()
            response = self.client.get("/api/search", params={"q": "ocean"})
        self.assertEqual(response.status_code, 200, response.text)
        cards = response.json()
        self.assertEqual([c["nasa_id"] for c in cards], [3912, 42])
        self.assertEqual(cards[0]["track"]["id"], "ecco2_sst_flow")
        self.assertIsNone(cards[1]["track"])

    def test_empty_query_and_invalid_ids_are_handled(self):
        self.assertEqual(self.client.get("/api/search", params={"q": "  "}).json(), [])
        self.assertEqual(self.client.post("/api/imports", json={"nasa_id": -1}).status_code, 422)
        self.assertEqual(self.client.get("/api/imports/nope").status_code, 404)

    def test_importing_a_track_already_in_the_library_is_done_immediately(self):
        response = self.client.post("/api/imports", json={"nasa_id": 3912})
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["status"], "done")
        self.assertEqual(response.json()["track"]["id"], "ecco2_sst_flow")

    def test_tracks_merge_library_and_skip_missing_media(self):
        (Path(self.temp.name) / "library.json").write_text(json.dumps([
            {"id": "svs1", "nasa_id": 1, "title": "Here", "video": "/media/x.mp4", "duration": 1},
            {"id": "svs2", "nasa_id": 2, "title": "Gone", "video": "/media/missing.mp4", "duration": 1},
        ]))
        self.assertEqual([t["id"] for t in self.client.get("/api/tracks").json()], ["ecco2_sst_flow", "svs1"])



if __name__ == "__main__":
    unittest.main()
