// The LLM chooses settings; the same recipe and data always make the same notes.
const COLORS = ["red", "yellow", "green", "cyan", "blue", "magenta", "neutral"];
const lerp = (low, high, amount) => low + (high - low) * amount;
const clamp = (value) => Math.max(0, Math.min(1, value));

export function interpolateFeatures(features, time) {
  if (time <= features[0].t) return features[0];
  let index = 0;
  while (index + 1 < features.length && features[index + 1].t <= time) index++;
  const left = features[index];
  const right = features[index + 1];
  if (!right) return left;
  const amount = clamp((time - left.t) / (right.t - left.t));
  return {
    t: time,
    brightness: lerp(left.brightness, right.brightness, amount),
    motion: lerp(left.motion, right.motion, amount),
    contrast: lerp(left.contrast, right.contrast, amount),
    color: Object.fromEntries(COLORS.map((key) => [key, lerp(left.color[key], right.color[key], amount)])),
  };
}

function normalizer(features, key) {
  const values = features.map((sample) => sample[key]).sort((a, b) => a - b);
  const lower = values[Math.floor((values.length - 1) * 0.1)];
  const upper = values[Math.ceil((values.length - 1) * 0.9)];
  return upper - lower < 0.01 ? () => 0.5 : (value) => clamp((value - lower) / (upper - lower));
}

export function createMusicEvents(config, features, duration) {
  if (!features?.length || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("Track features and duration are required for playback.");
  }
  const steps = { "4n": 1, "8n": 0.5, "16n": 0.25 };
  const interval = (60 / config.bpm) * steps[config.rhythm_grid];
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("Invalid rhythm settings.");
  const brightness = normalizer(features, "brightness");
  const motion = normalizer(features, "motion");
  const contrast = normalizer(features, "contrast");
  const events = [];
  let densityPhase = 1;
  for (let step = 0; step * interval < duration; step++) {
    const t = step * interval;
    const sample = interpolateFeatures(features, t);
    densityPhase += lerp(...config.density_range, motion(sample.motion));
    if (densityPhase < 1) continue;
    densityPhase -= 1;
    const noteIndex = Math.min(config.scale.length - 1, Math.floor(brightness(sample.brightness) * config.scale.length));
    const colored = 1 - sample.color.neutral;
    const warmth = colored > 0.0001
      ? clamp((sample.color.red + sample.color.yellow + sample.color.magenta) / colored)
      : 0.5;
    events.push({
      t,
      note: config.scale[noteIndex],
      velocity: lerp(...config.velocity_range, contrast(sample.contrast)),
      filterFrequency: 350 + warmth * 3200,
    });
  }
  return events;
}
