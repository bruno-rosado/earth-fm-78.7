import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx2
from fastapi.testclient import TestClient
from google.genai import errors
from pydantic import ValidationError

from backend.main import app
from backend.services import music_config as service

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
TRACK = next(track for track in json.loads((DATA_DIR / "tracks.json").read_text()) if track["id"] == "ecco2_sst_flow")
FEATURES = json.loads((DATA_DIR / "features" / f"{TRACK['id']}.json").read_text())
CONFIG = {
    "schema_version": 1, "track_id": TRACK["id"], "bpm": 80, "instrument": "synth",
    "scale": ["D3", "F3", "G3", "A3", "C4", "D4"], "rhythm_grid": "8n",
    "note_duration": "8n", "density_range": [0.2, 0.8], "velocity_range": [0.25, 0.75],
}


class MusicConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        patcher = patch.object(service, "CONFIG_DIR", Path(self.temp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.object(service, "load_dotenv")
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.dict("os.environ", {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "test-model"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.url = f"/api/tracks/{TRACK['id']}/music-config"

    def mock_gemini(self, output=None):
        patcher = patch.object(service.genai, "Client")
        factory = patcher.start()
        self.addCleanup(patcher.stop)
        method = factory.return_value.__enter__.return_value.interactions.create
        method.return_value = SimpleNamespace(status="completed", output_text=json.dumps(CONFIG if output is None else output))
        return method

    def test_generation_sends_full_files_and_schema_then_reuses_saved_config(self):
        generate = self.mock_gemini()
        response = self.client.post(self.url, json={"prompt": "Gentle ocean music"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), CONFIG)
        request = generate.call_args.kwargs
        data = json.loads(request["input"])
        self.assertEqual(data["track"], TRACK)
        self.assertEqual(data["features"], FEATURES)
        self.assertEqual(data["preferences"], "Gentle ocean music")
        self.assertEqual(data["summary"]["sample_count"], len(FEATURES))
        self.assertEqual(request["response_format"]["schema"]["properties"]["track_id"]["enum"], [TRACK["id"]])
        self.assertFalse(request["store"])
        self.assertEqual(self.client.get(self.url).json(), CONFIG)
        generate.assert_called_once()

    def test_missing_key_has_actionable_error_and_never_calls_provider(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": ""}), patch.object(service.genai, "Client") as factory:
            response = self.client.post(self.url, json={})
        self.assertEqual(response.status_code, 503)
        self.assertIn("GEMINI_API_KEY", response.json()["detail"])
        factory.assert_not_called()

    def test_installed_sdk_serializes_schema_and_parses_provider_output(self):
        original_client = service.genai.Client
        requests = []

        def respond(request):
            body = json.loads(request.content)
            requests.append(body)
            self.assertNotIn('test-key', str(request.url))
            return httpx2.Response(200, json={
                "id": "offline-test", "status": "completed", "model": "test-model",
                "steps": [{"type": "model_output", "content": [{"type": "text", "text": json.dumps(CONFIG)}]}],
            })

        def create_client(**kwargs):
            return original_client(api_key=kwargs["api_key"], http_options={
                "httpx_client": httpx2.Client(transport=httpx2.MockTransport(respond)),
                "timeout": 1000, "retry_options": {"attempts": 1},
            })

        with patch.object(service.genai, "Client", side_effect=create_client):
            response = self.client.post(self.url, json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), CONFIG)
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["response_format"]["mime_type"], "application/json")

    def test_unknown_track_and_missing_config_are_404(self):
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.post('/api/tracks/unknown/music-config', json={}).status_code, 404)

    def test_invalid_provider_output_does_not_replace_saved_config(self):
        generate = self.mock_gemini()
        self.assertEqual(self.client.post(self.url, json={}).status_code, 200)
        saved = service.config_path(TRACK).read_bytes()
        generate.return_value.output_text = '{"javascript": "alert(1)"}'
        self.assertEqual(self.client.post(self.url, json={}).status_code, 502)
        self.assertEqual(service.config_path(TRACK).read_bytes(), saved)

    def test_wrong_track_or_unfinished_output_is_rejected(self):
        generate = self.mock_gemini({**CONFIG, "track_id": "other"})
        self.assertEqual(self.client.post(self.url, json={}).status_code, 502)
        generate.return_value.status = "incomplete"
        generate.return_value.output_text = json.dumps(CONFIG)
        self.assertEqual(self.client.post(self.url, json={}).status_code, 502)
        self.assertFalse(service.config_path(TRACK).exists())

    def test_provider_failure_does_not_expose_provider_message(self):
        generate = self.mock_gemini()
        generate.side_effect = errors.ClientError(429, {"error": {"message": "sensitive-provider-message"}})
        response = self.client.post(self.url, json={})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("sensitive-provider-message", response.text)

    def test_changed_data_requires_regeneration(self):
        self.mock_gemini()
        service.generate_config(TRACK, FEATURES)
        changed = copy.deepcopy(FEATURES)
        changed[0]["brightness"] += 0.01
        with self.assertRaises(service.MusicConfigError) as result:
            service.read_config(TRACK, changed)
        self.assertEqual(result.exception.status_code, 409)

    def test_schema_rejects_unsupported_instruments_notes_and_ranges(self):
        for changes in [
            {"instrument": "piano"}, {"bpm": 1000}, {"bpm": "80"},
            {"scale": ["C4", "D4", "eval()"]}, {"scale": ["D4", "C4", "E4"]},
            {"density_range": [0.9, 0.2]}, {"velocity_range": [0.2, 1.0]},
            {"rhythm_grid": "nonsense"}, {"extra_code": "do something"},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                service.MusicConfig.model_validate({**CONFIG, **changes})

    def test_corrupt_cache_and_malformed_features_are_rejected(self):
        service.config_path(TRACK).write_text('{bad json')
        self.assertEqual(self.client.get(self.url).status_code, 500)
        invalid = copy.deepcopy(FEATURES)
        invalid[0]["color"]["neutral"] = 1
        with self.assertRaises(service.MusicConfigError):
            service.summarize_features(invalid)

    def test_generation_request_rejects_excessive_prompt(self):
        self.assertEqual(self.client.post(self.url, json={"prompt": "x" * 1001}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
