import json
import math
import os
from pathlib import Path
from typing import Annotated, Literal

import httpx2 as httpx
from dotenv import load_dotenv
from google import genai
from google.genai import errors
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROMPT_PATH = BACKEND_DIR / "prompts" / "music_config.txt"
COLORS = ("red", "yellow", "green", "cyan", "blue", "magenta", "neutral")
Unit = Annotated[float, Field(ge=0, le=1)]
Velocity = Annotated[float, Field(ge=0.05, le=0.8)]
# Must match INSTRUMENTS in frontend/src/services/tone/musicGeneration.js.
Instrument = Literal[
    "synth", "fm_synth", "am_synth", "piano", "electric_piano", "bell", "marimba",
    "pluck", "strings", "organ", "flute", "choir",
]
CELL_FIELDS = ("presence", "temperature", "speed", "flow")


class MusicConfig(BaseModel):
    """Musical style for the fixed data-to-sound mapping in the frontend player."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal[2]
    track_id: str = Field(pattern=r"^[A-Za-z0-9_-]+$")
    bpm: int = Field(ge=50, le=120)
    key: str = Field(pattern=r"^[A-G](?:#|b)?$")
    mode: Literal["major", "minor", "dorian", "mixolydian", "lydian", "pentatonic_major", "pentatonic_minor"]
    low_octave: int = Field(ge=2, le=4)
    lead_instrument: Instrument
    pad_instrument: Instrument
    rhythm_grid: Literal["4n", "8n", "16n"]
    note_duration: Literal["2n", "4n", "8n", "16n"]
    density_range: list[Unit] = Field(min_length=2, max_length=2)
    velocity_range: list[Velocity] = Field(min_length=2, max_length=2)
    pad_level: Unit
    reverb: Annotated[float, Field(ge=0, le=0.8)]

    @model_validator(mode="after")
    def validate_musical_ranges(self):
        for values in (self.density_range, self.velocity_range):
            if values[0] > values[1]:
                raise ValueError("Ranges must be ordered minimum to maximum")
        if self.density_range[1] == 0:
            raise ValueError("Maximum note density must be positive")
        return self


class TrackInfo(BaseModel):
    """Track metadata sent for a vibe change (features stay in the browser)."""

    model_config = ConfigDict(extra="ignore")
    id: str = Field(pattern=r"^[A-Za-z0-9_-]+$")
    title: str = Field(max_length=300)
    description: str = Field(default="", max_length=2000)
    duration: float = Field(ge=0)


class GenerationRequest(BaseModel):
    """What the UI sends to change the vibe: the track, its summary, and a prompt."""

    model_config = ConfigDict(extra="forbid")
    track: TrackInfo
    summary: dict
    prompt: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def limit_summary_size(self):
        if len(json.dumps(self.summary)) > 20000:
            raise ValueError("Summary is too large")
        return self


class MusicConfigError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


def is_unit(value, low=0):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= 1


def summarize_features(features):
    if not isinstance(features, list) or not features:
        raise MusicConfigError(500, "Track features must be a nonempty array")
    previous = -1
    shape = None
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
        if not all(is_unit(value) for value in values):
            raise MusicConfigError(500, "Feature values must be between zero and one")
        if not math.isclose(sum(color.values()), 1, abs_tol=1e-6):
            raise MusicConfigError(500, "Color proportions must total one")
        grid = sample.get("grid")
        if not isinstance(grid, list) or not grid or not all(isinstance(row, list) and row for row in grid):
            raise MusicConfigError(500, "Features must contain a latitude/longitude grid")
        if shape not in (None, (len(grid), len(grid[0]))) or any(len(row) != len(grid[0]) for row in grid):
            raise MusicConfigError(500, "Feature grids must all have the same shape")
        shape = (len(grid), len(grid[0]))
        for cell in (cell for row in grid for cell in row):
            if (not isinstance(cell, list) or len(cell) != len(CELL_FIELDS)
                    or not all(is_unit(v) for v in cell[:3]) or not is_unit(cell[3], -1)):
                raise MusicConfigError(500, "Grid cells must be [presence, temperature, speed, flow]")
    summary = {
        "sample_count": len(features),
        "first_t": features[0]["t"],
        "last_t": features[-1]["t"],
        "grid_rows": shape[0],
        "grid_cols": shape[1],
    }
    for key in ("brightness", "motion", "contrast"):
        values = [sample[key] for sample in features]
        summary[key] = {"min": min(values), "max": max(values), "mean": sum(values) / len(values)}
    summary["mean_color"] = {key: sum(s["color"][key] for s in features) / len(features) for key in COLORS}
    # One entry per latitude band, north first, averaged over time and longitude.
    bands = []
    for row in range(shape[0]):
        cells = [cell for sample in features for cell in sample["grid"][row]]
        ocean = [cell for cell in cells if cell[0] > 0] or [[0, 0, 0, 0]]
        bands.append({
            "presence": round(sum(cell[0] for cell in cells) / len(cells), 3),
            "temperature": round(sum(cell[1] for cell in ocean) / len(ocean), 3),
            "speed": round(sum(cell[2] for cell in ocean) / len(ocean), 3),
            "flow": round(sum(cell[3] for cell in ocean) / len(ocean), 3),
        })
    summary["latitude_bands"] = bands
    return summary


def generate_config(track, summary, preferences=""):
    """Ask Gemini for a style from track metadata and a feature summary. Writes nothing."""
    load_dotenv(BACKEND_DIR / ".env", override=False)
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise MusicConfigError(503, "Set GEMINI_API_KEY in backend/.env and restart the backend.")
    model = os.getenv("GEMINI_MODEL", "").strip() or "gemini-3.5-flash-lite"
    schema = MusicConfig.model_json_schema()
    schema["properties"]["track_id"]["enum"] = [track["id"]]
    # The full grid is too large to be useful in a prompt; the summary describes it.
    payload = {"track": track, "summary": summary, "preferences": preferences}
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

    return config
