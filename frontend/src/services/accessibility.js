export const PREFERENCE_KEY = "earth-frequencies-accessibility-v1";

const bounded = (value, low, high, fallback) => typeof value === "number" && Number.isFinite(value)
  ? Math.max(low, Math.min(high, value)) : fallback;

export function sanitizePreferences(value, system = {}) {
  const input = value && typeof value === "object" ? value : {};
  return {
    highContrast: typeof input.highContrast === "boolean" ? input.highContrast : Boolean(system.highContrast),
    reducedMotion: typeof input.reducedMotion === "boolean" ? input.reducedMotion : Boolean(system.reducedMotion),
    textSize: ["standard", "large", "extra"].includes(input.textSize) ? input.textSize : "standard",
    speechRate: bounded(input.speechRate, 0.75, 1.5, 1),
    speechVolume: bounded(input.speechVolume, 0, 1, 1),
  };
}

export function formatSpokenTime(seconds) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes ? `${minutes} minute${minutes === 1 ? "" : "s"} ` : ""}${remainder} second${remainder === 1 ? "" : "s"}`;
}

const plain = (value) => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";
export const SOUND_LEGEND = "The scan reads the image from side to side. Higher image rows use higher notes. More visual flow produces more frequent, louder notes. Color warmth changes tone and harmony. Horizontal flow changes stereo position. These are features of the rendered visualization, not direct temperature or current-speed measurements.";
export const KEYBOARD_HELP = "Use Tab to move between controls, Enter or Space to activate buttons, and arrow keys to adjust sliders. Escape closes accessibility settings.";

export function describeTrack(track) {
  return `${plain(track.title)}. Duration: ${formatSpokenTime(track.duration)}. ${plain(track.description)} ${SOUND_LEGEND}`;
}

export function describePage(tracks) {
  return `Earth Frequencies. Listen to the shape of Earth. NASA visualizations become sound generated from their visual features. The collection has ${tracks.length} track${tracks.length === 1 ? "" : "s"}. ${tracks.map((track) => `${plain(track.title)}. Duration: ${formatSpokenTime(track.duration)}. ${plain(track.description)}`).join(" ")} Choose a track, then press Play to start its video and music. High contrast, text size, reduced motion, and narration controls are in Accessibility settings. ${KEYBOARD_HELP}`;
}

// Binary lookup shares the actual feature timestamps; unavailable data stays null.
export function currentVisualData(features, seconds) {
  if (!features?.length) return { brightness: null, contrast: null, motion: null };
  let low = 0;
  let high = features.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (features[middle].t <= seconds) low = middle + 1;
    else high = middle;
  }
  const a = features[Math.max(0, low - 1)];
  const b = features[Math.min(features.length - 1, low)];
  const mix = a === b ? 0 : Math.max(0, Math.min(1, (seconds - a.t) / (b.t - a.t)));
  return Object.fromEntries(["brightness", "contrast", "motion"].map((key) => {
    const value = mix === 0 ? a[key] : mix === 1 ? b[key]
      : Number.isFinite(a[key]) && Number.isFinite(b[key]) ? a[key] + (b[key] - a[key]) * mix : null;
    return [key, Number.isFinite(value) ? value : null];
  }));
}

export function formatVisualValue(value) {
  return Number.isFinite(value) ? `${Math.round(value * 1000) / 10}%` : "Unavailable";
}

