// The LLM chooses the style; the same style and data always make the same notes.
//
// The video is an equirectangular world map. A scan line reads each longitude
// eastward over time, like Hearing Hubble's playhead.
// Each latitude band is a voice. Brightness or color sets pitch; latitude sets
// tone color and, averaged across the scan, harmony. Current speed sets note
// frequency and loudness, and east/west flow sets stereo pan.

const SILENT_BELOW = 0.08; // presence under this is land or empty map
const LEAD_RANGE = 24; // semitones across the image-data range
const CHORD_LATITUDE_MARGIN = 0.06; // hysteresis so chords don't flicker on a boundary

const SCAN_PATTERNS = ["left-to-right", "right-to-left", "clockwise", "counter-clockwise", "outward", "inward"];
export const DATA_SOURCES = Object.freeze(["brightness", "color"]);
const COLOR_WARMTH = {
  red: 0.875,
  yellow: 0.625,
  green: 0.375,
  cyan: 0.125,
  blue: 0,
  magenta: 1,
  neutral: 0.5,
};

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
};

// Chord roots as scale degrees, ordered from south to north.
const CHORD_ORDER = {
  major: [5, 1, 3, 0, 4],
  lydian: [5, 1, 3, 0, 4],
  mixolydian: [5, 1, 3, 0, 6],
  minor: [0, 3, 5, 2, 6],
  dorian: [0, 3, 1, 6, 2],
  pentatonic_major: [4, 1, 3, 0],
  pentatonic_minor: [0, 2, 3, 4],
};

// Used when a track does not have a stored music style.
export const DEFAULT_CONFIG = {
  schema_version: 2,
  bpm: 72,
  key: "D",
  mode: "pentatonic_major",
  low_octave: 3,
  lead_instrument: "fm_synth",
  pad_instrument: "am_synth",
  rhythm_grid: "8n",
  note_duration: "4n",
  density_range: [0.04, 0.45],
  velocity_range: [0.12, 0.55],
  pad_level: 0.55,
  reverb: 0.45,
};

const lerp = (low, high, amount) => low + (high - low) * amount;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smoothstep = (low, high, value) => {
  const x = clamp((value - low) / (high - low));
  return x * x * (3 - 2 * x);
};

export function scanPath(time, duration, pattern = "left-to-right") {
  if (!SCAN_PATTERNS.includes(pattern)) throw new Error("Unsupported scan pattern.");
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("A finite time and positive duration are required for the scan.");
  }
  const phase = clamp(time / duration);
  switch (pattern) {
    case "right-to-left":
      return { type: "vertical", position: 1 - phase };
    case "clockwise":
      return { type: "rotating-line", angle: phase * Math.PI * 2 };
    case "counter-clockwise":
      return { type: "rotating-line", angle: -phase * Math.PI * 2 };
    case "outward":
      return { type: "ring", radius: phase };
    case "inward":
      return { type: "ring", radius: 1 - phase };
    default:
      return { type: "vertical", position: phase };
  }
}

function sampleIndex(features, time) {
  if (time <= features[0].t) return [0, 0, 0];
  let index = 0;
  while (index + 1 < features.length && features[index + 1].t <= time) index++;
  if (index + 1 >= features.length) return [index, index, 0];
  const left = features[index].t;
  return [index, index + 1, clamp((time - left) / (features[index + 1].t - left))];
}

function colorWarmth(color) {
  const weight = Object.entries(COLOR_WARMTH).reduce((sum, [name]) => sum + color[name], 0);
  if (!Number.isFinite(weight) || weight <= 0) throw new Error("Color data is unavailable for sonification.");
  return Object.entries(COLOR_WARMTH).reduce(
    (sum, [name, warmth]) => sum + color[name] * warmth,
    0,
  ) / weight;
}

function sampleDataWarmth(features, time, dataSource) {
  if (!DATA_SOURCES.includes(dataSource)) throw new Error("Unsupported sonification data source.");

  const [a, b, amount] = sampleIndex(features, time);
  const read = (sample) => dataSource === "brightness" ? sample.brightness : colorWarmth(sample.color);
  return lerp(read(features[a]), read(features[b]), amount);
}

// Cell values at a time and map position, interpolated in time and longitude
// (wrapping around the date line). Returns [presence, temperature, speed, flow].
export function sampleCell(features, time, u, row) {
  const [a, b, amount] = sampleIndex(features, time);
  const cols = features[a].grid[row].length;
  const x = u * cols - 0.5;
  const left = ((Math.floor(x) % cols) + cols) % cols;
  const right = (left + 1) % cols;
  const across = x - Math.floor(x);
  const read = (sample, col) => sample.grid[row][col];
  return [0, 1, 2, 3].map((field) => {
    const atA = lerp(read(features[a], left)[field], read(features[a], right)[field], across);
    const atB = lerp(read(features[b], left)[field], read(features[b], right)[field], across);
    return lerp(atA, atB, amount);
  });
}

