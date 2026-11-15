import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.pipeline import transcode as transcode_module
from backend.services import imports


class FfmpegArgsTests(unittest.TestCase):
    def test_args_scale_encode_and_drop_audio(self):
        args = transcode_module.ffmpeg_args("ffmpeg", "in.webm", "out.tmp", source_fps=24)
        self.assertEqual(args, ["ffmpeg", "-y", "-i", "in.webm", "-an", "-vf", "scale='min(1280,iw)':-2",
                                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                                "-movflags", "+faststart", "-f", "mp4", "-progress", "pipe:1", "-nostats", "out.tmp"])

    def test_frame_rate_is_capped_only_when_the_source_is_faster(self):
        self.assertNotIn("-r", transcode_module.ffmpeg_args("f", "a", "b", source_fps=30))
        args = transcode_module.ffmpeg_args("f", "a", "b", source_fps=60)
        self.assertEqual(args[args.index("-r") + 1], "30")


class OptimizeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.job = {"status": "downloading", "progress": 0.0, "message": ""}

    def test_failure_keeps_the_original_file(self):
        source = self.dir / "svs1.webm"
        source.write_bytes(b"x")
        with patch.object(imports, "video_duration", return_value=5), \
                patch.object(imports, "transcode", side_effect=transcode_module.TranscodeError("boom")):
            result = imports._optimize(source, self.dir / "svs1.mp4", self.job)
        self.assertEqual(result, source)
        self.assertTrue(source.exists())
        self.assertEqual(self.job["status"], "transcoding")

    def test_success_returns_the_mp4_and_removes_the_original(self):
        source, target = self.dir / "svs1.webm", self.dir / "svs1.mp4"
        source.write_bytes(b"x")
        with patch.object(imports, "video_duration", return_value=5), \
                patch.object(imports, "transcode", side_effect=lambda s, d, *a, **k: d.write_bytes(b"y")):
            result = imports._optimize(source, target, self.job)
        self.assertEqual(result, target)
        self.assertFalse(source.exists())


if __name__ == "__main__":
    unittest.main()
