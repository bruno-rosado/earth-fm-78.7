import copy
import json
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
TRACKS = json.loads((DATA_DIR / "tracks.json").read_text())
FULL_TRACK = next(track for track in TRACKS if track["id"] == "ecco2_sst_flow")
FEATURES = FULL_TRACK["features"]
SUMMARY = FULL_TRACK["summary"]
TRACK = {"id": FULL_TRACK["id"], "title": FULL_TRACK["title"],
         "description": FULL_TRACK.get("description", ""), "duration": FULL_TRACK["duration"]}
CONFIG = {
    "schema_version": 2, "track_id": TRACK["id"], "bpm": 72, "key": "D", "mode": "dorian",
    "low_octave": 3, "lead_instrument": "fm_synth", "pad_instrument": "am_synth",
    "rhythm_grid": "8n", "note_duration": "4n", "density_range": [0.05, 0.4],
    "velocity_range": [0.15, 0.5], "pad_level": 0.5, "reverb": 0.4,
}


class MusicConfigTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(service, "load_dotenv")
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch.dict("os.environ", {"GEMINI_API_KEY": "test-key", "GEMINI_MODEL": "test-model"})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.client = TestClient(app)
        self.url = "/api/music-config"

    def body(self, prompt="", track=TRACK):
        return {"track": track, "summary": SUMMARY, "prompt": prompt}

    def mock_gemini(self, output=None):
        patcher = patch.object(service.genai, "Client")
        factory = patcher.start()
        self.addCleanup(patcher.stop)
        method = factory.return_value.__enter__.return_value.interactions.create
        method.return_value = SimpleNamespace(status="completed", output_text=json.dumps(CONFIG if output is None else output))
        return method

    def test_vibe_change_sends_summary_and_schema_without_replacing_default(self):
        generate = self.mock_gemini()
        response = self.client.post(self.url, json=self.body("Gentle ocean music"))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), CONFIG)
        request = generate.call_args.kwargs
        data = json.loads(request["input"])
        self.assertEqual(data["track"], TRACK)
        self.assertNotIn("features", data)
        self.assertEqual(data["preferences"], "Gentle ocean music")
        self.assertEqual(data["summary"]["sample_count"], len(FEATURES))
        self.assertEqual(len(data["summary"]["latitude_bands"]), len(FEATURES[0]["grid"]))
        self.assertEqual(request["response_format"]["schema"]["properties"]["track_id"]["enum"], [TRACK["id"]])
        self.assertFalse(request["store"])
        generate.assert_called_once()

    def test_track_list_has_everything_and_summary_is_current(self):
        tracks = self.client.get("/api/tracks").json()
        self.assertEqual(tracks, TRACKS)
        for track in tracks:
            self.assertEqual(track["summary"], service.summarize_features(track["features"]))
            service.MusicConfig.model_validate(track["config"])

    def test_vibe_change_writes_nothing(self):
        self.mock_gemini()
        before = (DATA_DIR / "tracks.json").read_bytes()
        self.assertEqual(self.client.post(self.url, json=self.body("storm")).status_code, 200)
        self.assertEqual((DATA_DIR / "tracks.json").read_bytes(), before)

    def test_request_rejects_bad_track_and_oversized_summary(self):
        self.mock_gemini()
        self.assertEqual(self.client.post(self.url, json=self.body(track={**TRACK, "id": "../x"})).status_code, 422)
        huge = {**self.body(), "summary": {"x": "y" * 30000}}
        self.assertEqual(self.client.post(self.url, json=huge).status_code, 422)
        self.assertEqual(self.client.post(self.url, json={**self.body(), "features": []}).status_code, 422)

    def test_missing_key_has_actionable_error_and_never_calls_provider(self):
        with patch.dict("os.environ", {"GEMINI_API_KEY": ""}), patch.object(service.genai, "Client") as factory:
            response = self.client.post(self.url, json=self.body())
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
            response = self.client.post(self.url, json=self.body())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), CONFIG)
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["response_format"]["mime_type"], "application/json")

    def test_wrong_track_or_unfinished_output_is_rejected(self):
        generate = self.mock_gemini({**CONFIG, "track_id": "other"})
        self.assertEqual(self.client.post(self.url, json=self.body()).status_code, 502)
        generate.return_value.status = "incomplete"
        generate.return_value.output_text = json.dumps(CONFIG)
        self.assertEqual(self.client.post(self.url, json=self.body()).status_code, 502)

    def test_provider_failure_does_not_expose_provider_message(self):
        generate = self.mock_gemini()
        generate.side_effect = errors.ClientError(429, {"error": {"message": "sensitive-provider-message"}})
        response = self.client.post(self.url, json=self.body())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("sensitive-provider-message", response.text)

    def test_schema_rejects_unsupported_instruments_keys_and_ranges(self):
        for changes in [
            {"lead_instrument": "kazoo"}, {"bpm": 1000}, {"bpm": "80"}, {"schema_version": 1},
            {"key": "H"}, {"key": "eval()"}, {"mode": "locrian"}, {"low_octave": 7},
            {"density_range": [0.9, 0.2]}, {"velocity_range": [0.2, 1.0]}, {"reverb": 1},
            {"rhythm_grid": "nonsense"}, {"extra_code": "do something"},
        ]:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                service.MusicConfig.model_validate({**CONFIG, **changes})

    def test_backend_instruments_match_frontend_palette(self):
        import re, typing
        source = (DATA_DIR.parents[1] / "frontend/src/services/tone/musicGeneration.js").read_text()
        block = source[source.index("const INSTRUMENTS = {"):source.index("\n};", source.index("const INSTRUMENTS = {"))]
        frontend = set(re.findall(r"^  (\w+): \{", block, re.M))
        self.assertEqual(frontend, set(typing.get_args(service.Instrument)))

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

    def test_generation_request_rejects_excessive_prompt(self):
        self.assertEqual(self.client.post(self.url, json={"prompt": "x" * 1001}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
