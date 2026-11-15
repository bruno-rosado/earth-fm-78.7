"""Feature validation and summary: checks a track's features and condenses them
into the compact `summary` the frontend derives its music style from."""
import math

COLORS = ("red", "yellow", "green", "cyan", "blue", "magenta", "neutral")
CELL_FIELDS = ("presence", "temperature", "speed", "flow")


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
