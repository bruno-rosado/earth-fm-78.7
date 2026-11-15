import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import httpx2 as httpx

from backend.main import app
from backend.services import track_search as service

TRACK = {"id": "ocean", "title": "Global Sea Surface Currents", "nasa_id": 3912,
         "description": "Ocean imagery.", "source": "https://svs.gsfc.nasa.gov/3912/"}


def response(items=None, **extra):
    return httpx.Response(200, json={"text_blocks": [
        {"type": "paragraph", "snippet": "The image shows moving ocean patterns."},
        {"type": "paragraph", "snippet": "NASA visualizations help explain circulation."},
    ], "references": items if items is not None else [
        {"title": "<b>NASA currents</b>", "link": "https://svs.gsfc.nasa.gov/3912/", "snippet": "Ocean &amp; climate."},
    ], **extra}, request=httpx.Request("GET", "https://serpapi.com/search.json"))


class TrackSearchTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.cache = Path(self.directory.name)
        for patcher in (patch.object(service, "CACHE_DIR", self.cache), patch.dict(os.environ, {"SERPAPI_API_KEY": "test-secret"})):
            patcher.start(); self.addCleanup(patcher.stop)
        service._memory.clear(); service._failures.clear()
        self.addCleanup(service._memory.clear); self.addCleanup(service._failures.clear)

    def test_search_uses_track_metadata_and_reuses_memory_and_disk_cache(self):
        with patch.object(service.httpx, "get", return_value=response()) as get:
            first = service.search_track(TRACK)
            self.assertFalse(first["cached"])
            self.assertEqual(first["engine"], "google_ai_mode")
            self.assertEqual(first["answer"], "The image shows moving ocean patterns.\n\nNASA visualizations help explain circulation.")
            self.assertEqual(first["sources"][0], {"title": "NASA currents", "url": TRACK["source"], "snippet": "Ocean & climate.", "source": "svs.gsfc.nasa.gov"})
            args = get.call_args
            self.assertEqual(args.args[0], "https://serpapi.com/search.json")
            self.assertEqual(args.kwargs["params"]["engine"], "google_ai_mode")
            self.assertIn('NASA visualization "Global Sea Surface Currents"', args.kwargs["params"]["q"])
            self.assertIn("https://svs.gsfc.nasa.gov/3912/", args.kwargs["params"]["q"])
            self.assertIn("three short paragraphs", args.kwargs["params"]["q"])
            self.assertEqual(args.kwargs["params"]["api_key"], "test-secret")
            self.assertEqual(args.kwargs["timeout"], 60)
            self.assertTrue(service.search_track(TRACK)["cached"])
            service._memory.clear()
            self.assertTrue(service.search_track(TRACK)["cached"])
            self.assertEqual(get.call_count, 1)
            self.assertNotIn("test-secret", next(self.cache.glob("*.json")).read_text())

    def test_missing_key_makes_no_provider_request(self):
        with patch.dict(os.environ, {"SERPAPI_API_KEY": ""}), patch.object(service.httpx, "get") as get:
            with self.assertRaisesRegex(service.SearchUnavailable, "not configured"):
                service.search_track(TRACK)
            get.assert_not_called()
        self.assertEqual(list(self.cache.glob("*.json")), [])

    def test_results_are_bounded_deduplicated_plain_text_and_safe_links(self):
        items = [
            {"title": "Bad", "link": "javascript:alert(1)"},
            {"title": "Credentials", "link": "https://user:password@example.com"},
            {"title": "Key", "link": "https://example.com?api_key=test-secret"},
            {"title": "Valid test-secret", "link": "https://example.com/one", "snippet": "<p>Read test-secret</p>"},
            {"title": "Duplicate", "link": "https://example.com/one"},
            *({"title": f"Result {i}", "link": f"https://example.com/{i}"} for i in range(10)),
        ]
        with patch.object(service.httpx, "get", return_value=response(items, search_metadata={"json_endpoint": "https://serpapi.com?api_key=test-secret"})):
            result = service.search_track(TRACK)
        self.assertEqual(len(result["sources"]), 5)
        self.assertEqual(result["sources"][0]["snippet"], "Read [redacted]")
        self.assertNotIn("test-secret", json.dumps(result))
        self.assertNotIn("search_metadata", result)

    def test_expiration_metadata_changes_and_corrupt_files_trigger_new_searches(self):
        with patch.object(service.httpx, "get", return_value=response()) as get:
            service.search_track(TRACK)
            record = next(iter(service._memory.values()))
            record["expires_at"] = 0
            service.search_track(TRACK)
            service.search_track({**TRACK, "title": "New title"})
            service._memory.clear()
            for file in self.cache.glob("*.json"): file.write_text("broken json")
            service.search_track(TRACK)
            self.assertEqual(get.call_count, 4)

    def test_answer_without_references_is_cached_and_read_only_disk_keeps_session_cache(self):
        with patch.object(service.httpx, "get", return_value=response([])) as get, patch.object(Path, "mkdir", side_effect=OSError("read only")):
            first = service.search_track(TRACK)
            self.assertTrue(first["answer"])
            self.assertEqual(first["sources"], [])
            self.assertTrue(service.search_track(TRACK)["cached"])
            self.assertEqual(get.call_count, 1)

    def test_provider_errors_are_redacted_and_retries_are_cooled_down(self):
        error = httpx.RequestError("Failed https://serpapi.com?api_key=test-secret")
        with patch.object(service.httpx, "get", side_effect=error) as get:
            for _ in range(2):
                with self.assertRaises(service.SearchUnavailable) as caught: service.search_track(TRACK)
                self.assertNotIn("test-secret", str(caught.exception))
            self.assertEqual(get.call_count, 1)
            with patch.dict(os.environ, {"SERPAPI_API_KEY": "different-key"}):
                with self.assertRaises(service.SearchUnavailable): service.search_track(TRACK)
            self.assertEqual(get.call_count, 2)
        self.assertEqual(list(self.cache.glob("*.json")), [])

    def test_malformed_provider_results_are_not_cached(self):
        for payload in ({"error": "provider failure"}, {}, {"organic_results": [{"title": "Regular search is not an AI answer"}]}, {"text_blocks": []}, {"text_blocks": [{"snippet": "Unfinished"}], "search_metadata": {"status": "Processing"}}):
            service._failures.clear()
            with patch.object(service.httpx, "get", return_value=httpx.Response(200, json=payload, request=httpx.Request("GET", "https://serpapi.com"))):
                with self.assertRaises(service.SearchUnavailable): service.search_track(TRACK)
        self.assertEqual(list(self.cache.glob("*.json")), [])

    def test_cache_growth_is_bounded(self):
        with patch.object(service, "MAX_ENTRIES", 2), patch.object(service.httpx, "get", return_value=response()):
            for i in range(4): service.search_track({**TRACK, "id": f"track-{i}"})
        self.assertEqual(len(service._memory), 2)
        self.assertEqual(len(list(self.cache.glob("*.json"))), 2)

    def test_route_requires_a_real_track_and_handles_configuration_errors(self):
        client = TestClient(app)
        with patch("backend.routes.track_search._find_track", return_value=None), patch.object(service.httpx, "get") as get:
            self.assertEqual(client.get("/api/tracks/missing/search").status_code, 404)
            get.assert_not_called()
        with patch("backend.routes.track_search._find_track", return_value=TRACK), patch.dict(os.environ, {"SERPAPI_API_KEY": ""}):
            self.assertEqual(client.get("/api/tracks/ocean/search").status_code, 503)
        with patch("backend.routes.track_search._find_track", return_value=TRACK), patch.object(service.httpx, "get", return_value=response()):
            result = client.get("/api/tracks/ocean/search")
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()["track_id"], "ocean")
            self.assertEqual(result.json()["engine"], "google_ai_mode")
            self.assertTrue(result.json()["answer"])
            self.assertEqual(len(result.json()["sources"]), 1)

    def test_nested_answer_blocks_and_markdown_fallback_are_readable_safe_text(self):
        payload = {"text_blocks": [
            {"type": "heading", "snippet": "<b>How to read it</b>"},
            {"type": "list", "list": [
                {"title": "Motion", "snippet": "Movement follows visual patterns."},
                {"text_blocks": [{"type": "paragraph", "snippet": "A value < 0 differs from a value > 0."}]},
            ]},
            {"type": "table", "table": [["Color", "Meaning"], ["Blue", "A visual scale"]]},
        ]}
        answer = service._answer_text(payload)
        self.assertIn("How to read it", answer)
        self.assertIn("Movement follows visual patterns.", answer)
        self.assertIn("A value < 0 differs from a value > 0.", answer)
        self.assertIn("Blue · A visual scale", answer)
        self.assertNotIn("<b>", answer)
        markdown = service._answer_text({"reconstructed_markdown": "### Context\n\n**NASA** explains [ocean patterns](https://example.com)."})
        self.assertEqual(markdown, "Context\n\nNASA explains ocean patterns.")
        self.assertEqual(service._answer_text({"text_blocks": [{"snippet": "test-secret"}]}, "test-secret"), "[redacted]")

    def test_regular_google_cache_records_cannot_be_used_as_ai_explanations(self):
        with patch.object(service.httpx, "get", return_value=response()) as get:
            service.search_track(TRACK)
            for record in service._memory.values():
                record["version"] = 1
                record["engine"] = "google"
                record.pop("answer")
                record["results"] = record.pop("sources")
            result = service.search_track(TRACK)
            self.assertEqual(get.call_count, 2)
            self.assertEqual(result["engine"], "google_ai_mode")
            self.assertTrue(result["answer"])


if __name__ == "__main__":
    unittest.main()
