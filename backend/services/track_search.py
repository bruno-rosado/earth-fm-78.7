"""On-demand Google AI Mode explanations via SerpAPI."""
from collections import OrderedDict
from datetime import datetime, timezone
import hashlib
import html
import json
import logging
import math
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from urllib.parse import urlparse

import httpx2 as httpx

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "track_search"
CACHE_SECONDS = 7 * 24 * 60 * 60
MAX_ENTRIES = 64
VERSION = 2
ENGINE = "google_ai_mode"
MAX_ANSWER = 12000
_memory = OrderedDict()
_failures = OrderedDict()
_lock = threading.Lock()
logger = logging.getLogger(__name__)


class SearchUnavailable(Exception):
    pass


def _plain(value, limit=600):
    return " ".join(re.sub(r"</?[A-Za-z][^>]*>", " ", html.unescape(value if isinstance(value, str) else "")).split())[:limit]


def _answer_text(payload, api_key=""):
    """Extract only answer fields; never treat organic results as an AI response."""
    paragraphs = []
    remaining = MAX_ANSWER

    def add(value):
        nonlocal remaining
        if remaining <= 0:
            return
        clean = _plain(value, min(3000, remaining))
        if clean and remaining > 0:
            paragraphs.append(clean)
            remaining -= len(clean) + 2

    def walk(blocks, depth=0):
        if depth > 5 or remaining <= 0:
            return
        for block in blocks[:40] if isinstance(blocks, list) else []:
            if not isinstance(block, dict):
                continue
            add(block.get("title"))
            add(block.get("snippet", block.get("text")))
            walk(block.get("text_blocks"), depth + 1)
            walk(block.get("list"), depth + 1)
            table = block.get("table")
            if isinstance(table, list):
                for row in table[:20]:
                    if isinstance(row, list):
                        add(" · ".join(_plain(cell, 250) for cell in row[:10]))
            if remaining <= 0:
                break

    walk(payload.get("text_blocks"))
    if not paragraphs and isinstance(payload.get("reconstructed_markdown"), str):
        markdown = payload["reconstructed_markdown"][:MAX_ANSWER * 2]
        markdown = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", markdown)
        markdown = re.sub(r"(?m)^\s*#{1,6}\s+", "", markdown)
        markdown = markdown.replace("**", "").replace("__", "").replace("`", "")
        for paragraph in re.split(r"\n\s*\n", markdown):
            add(paragraph)
    answer = "\n\n".join(paragraphs)[:MAX_ANSWER].strip()
    return answer.replace(api_key, "[redacted]") if api_key else answer


def _results(items, api_key=""):
    results = []
    seen = set()
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        url = item.get("link", item.get("url", ""))
        if not isinstance(url, str) or len(url) > 4000:
            continue
        try:
            parsed = urlparse(url)
            if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
                continue
        except ValueError:
            continue
        if url in seen or (api_key and api_key in url) or "api_key=" in url.lower():
            continue
        title = _plain(item.get("title"), 250)
        if not title:
            continue
        snippet = _plain(item.get("snippet"))
        if api_key:
            title = title.replace(api_key, "[redacted]")
            snippet = snippet.replace(api_key, "[redacted]")
        seen.add(url)
        results.append({"title": title, "url": url, "snippet": snippet, "source": parsed.hostname.removeprefix("www.")})
        if len(results) == 5:
            break
    return results


def _read(key, track_id, query):
    record = _memory.get(key)
    if record is None:
        try:
            record = json.loads((CACHE_DIR / f"{key}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
    if not isinstance(record, dict):
        return None
    expires = record.get("expires_at")
    if (record.get("version") != VERSION or record.get("engine") != ENGINE or record.get("track_id") != track_id or record.get("query") != query
            or not isinstance(expires, (int, float)) or not math.isfinite(expires) or expires <= time.time()
            or not isinstance(record.get("fetched_at"), str) or not isinstance(record.get("sources"), list)
            or not isinstance(record.get("answer"), str) or not record["answer"].strip() or len(record["answer"]) > MAX_ANSWER):
        return None
    cleaned = _results(record["sources"])
    if len(cleaned) != len(record["sources"]):
        return None
    record = {**record, "sources": cleaned}
    _remember(key, record)
    return record


def _remember(key, record):
    _memory[key] = record
    _memory.move_to_end(key)
    while len(_memory) > MAX_ENTRIES:
        _memory.popitem(last=False)


def _write(key, record):
    _remember(key, record)
    temporary = None
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=CACHE_DIR, suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            json.dump(record, file, ensure_ascii=False)
        temporary.replace(CACHE_DIR / f"{key}.json")
        files = sorted(CACHE_DIR.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
        for old in files[MAX_ENTRIES:]:
            old.unlink(missing_ok=True)
    except OSError:
        logger.warning("Search results could not be saved to disk; using the session cache.")
    finally:
        if temporary:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def search_track(track):
    title = _plain(track.get("title"), 250)
    subject = f'NASA visualization "{title}"'
    nasa_id = track.get("nasa_id")
    if type(nasa_id) is int and nasa_id > 0:
        subject += f" (SVS {nasa_id}, https://svs.gsfc.nasa.gov/{nasa_id}/)"
    query = (f"Explain {subject} in three short paragraphs for a general audience. "
             "Describe what the visualization shows, why it matters, and how to interpret its colors and movement. "
             "Use NASA sources where available. Distinguish visual patterns from actual physical measurements. "
             "Do not claim this app's pixel features are calibrated temperature or velocity data.")
    identity = [VERSION, ENGINE, track["id"], query, _plain(track.get("description")), track.get("source")]
    key = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    with _lock:
        record = _read(key, track["id"], query)
        if record:
            return {name: record[name] for name in ("track_id", "engine", "query", "answer", "sources", "fetched_at")} | {"cached": True}
        api_key = os.environ.get("SERPAPI_API_KEY", "").strip()
        if not api_key:
            raise SearchUnavailable("Google AI Mode is not configured yet. Please try again once it is enabled.")
        failure_key = (key, hashlib.sha256(api_key.encode()).hexdigest())
        if _failures.get(failure_key, 0) > time.time():
            raise SearchUnavailable("Google AI Mode is temporarily unavailable. Please try again in a minute.")
        try:
            response = httpx.get("https://serpapi.com/search.json", params={
                "engine": ENGINE, "q": query, "api_key": api_key, "hl": "en", "gl": "us",
            }, timeout=60)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("error"):
                raise ValueError("Invalid AI Mode response")
            metadata = payload.get("search_metadata")
            if isinstance(metadata, dict) and metadata.get("status") in ("Processing", "Error"):
                raise ValueError("AI Mode response is not complete")
            answer = _answer_text(payload, api_key)
            if not answer:
                raise ValueError("AI Mode did not return an answer")
        except (httpx.HTTPError, ValueError, TypeError):
            # Provider exceptions/URLs can contain credentials: never return/log them.
            _failures[failure_key] = time.time() + 60
            while len(_failures) > MAX_ENTRIES:
                _failures.popitem(last=False)
            raise SearchUnavailable("Google AI Mode could not return an explanation. Please try again in a minute.") from None
        now = time.time()
        record = {"version": VERSION, "engine": ENGINE, "track_id": track["id"], "query": query,
                  "answer": answer, "sources": _results(payload.get("references", []), api_key),
                  "fetched_at": datetime.fromtimestamp(now, timezone.utc).isoformat(), "expires_at": now + CACHE_SECONDS}
        _write(key, record)
        return {name: record[name] for name in ("track_id", "engine", "query", "answer", "sources", "fetched_at")} | {"cached": False}
