// The LLM chooses the style; the same style and data always make the same notes.
//
// The video is an equirectangular world map. A scan line reads the longitude that
// faces the viewer as the globe turns westward, like Hearing Hubble's playhead.
// Each latitude band is a voice (north = high). In a band, current speed sets how
// often and how loudly it plays, temperature sets tone color, and east/west flow
// sets stereo pan. The average temperature under the scan line picks the chords.

const SILENT_BELOW = 0.08; // presence under this is land or empty map
const LEAD_RANGE = 24; // semitones from the southern to the northern band
const CHORD_WARMTH_MARGIN = 0.06; // hysteresis so chords don't flicker on a boundary

export const SCAN_PERIOD = 40; // seconds for one full turn of the globe
export const SCAN_START = 0.1; // map position (0 = 180°W, 0.5 = 0°) facing the viewer at t = 0

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
};

// Chord roots as scale degrees, ordered from the coldest to the warmest sound.
const CHORD_ORDER = {
  major: [5, 1, 3, 0, 4],
  lydian: [5, 1, 3, 0, 4],
  mixolydian: [5, 1, 3, 0, 6],
  minor: [0, 3, 5, 2, 6],
  dorian: [0, 3, 1, 6, 2],
  pentatonic_major: [4, 1, 3, 0],
  pentatonic_minor: [0, 2, 3, 4],
};

// Used when no Gemini style has been generated for a track.
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

// Map position (0-1, west to east) under the scan line at a track time.
export function scanPosition(time) {
  const u = (SCAN_START - time / SCAN_PERIOD) % 1;
  return u < 0 ? u + 1 : u;
}

// The globe's y rotation that puts a map position in front of the camera.
// three.js spheres face +z at u = 0.25, and rotating by +θ moves u by -θ/2π.
export function globeRotationFor(u) {
  return 2 * Math.PI * (0.25 - u);
}

function sampleIndex(features, time) {
  if (time <= features[0].t) return [0, 0, 0];
  let index = 0;
  while (index + 1 < features.length && features[index + 1].t <= time) index++;
  if (index + 1 >= features.length) return [index, index, 0];
  const left = features[index].t;
  return [index, index + 1, clamp((time - left) / (features[index + 1].t - left))];
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

function nearestChordTone(midi, pitchClasses) {
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

function normalizer(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const lower = sorted[Math.floor((sorted.length - 1) * 0.1)];
  const upper = sorted[Math.ceil((sorted.length - 1) * 0.9)];
  return upper - lower < 0.01 ? () => 0.5 : (value) => clamp((value - lower) / (upper - lower));
}

// Average temperature and how much ocean lies under the scan line.
function columnClimate(features, time) {
  const u = scanPosition(time);
  const rows = features[0].grid.length;
  let presence = 0;
  let warmth = 0;
  for (let row = 0; row < rows; row++) {
    const [p, temperature] = sampleCell(features, time, u, row);
    presence += p;
    warmth += p * temperature;
  }
  return { presence: presence / rows, warmth: presence > 0 ? warmth / presence : 0.5 };
}

function createChords(config, features, duration) {
  const bar = (60 / config.bpm) * 4;
  const order = CHORD_ORDER[config.mode];
  const bars = [];
  for (let t = 0; t < duration; t += bar) {
    // Look at the middle of the bar too, so a chord reflects the whole bar.
    const start = columnClimate(features, t);
    const middle = columnClimate(features, Math.min(duration, t + bar / 2));
    bars.push({ t, presence: (start.presence + middle.presence) / 2, warmth: (start.warmth + middle.warmth) / 2 });
  }
  const scaleWarmth = normalizer(bars.map((b) => b.warmth));
  let previous = null;
  const chords = [];
  for (const { t, presence, warmth } of bars) {
    const level = scaleWarmth(warmth);
    let index = Math.min(order.length - 1, Math.floor(level * order.length));
    if (previous !== null && index !== previous) {
      // Stay on the previous chord unless warmth moved clearly past the boundary.
      const boundary = (index > previous ? index : previous) / order.length;
      if (Math.abs(level - boundary) < CHORD_WARMTH_MARGIN) index = previous;
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
export function scanTimeline(features, duration, steps) {
  return Array.from({ length: steps }, (_, i) => columnClimate(features, (duration * i) / Math.max(1, steps - 1)));
}

export function createMusicEvents(config, features, duration) {
  if (!features?.length || !features[0].grid?.length || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("Track features and duration are required for playback.");
  }
  if (!MODES[config.mode]) throw new Error("Unsupported mode in music config.");
  const steps = { "4n": 1, "8n": 0.5, "16n": 0.25 };
  const interval = (60 / config.bpm) * steps[config.rhythm_grid];
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("Invalid rhythm settings.");

  const rows = features[0].grid.length;
  const chords = createChords(config, features, duration);
  const base = degreeToMidi(config, 0);
  // Row 0 is the northernmost band, so it gets the highest pitch.
  const rowPitch = (row) => base + Math.round((LEAD_RANGE * (rows - 1 - row)) / Math.max(1, rows - 1));
  // Stagger voices so equal densities don't all fire on the same step.
  const phase = Array.from({ length: rows }, (_, row) => (row * 0.618) % 1);
  const leads = [];
  let chordIndex = 0;
  for (let step = 0; step * interval < duration; step++) {
    const t = step * interval;
    while (chordIndex + 1 < chords.length && chords[chordIndex + 1].t <= t) chordIndex++;
    const chord = chords[chordIndex];
    const u = scanPosition(t);
    for (let row = 0; row < rows; row++) {
      const [presence, temperature, speed, flow] = sampleCell(features, t, u, row);
      const audible = smoothstep(SILENT_BELOW, 0.3, presence);
      if (audible === 0) continue;
      phase[row] += lerp(...config.density_range, speed) * audible;
      if (phase[row] < 1) continue;
      phase[row] -= Math.floor(phase[row]);
      leads.push({
        t,
        row,
        note: nearestChordTone(rowPitch(row), chord.pitchClasses),
        velocity: lerp(...config.velocity_range, speed) * lerp(0.6, 1, audible),
        warmth: temperature,
        pan: clamp(flow * 0.8, -0.8, 0.8),
      });
    }
  }
  return { leads, chords, rows };
}
