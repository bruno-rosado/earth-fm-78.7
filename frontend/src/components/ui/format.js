// Small display helpers shared by the UI.

// The same blue -> red ramp as the NASA sea surface temperature colormap.
const RAMP = [[31, 63, 191], [31, 182, 201], [63, 191, 79], [232, 224, 58], [255, 138, 42], [232, 58, 42]];

export function temperatureColor(warmth, alpha = 1) {
  const x = Math.max(0, Math.min(1, warmth)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const [r, g, b] = RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// Map position (0-1, from 180°W) to a longitude label like "142.5°W".
export function formatLongitude(u) {
  const degrees = u * 360 - 180;
  const rounded = Math.abs(degrees).toFixed(1);
  if (rounded === "0.0" || rounded === "180.0") return `${rounded}°`;
  return `${rounded}°${degrees < 0 ? "W" : "E"}`;
}

// Roughly what a pole-to-pole line at this longitude mostly crosses.
const REGIONS = [
  [-180, "Pacific Ocean"], [-90, "The Americas"], [-60, "Atlantic Ocean"], [-20, "Atlantic · West Africa"],
  [15, "Africa · Europe"], [50, "Indian Ocean"], [100, "Maritime Asia · Australia"], [145, "Pacific Ocean"],
];
export function regionAt(u) {
  const degrees = u * 360 - 180;
  return REGIONS.findLast(([start]) => degrees >= start)[1];
}

export const bandLatitude = (row, rows) => {
  const lat = Math.round(90 - ((row + 0.5) * 180) / rows);
  return lat === 0 ? "0°" : `${Math.abs(lat)}°${lat > 0 ? "N" : "S"}`;
};