const averageCells = (cells) => cells[0].map((_, field) =>
  cells.reduce((sum, cell) => sum + cell[field], 0) / cells.length);

export function sampleScanCell(features, time, duration, row, pattern = "left-to-right", dataSource = "brightness") {
  const selectedWarmth = sampleDataWarmth(features, time, dataSource);
  const withSelectedWarmth = (cell) => [cell[0], selectedWarmth, cell[2], cell[3]];
  const rows = features[0].grid.length;
  const columns = features[0].grid[row].length;
  const y = (row + 0.5) / rows;
  const path = scanPath(time, duration, pattern);

  if (path.type === "vertical") return withSelectedWarmth(sampleCell(features, time, path.position, row));

  if (path.type === "rotating-line") {
    const dx = Math.cos(path.angle);
    const dy = Math.sin(path.angle);
    if (Math.abs(dy) < 1e-6) {
      if (Math.abs(y - 0.5) > 0.5 / rows) return [0, 0, 0, 0];
      return withSelectedWarmth(averageCells(Array.from({ length: columns }, (_, column) =>
        sampleCell(features, time, (column + 0.5) / columns, row))));
    }
    const top = 0.5 + ((row / rows - 0.5) * dx) / dy;
    const bottom = 0.5 + (((row + 1) / rows - 0.5) * dx) / dy;
    const left = Math.max(0, Math.min(top, bottom));
    const right = Math.min(1, Math.max(top, bottom));
    if (left > right) return [0, 0, 0, 0];
    const positions = Array.from({ length: columns }, (_, column) => (column + 0.5) / columns)
      .filter((u) => u >= left && u <= right);
    if (positions.length === 0) positions.push((left + right) / 2);
    return withSelectedWarmth(averageCells(positions.map((u) => sampleCell(features, time, u, row))));
  }

  // Scale both axes so the map corners lie at the outermost ring.
  const normalizedY = (y - 0.5) * Math.SQRT2;
  if (Math.abs(normalizedY) > path.radius) return [0, 0, 0, 0];
  const offset = Math.sqrt(path.radius ** 2 - normalizedY ** 2) / Math.SQRT2;
  const positions = [0.5 - offset, 0.5 + offset].filter((u, index, all) =>
    u >= 0 && u <= 1 && (index === 0 || Math.abs(u - all[0]) > 1e-6));
  if (positions.length === 0) return [0, 0, 0, 0];
  return withSelectedWarmth(averageCells(positions.map((u) => sampleCell(features, time, u, row))));
}

export function keyToPitchClass(key) {
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[key[0]];
  if (base === undefined) throw new Error(`Unsupported key: ${key}`);
  return (base + (key[1] === "#" ? 1 : key[1] === "b" ? -1 : 0) + 12) % 12;
}

// MIDI note of a scale degree (degrees past the scale length climb octaves).
function degreeToMidi(config, degree) {
  const scale = MODES[config.mode];
  const octave = Math.floor(degree / scale.length);
  const step = scale[((degree % scale.length) + scale.length) % scale.length];
  return (config.low_octave + 1 + octave) * 12 + keyToPitchClass(config.key) + step;
}

function chordPitchClasses(config, root) {
  return [0, 2, 4].map((offset) => degreeToMidi(config, root + offset) % 12);
}

function nearestScaleTone(config, midi) {
  const key = keyToPitchClass(config.key);
  const pitchClasses = MODES[config.mode].map((step) => (key + step) % 12);
  for (let distance = 0; distance <= 6; distance++) {
    for (const candidate of [midi - distance, midi + distance]) {
      if (pitchClasses.includes(((candidate % 12) + 12) % 12)) return candidate;
    }
  }
  return midi;
}

// Pitches for the pad: each chord tone placed in one octave around a fixed center,
// so consecutive chords move by small steps instead of jumping.
function voiceChord(config, pitchClasses) {
  const center = (config.low_octave + 2) * 12 + keyToPitchClass(config.key) + 7;
  return pitchClasses
    .map((pc) => center - 6 + ((pc - (center - 6)) % 12 + 12) % 12)
    .sort((a, b) => a - b);
}

const latitudeLevel = (row, rows) => rows === 1 ? 0.5 : (rows - 1 - row) / (rows - 1);

function normalizer(values, minimumRange) {
  const sorted = [...values].sort((a, b) => a - b);
  const lower = sorted[Math.floor((sorted.length - 1) * 0.1)];
  const upper = sorted[Math.ceil((sorted.length - 1) * 0.9)];
  return upper - lower < minimumRange ? clamp : (value) => clamp((value - lower) / (upper - lower));
}

// Presence-weighted latitude and ocean coverage under the scan.
function columnClimate(features, time, duration, pattern) {
  const rows = features[0].grid.length;
  let presence = 0;
  let warmth = 0;
  for (let row = 0; row < rows; row++) {
    const [p] = sampleScanCell(features, time, duration, row, pattern);
    presence += p;
    warmth += p * latitudeLevel(row, rows);
  }
  return { presence: presence / rows, warmth: presence > 0 ? warmth / presence : 0.5 };
}

