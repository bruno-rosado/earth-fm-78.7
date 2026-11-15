import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

from backend.main import app
from backend.routes import tracks
from backend.services import imports, nasa


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.media = self.root / "media"
        self.media.mkdir()
        self.catalog = self.root / "tracks.json"
        self.catalog.write_text("[]")
        for module, name, value in (
            (imports, "DATA_DIR", self.root), (imports, "MEDIA_DIR", self.media),
            (imports, "_jobs", {}), (imports, "_worker", Mock()),
            (tracks, "TRACKS_PATH", self.catalog),
        ):
            patcher = patch.object(module, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.client = TestClient(app)

    def test_duplicate_imports_share_one_job_and_finished_tracks_need_no_download(self):
        first = imports.start(42)
        second = imports.start(42)
        self.assertEqual(first["id"], second["id"])
        imports._worker.submit.assert_called_once()
        track = {"id": "svs43", "nasa_id": 43, "title": "Ready", "video": "/media/svs43.mp4", "features": [1]}
        (self.media / "svs43.mp4").write_bytes(b"local video")
        imports._upsert_track(track)
        ready = imports.start(43)
        self.assertEqual(ready["status"], "done")
        self.assertEqual(ready["track"]["id"], "svs43")
        self.assertNotIn("features", ready["track"])
        imports._worker.submit.assert_called_once()

    def test_actual_transcode_and_extractor_persist_a_playable_track_and_api_features(self):
        # Only the remote download is replaced. Real video conversion, extraction,
        # summary building, persistence, and all player API reads run end to end.
        source = self.root / "source.avi"
        writer = cv2.VideoWriter(str(source), cv2.VideoWriter_fourcc(*"MJPG"), 12, (128, 64))
        self.assertTrue(writer.isOpened())
        for index in range(24):
            frame = np.zeros((64, 128, 3), dtype=np.uint8)
            frame[:, :, 1] = np.arange(128, dtype=np.uint8)
            cv2.circle(frame, (20 + index * 3, 32), 14, (0, 120, 230), -1)
            writer.write(frame)
        writer.release()
        card = {"title": "Moving Earth data", "description": "A test visualization.", "source": "https://svs.gsfc.nasa.gov/42/",
                "video": {"url": "https://svs.gsfc.nasa.gov/test.mov", "format": "mov"}}
        job = imports.start(42)
        with patch.object(nasa, "card", return_value=card), \
                patch.object(nasa, "thumbnail_file", side_effect=nasa.NasaError(404, "No thumbnail")), \
                patch.object(imports, "_download", side_effect=lambda url, destination, *args: shutil.copyfile(source, destination)):
            imports._run(imports._jobs[job["id"]])
        result = imports.get_job(job["id"])
        self.assertEqual(result["status"], "done", result)
        self.assertEqual(self.catalog.read_text(), "[]")
        persisted = json.loads((self.root / "library.json").read_text())[0]
        self.assertEqual(persisted["video"], "/media/svs42.mp4")
        self.assertTrue((self.media / "svs42.mp4").exists())
        self.assertFalse((self.media / "svs42.mov").exists())
        self.assertAlmostEqual(persisted["duration"], 2, delta=.1)
        self.assertEqual(persisted["summary"]["sample_count"], len(persisted["features"]))
        self.assertIsNone(persisted["config"])
        features = self.client.get("/api/tracks/svs42/features").json()
        self.assertGreaterEqual(len(features), 2)
        self.assertEqual(len(features[0]["grid"]), 8)
        self.assertEqual(len(features[0]["grid"][0]), 24)
        self.assertEqual(len(features[0]["grid"][0][0]), 4)
        details = self.client.get("/api/tracks/svs42").json()
        self.assertEqual(details["video"], "/media/svs42.mp4")
        cards = self.client.get("/api/tracks").json()
        self.assertEqual([track["id"] for track in cards], ["svs42"])
        self.assertNotIn("features", cards[0])
        # Clearing volatile jobs simulates a server restart: library survives.
        imports._jobs.clear()
        self.assertEqual(imports.start(42)["status"], "done")

    def test_failed_extraction_removes_partial_media_and_does_not_write_library(self):
        card = {"video": {"format": "mp4", "url": "https://svs.gsfc.nasa.gov/a.mp4"}}
        job = imports.start(42)
        with patch.object(nasa, "card", return_value=card), \
                patch.object(imports, "_download", side_effect=lambda url, dest, *args: dest.write_bytes(b"video")), \
                patch.object(imports, "video_duration", return_value=imports.MAX_DURATION + 1):
            imports._run(imports._jobs[job["id"]])
        self.assertEqual(imports.get_job(job["id"])["status"], "error")
        self.assertFalse(list(self.media.iterdir()))
        self.assertFalse((self.root / "library.json").exists())

    def test_stream_size_limit_stops_download_and_cleans_only_its_temporary_file(self):
        other = self.media / "unrelated.part"
        other.write_bytes(b"another download")
        response = Mock()
        response.iter_bytes.return_value = [b"123", b"456"]
        stream = Mock()
        stream.__enter__ = Mock(return_value=response)
        stream.__exit__ = Mock(return_value=False)
        with patch.object(nasa, "MAX_BYTES", 5), patch.object(nasa, "content_length", return_value=None), \
                patch.object(imports.httpx, "stream", return_value=stream):
            with self.assertRaises(imports.ImportFailed):
                imports._download("https://svs.gsfc.nasa.gov/a.mp4", self.media / "video.mp4", {}, "Downloading")
        self.assertEqual(list(self.media.iterdir()), [other])

    def test_full_queue_is_reported_and_rejected_without_submitting_more_work(self):
        with patch.object(imports, "MAX_ACTIVE_JOBS", 1):
            self.assertEqual(self.client.post("/api/imports", json={"nasa_id": 42}).status_code, 202)
            response = self.client.post("/api/imports", json={"nasa_id": 43})
        self.assertEqual(response.status_code, 429)
        imports._worker.submit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
