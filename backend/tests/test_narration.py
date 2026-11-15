import io
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend.main import app
from backend.services import narration


def audio_bytes():
    result = io.BytesIO()
    with wave.open(result, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(22050)
        audio.writeframes(b"\0\0" * 2205)
    return result.getvalue()


class NarrationTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        cache = patch.object(narration, "CACHE_DIR", Path(directory.name))
        cache.start()
        self.addCleanup(cache.stop)

    def test_repeated_text_renders_once_and_persists_valid_audio(self):
        with patch.object(narration, "_engine", return_value=("say", "/usr/bin/say")), patch.object(narration, "_render", return_value=audio_bytes()) as render:
            self.assertEqual(narration.render_narration("Read  the planet."), audio_bytes())
            self.assertEqual(narration.render_narration("Read the planet."), audio_bytes())
            render.assert_called_once()
            self.assertEqual(len(list(narration.CACHE_DIR.glob("*.wav"))), 1)

    def test_corrupt_cache_is_replaced_and_entries_are_bounded(self):
        with patch.object(narration, "_engine", return_value=("say", "/usr/bin/say")), patch.object(narration, "_render", return_value=audio_bytes()) as render, patch.object(narration, "MAX_ENTRIES", 2):
            narration.render_narration("First")
            next(narration.CACHE_DIR.glob("*.wav")).write_bytes(b"corrupt")
            narration.render_narration("First")
            narration.render_narration("Second")
            narration.render_narration("Third")
            self.assertEqual(render.call_count, 4)
            self.assertEqual(len(list(narration.CACHE_DIR.glob("*.wav"))), 2)

    def test_renderer_passes_text_on_stdin_and_validates_output(self):
        text = "--not-an-option $(not-a-command)"
        def run(command, **kwargs):
            self.assertNotIn(text, command)
            self.assertEqual(kwargs["input"], text)
            self.assertNotIn("shell", kwargs)
            Path(command[command.index("-o") + 1]).write_bytes(audio_bytes())
        with patch.object(narration.subprocess, "run", side_effect=run):
            self.assertEqual(narration._render(text, "say", "/usr/bin/say"), audio_bytes())
        with patch.object(narration.subprocess, "run", side_effect=subprocess.TimeoutExpired("say", 45)):
            with self.assertRaises(narration.NarrationUnavailable): narration._render(text, "say", "/usr/bin/say")

    def test_renderer_rejects_invalid_wav_and_missing_engines(self):
        def invalid(command, **kwargs):
            Path(command[command.index("-o") + 1]).write_bytes(b"not audio")
        with patch.object(narration.subprocess, "run", side_effect=invalid):
            with self.assertRaises(narration.NarrationUnavailable): narration._render("Read", "say", "/usr/bin/say")
        with patch.object(narration.sys, "platform", "linux"), patch.object(narration.shutil, "which", return_value=None):
            with self.assertRaises(narration.NarrationUnavailable): narration.render_narration("Read")

    def test_read_only_cache_does_not_prevent_playback(self):
        with patch.object(narration, "_engine", return_value=("say", "/usr/bin/say")), patch.object(narration, "_render", return_value=audio_bytes()), patch.object(Path, "mkdir", side_effect=OSError("read only")):
            self.assertEqual(narration.render_narration("Read"), audio_bytes())

    def test_route_returns_audio_and_validates_requests(self):
        client = TestClient(app)
        with patch("backend.routes.narration.render_narration", return_value=audio_bytes()):
            response = client.post("/api/narration", json={"text": "Read the page."})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["content-type"], "audio/wav")
            self.assertEqual(response.content, audio_bytes())
        for body in ({"text": ""}, {"text": "x" * 6001}, {"text": 5}, {"text": "Read", "command": "extra"}):
            self.assertEqual(client.post("/api/narration", json=body).status_code, 422)
        self.assertEqual(client.post("/api/narration", json={"text": "   "}).status_code, 422)
        with patch("backend.routes.narration.render_narration", side_effect=narration.NarrationUnavailable("Voice unavailable; use transcript.")):
            response = client.post("/api/narration", json={"text": "Read"})
            self.assertEqual(response.status_code, 503)
            self.assertIn("transcript", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