function createChords(config, features, duration, pattern) {
  const bar = (60 / config.bpm) * 4;
  const order = CHORD_ORDER[config.mode];
  const bars = [];
  for (let t = 0; t < duration; t += bar) {
    // Look at the middle of the bar too, so a chord reflects the whole bar.
    const start = columnClimate(features, t, duration, pattern);
    const middle = columnClimate(features, Math.min(duration, t + bar / 2), duration, pattern);
    bars.push({ t, presence: (start.presence + middle.presence) / 2, warmth: (start.warmth + middle.warmth) / 2 });
  }
  const scaleLatitude = normalizer(bars.map((bar) => bar.warmth), 0.01);
  let previous = null;
  const chords = [];
  for (const { t, presence, warmth } of bars) {
    const level = scaleLatitude(warmth);
    let index = Math.min(order.length - 1, Math.floor(level * order.length));
    if (previous !== null && index !== previous) {
      // Stay on the previous chord unless latitude moved clearly past the boundary.
      const boundary = (index > previous ? index : previous) / order.length;
      if (Math.abs(level - boundary) < CHORD_LATITUDE_MARGIN) index = previous;
    }
    const root = order[index];
    if (index === previous) {
      // Hold a repeated chord instead of striking it again.
      chords.at(-1).duration = Math.min(t + bar, duration) - chords.at(-1).t;
      continue;
    }
    previous = index;
    const pitchClasses = chordPitchClasses(config, root);
    chords.push({
      t,
      duration: Math.min(bar, duration - t),
      root,
      pitchClasses,
      notes: voiceChord(config, pitchClasses),
      bass: degreeToMidi(config, root) - 12 * (config.low_octave > 2 ? 1 : 0),
      velocity: config.pad_level * lerp(0.35, 1, smoothstep(0, 0.6, presence)),
      warmth,
    });
  }
  return chords;
}

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const TRIADS = { "4,7": "", "3,7": "m", "3,6": "dim", "4,8": "+", "2,7": "sus2", "5,7": "sus4" };

// Name a three-note chord from its pitch classes in any inversion, e.g. "Bm".
export function chordName(pitchClasses) {
  for (const root of pitchClasses) {
    const intervals = pitchClasses.filter((pc) => pc !== root).map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
    const quality = TRIADS[intervals.join(",")];
    if (quality !== undefined) return NOTE_NAMES[root] + quality;
  }
  return NOTE_NAMES[pitchClasses[0]];
}

// What the scan line passes over across the track, for drawing a timeline:
// `steps` entries of { warmth, presence } evenly spaced from 0 to duration.
export function scanTimeline(features, duration, steps, pattern = "left-to-right") {
  return Array.from({ length: steps }, (_, i) =>
    columnClimate(features, (duration * i) / Math.max(1, steps - 1), duration, pattern));
}

export function createMusicEvents(config, features, duration, pattern = "left-to-right", dataSource = "brightness") {
  if (!features?.length || !features[0].grid?.length || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("Track features and duration are required for playback.");
  }
  if (!SCAN_PATTERNS.includes(pattern)) throw new Error("Unsupported scan pattern.");
  if (!DATA_SOURCES.includes(dataSource)) throw new Error("Unsupported sonification data source.");
  if (!MODES[config.mode]) throw new Error("Unsupported mode in music config.");
  const steps = { "4n": 1, "8n": 0.5, "16n": 0.25 };
  const interval = (60 / config.bpm) * steps[config.rhythm_grid];
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("Invalid rhythm settings.");

  const rows = features[0].grid.length;
  const chords = createChords(config, features, duration, pattern);
  const base = degreeToMidi(config, 0);
  const scalePitch = normalizer(features.map((sample) =>
    dataSource === "brightness" ? sample.brightness : colorWarmth(sample.color)), 1e-6);
  // Stagger voices so equal densities don't all fire on the same step.
  const phase = Array.from({ length: rows }, (_, row) => (row * 0.618) % 1);
  const leads = [];
  for (let step = 0; step * interval < duration; step++) {
    const t = step * interval;
    for (let row = 0; row < rows; row++) {
      const [presence, pitchData, speed, flow] = sampleScanCell(features, t, duration, row, pattern, dataSource);
      const audible = smoothstep(SILENT_BELOW, 0.3, presence);
      if (audible === 0) continue;
      phase[row] += lerp(...config.density_range, speed) * audible;
      if (phase[row] < 1) continue;
      phase[row] -= Math.floor(phase[row]);
      leads.push({
        t,
        row,
        note: nearestScaleTone(config, base + Math.round(LEAD_RANGE * scalePitch(pitchData))),
        velocity: lerp(...config.velocity_range, speed) * lerp(0.6, 1, audible),
        warmth: latitudeLevel(row, rows),
        pan: clamp(flow * 0.8, -0.8, 0.8),
      });
    }
  }
  return { leads, chords, rows };
}
