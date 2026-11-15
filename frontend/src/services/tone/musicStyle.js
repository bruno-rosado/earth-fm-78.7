// The musical style (key, mode, tempo, instruments) is computed from the track's
// data, not chosen by a model. Same track, same style, every time. A mood preset
// can swap instruments and feel, but the key and tempo always come from the data.
//
//   key    <- the video's dominant hue (red = C, yellow = D, green = E, cyan = F#, ...)
//   mode   <- how warm the water is on average (warm = bright modes, cold = dark)
//   tempo  <- how fast the currents move on average
//   reverb <- how much open ocean there is (more ocean = more space)

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
// OpenCV hue bins used by the extractor, as angles on the color wheel.
const HUE_ANGLES = { red: 0, yellow: 60, green: 120, cyan: 180, blue: 240, magenta: 300 };

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const lerp = (low, high, amount) => low + (high - low) * amount;

export const MOODS = [
  { id: "natural", label: "Natural", hint: "Instruments picked from the data" },
  { id: "calm", label: "Calm", hint: "Flute and choir, slow and spacious" },
  { id: "cinematic", label: "Cinematic", hint: "Strings and piano, wide and dramatic" },
  { id: "playful", label: "Playful", hint: "Marimba and plucks, quick and bouncy" },
  { id: "deep", label: "Deep", hint: "Dark synths, low and slow" },
];

// Weighted average temperature, speed and ocean cover from the per-band summary.
function climate(summary) {
  const bands = summary?.latitude_bands ?? [];
  let weight = 0;
  let warmth = 0;
  let speed = 0;
  let presence = 0;
  for (const band of bands) {
    weight += band.presence;
    warmth += band.presence * band.temperature;
    speed += band.presence * band.speed;
    presence += band.presence;
  }
  return {
    warmth: weight > 0 ? warmth / weight : 0.5,
    speed: weight > 0 ? speed / weight : 0.3,
    presence: bands.length ? presence / bands.length : 0.5,
  };
}

// Circular mean of the video's hues, as a pitch class (30° per semitone).
export function keyFromColor(meanColor) {
  let x = 0;
  let y = 0;
  for (const [name, angle] of Object.entries(HUE_ANGLES)) {
    const share = meanColor?.[name] ?? 0;
    x += share * Math.cos((angle * Math.PI) / 180);
    y += share * Math.sin((angle * Math.PI) / 180);
  }
  if (Math.hypot(x, y) < 1e-6) return "C";
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return NOTE_NAMES[Math.round(degrees / 30) % 12];
}

export function modeFromWarmth(warmth) {
  if (warmth >= 0.65) return "lydian";
  if (warmth >= 0.5) return "major";
  if (warmth >= 0.35) return "mixolydian";
  if (warmth >= 0.2) return "dorian";
  return "minor";
}

export const tempoFromSpeed = (speed) => Math.round(lerp(56, 120, clamp(speed)));

function naturalInstruments({ warmth, speed }) {
  const lead = speed > 0.5 ? (warmth > 0.5 ? "marimba" : "pluck")
    : speed > 0.3 ? (warmth > 0.5 ? "electric_piano" : "piano")
      : warmth > 0.5 ? "flute" : "bell";
  const pad = warmth > 0.6 ? "strings" : warmth > 0.35 ? "synth" : "choir";
  return { lead_instrument: lead, pad_instrument: pad };
}

const MOOD_OVERRIDES = {
  natural: () => ({}),
  calm: () => ({ lead_instrument: "flute", pad_instrument: "choir", tempoScale: 0.8, reverb: 0.7, pad_level: 0.7, note_duration: "2n" }),
  cinematic: () => ({ lead_instrument: "piano", pad_instrument: "strings", reverb: 0.65, pad_level: 0.8 }),
  playful: () => ({ lead_instrument: "marimba", pad_instrument: "pluck", tempoScale: 1.15, reverb: 0.25, pad_level: 0.4, rhythm_grid: "16n", note_duration: "8n" }),
  deep: () => ({ lead_instrument: "am_synth", pad_instrument: "fm_synth", tempoScale: 0.75, reverb: 0.6, low_octave: 2, pad_level: 0.75 }),
};

// Style for a track. `summary` is computed by the backend from the features.
export function deriveStyle(track, mood = "natural") {
  const summary = track.summary ?? {};
  const { warmth, speed, presence } = climate(summary);
  const key = keyFromColor(summary.mean_color);
  const override = (MOOD_OVERRIDES[mood] ?? MOOD_OVERRIDES.natural)();
  const { tempoScale = 1, ...rest } = override;
  return {
    schema_version: 2,
    track_id: track.id,
    mood,
    key,
    mode: modeFromWarmth(warmth),
    bpm: clamp(Math.round(tempoFromSpeed(speed) * tempoScale), 50, 140),
    low_octave: warmth < 0.3 ? 2 : 3,
    ...naturalInstruments({ warmth, speed }),
    rhythm_grid: "8n",
    note_duration: "4n",
    // Wide ranges on purpose: quiet, slow water and fast, busy water should sound very different.
    density_range: [0.03, 0.4],
    velocity_range: [0.1, 0.6],
    pad_level: 0.6,
    reverb: lerp(0.3, 0.6, presence),
    // Kept so the UI can explain where the style came from.
    derived: { warmth, speed, presence },
    ...rest,
  };
}

// One line explaining the style, for the player.
export function describeStyle(style) {
  const { warmth, speed } = style.derived ?? {};
  const temp = warmth === undefined ? "" : warmth >= 0.5 ? "warm water → bright mode" : "cold water → dark mode";
  const pace = speed === undefined ? "" : `${style.bpm} BPM from current speed`;
  return [`key of ${style.key} from the video's color`, temp, pace].filter(Boolean).join(" · ");
}
