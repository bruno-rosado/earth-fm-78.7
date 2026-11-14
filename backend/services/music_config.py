import hashlib
import json
import math
import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Annotated, Literal

import httpx2 as httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

BACKEND_DIR = Path(__file__).resolve().parents[1]
CONFIG_DIR = BACKEND_DIR / "data" / "music-config"
PROMPT_PATH = BACKEND_DIR / "prompts" / "music_config.txt"
COLORS = ("red", "yellow", "green", "cyan", "blue", "magenta", "neutral")
Unit = Annotated[float, Field(ge=0, le=1)]
Velocity = Annotated[float, Field(ge=0.05, le=0.8)]
Note = Annotated[str, Field(pattern=r"^[A-G](?:#|b)?[2-6]$")]


class MusicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal[1]
    track_id: str = Field(pattern=r"^[A-Za-z0-9_-]+$")
    bpm: int = Field(ge=60, le=140)
    instrument: Literal["synth", "fm_synth", "am_synth"]
    scale: list[Note] = Field(min_length=3, max_length=12)
    rhythm_grid: Literal["4n", "8n", "16n"]
    note_duration: Literal["4n", "8n", "16n"]
    density_range: list[Unit] = Field(min_length=2, max_length=2)
    velocity_range: list[Velocity] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def validate_musical_ranges(self):
        semitones = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
        pitches = []
        for note in self.scale:
            accidental = 1 if "#" in note else -1 if "b" in note else 0
            pitches.append((int(note[-1]) + 1) * 12 + semitones[note[0]] + accidental)
        if any(right <= left for left, right in zip(pitches, pitches[1:])):
            raise ValueError("Scale pitches must be distinct and ascending")
        for values in (self.density_range, self.velocity_range):
            if values[0] > values[1]:
                raise ValueError("Ranges must be ordered minimum to maximum")
        if self.density_range[1] == 0:
            raise ValueError("Maximum note density must be positive")
        return self


class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(default="", max_length=1000)


class MusicConfigError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


def source_hash(track, features):
    content = json.dumps({"track": track, "features": features}, sort_keys=True, allow_nan=False)
    return hashlib.sha256(content.encode()).hexdigest()


def summarize_features(features):
    if not isinstance(features, list) or not features:
        raise MusicConfigError(500, "Track features must be a nonempty array")
    previous = -1
    for sample in features:
        if not isinstance(sample, dict):
            raise MusicConfigError(500, "Track features are invalid")
        t = sample.get("t")
        if type(t) not in (int, float) or not math.isfinite(t) or t < 0 or t <= previous:
            raise MusicConfigError(500, "Feature times must be nonnegative and increasing")
        previous = t
        color = sample.get("color")
        if not isinstance(color, dict) or set(color) != set(COLORS):
            raise MusicConfigError(500, "Features must contain the seven agreed color categories")
        values = [sample.get(key) for key in ("brightness", "motion", "contrast")] + list(color.values())
        if any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in values):
            raise MusicConfigError(500, "Feature values must be between zero and one")
        if not math.isclose(sum(color.values()), 1, abs_tol=1e-6):
            raise MusicConfigError(500, "Color proportions must total one")
    summary = {"sample_count": len(features), "first_t": features[0]["t"], "last_t": features[-1]["t"]}
    for key in ("brightness", "motion", "contrast"):
        values = [sample[key] for sample in features]
        summary[key] = {"min": min(values), "max": max(values), "mean": sum(values) / len(values)}
    summary["mean_color"] = {key: sum(s["color"][key] for s in features) / len(features) for key in COLORS}
    return summary


def config_path(track):
    track_id = track["id"]
    if not isinstance(track_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", track_id):
        raise MusicConfigError(500, "Track ID is invalid")
    return CONFIG_DIR / f"{track_id}.json"


def read_config(track, features):
    path = config_path(track)
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise MusicConfigError(404, "No music config yet. Generate one for this track.") from None
    except json.JSONDecodeError:
        raise MusicConfigError(500, "Saved music config is invalid. Generate a new one.") from None
    try:
        config = MusicConfig.model_validate(record["config"])
        if config.track_id != track["id"]:
            raise ValueError("Track ID mismatch")
        if record["source_hash"] != source_hash(track, features):
            raise MusicConfigError(409, "Track data changed. Generate a new music config.")
    except (KeyError, TypeError, ValueError):
        raise MusicConfigError(500, "Saved music config is invalid. Generate a new one.") from None
    return config


def generate_config(track, features, preferences=""):
    load_dotenv(BACKEND_DIR / ".env", override=False)
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise MusicConfigError(503, "Set GEMINI_API_KEY in backend/.env and restart the backend.")
    summary = summarize_features(features)
    model = os.getenv("GEMINI_MODEL", "").strip() or "gemini-3.5-flash-lite"
    schema = MusicConfig.model_json_schema()
    schema["properties"]["track_id"]["enum"] = [track["id"]]
    payload = {"track": track, "features": features, "summary": summary, "preferences": preferences}
    try:
        with genai.Client(api_key=key, http_options={"timeout": 60000}) as client:
            response = client.interactions.create(
                model=model,
                system_instruction=PROMPT_PATH.read_text(encoding="utf-8"),
                input=json.dumps(payload, allow_nan=False),
                response_format={"type": "text", "mime_type": "application/json", "schema": schema},
                store=False,
                timeout=60,
                automatic_continuation=False,
            )
        if response.status != "completed":
            raise MusicConfigError(502, "Gemini did not finish the music config. Try generating again.")
        config = MusicConfig.model_validate_json(response.output_text or "")
        if config.track_id != track["id"]:
            raise ValueError("Track ID mismatch")
    except errors.APIError as error:
        status = 503 if error.code in (401, 403, 429) else 502
        raise MusicConfigError(status, "Gemini could not generate a config. Check the backend key, model, and quota.") from None
    except (httpx.TimeoutException, TimeoutError):
        raise MusicConfigError(504, "Gemini timed out. Try generating again.") from None
    except httpx.HTTPError:
        raise MusicConfigError(502, "Could not reach Gemini. Try generating again.") from None
    except (ValidationError, ValueError):
        raise MusicConfigError(502, "Gemini returned an invalid music config. Try generating again.") from None

    path = config_path(track)
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {"source_hash": source_hash(track, features), "config": config.model_dump()}
    temporary = None
    try:
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            json.dump(record, file, indent=2, allow_nan=False)
            file.write("\n")
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return config
