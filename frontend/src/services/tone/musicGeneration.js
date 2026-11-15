import * as Tone from "tone";
import { chordName, createMusicEvents, scanPosition } from "./musicMapping";
import { resetBands, sonification } from "./sonificationState";

// Instrument palette. The style picks one for the lead (melody and band voices)
// and one for the pad (sustained chords). Each is built from Tone.js synths; no samples to load.
// `lead` options shape short notes; `pad` options shape long held chords.
// `trim` (dB) evens out loudness between bright and soft instruments.
const env = (attack, decay, sustain, release) => ({ attack, decay, sustain, release });
const INSTRUMENTS = {
  synth: {
    voice: Tone.Synth,
    lead: { oscillator: { type: "triangle" }, envelope: env(0.02, 0.4, 0.25, 1.6) },
    pad: { oscillator: { type: "fattriangle", count: 3, spread: 18 }, envelope: env(1.4, 0.6, 0.8, 3.5) },
  },
  fm_synth: {
    voice: Tone.FMSynth,
    lead: {
      harmonicity: 3, modulationIndex: 3.5, oscillator: { type: "sine" }, modulation: { type: "sine" },
      envelope: env(0.01, 0.8, 0.1, 2.2), modulationEnvelope: env(0.01, 0.5, 0.2, 1.5),
    },
    pad: { harmonicity: 1, modulationIndex: 1.2, envelope: env(1.2, 0.8, 0.8, 3.5) },
  },
  am_synth: {
    voice: Tone.AMSynth,
    lead: { harmonicity: 2, envelope: env(0.03, 0.5, 0.35, 1.8) },
    pad: { harmonicity: 1.5, oscillator: { type: "sine" }, envelope: env(1.6, 0.6, 0.9, 4) },
  },
  piano: {
    voice: Tone.FMSynth,
    lead: {
      harmonicity: 2, modulationIndex: 1.6, oscillator: { type: "triangle" }, modulation: { type: "sine" },
      envelope: env(0.005, 1.4, 0.05, 1.2), modulationEnvelope: env(0.005, 0.6, 0, 0.8),
    },
    pad: {
      harmonicity: 2, modulationIndex: 1, oscillator: { type: "triangle" },
      envelope: env(0.01, 2.5, 0.3, 2.5), modulationEnvelope: env(0.01, 1, 0.1, 1),
    },
  },
  electric_piano: {
    voice: Tone.FMSynth,
    lead: {
      harmonicity: 1, modulationIndex: 6, oscillator: { type: "sine" }, modulation: { type: "sine" },
      envelope: env(0.005, 1.2, 0.15, 1.5), modulationEnvelope: env(0.005, 0.3, 0, 0.5),
    },
    pad: {
      harmonicity: 1, modulationIndex: 3, oscillator: { type: "sine" },
      envelope: env(0.02, 2, 0.4, 3), modulationEnvelope: env(0.02, 0.8, 0.1, 1),
    },
  },
  bell: {
    trim: -4, // dB; dense/bright tone, so quieter
    voice: Tone.FMSynth,
    lead: {
      harmonicity: 5.07, modulationIndex: 12, oscillator: { type: "sine" }, modulation: { type: "sine" },
      envelope: env(0.001, 2.5, 0, 3), modulationEnvelope: env(0.001, 1.5, 0, 2),
    },
    pad: {
      harmonicity: 3.5, modulationIndex: 4, oscillator: { type: "sine" },
      envelope: env(0.3, 3, 0.4, 5), modulationEnvelope: env(0.3, 2, 0.2, 3),
    },
  },
  marimba: {
    voice: Tone.FMSynth,
    lead: {
      harmonicity: 4, modulationIndex: 2, oscillator: { type: "sine" }, modulation: { type: "sine" },
      envelope: env(0.001, 0.45, 0, 0.4), modulationEnvelope: env(0.001, 0.1, 0, 0.1),
    },
    pad: { oscillator: { type: "sine" }, envelope: env(0.01, 1.2, 0.2, 1.5) },
  },
  pluck: {
    trim: -5, // dB; dense/bright tone, so quieter
    voice: Tone.Synth,
    lead: { oscillator: { type: "fatsawtooth", count: 2, spread: 10 }, envelope: env(0.002, 0.25, 0, 0.4) },
    pad: { oscillator: { type: "fatsawtooth", count: 3, spread: 20 }, envelope: env(0.01, 0.8, 0.3, 1.2) },
  },
  strings: {
    trim: -5, // dB; dense/bright tone, so quieter
    voice: Tone.Synth,
    lead: { oscillator: { type: "fatsawtooth", count: 3, spread: 25 }, envelope: env(0.25, 0.5, 0.7, 1.8) },
    pad: { oscillator: { type: "fatsawtooth", count: 5, spread: 35 }, envelope: env(2, 1, 0.9, 4) },
  },
  organ: {
    trim: -4, // dB; dense/bright tone, so quieter
    voice: Tone.Synth,
    lead: { oscillator: { type: "custom", partials: [1, 0.6, 0.4, 0.25, 0.15, 0.1] }, envelope: env(0.01, 0.1, 0.9, 0.3) },
    pad: { oscillator: { type: "custom", partials: [1, 0.5, 0.3, 0.2] }, envelope: env(0.2, 0.3, 1, 1.2) },
  },
  flute: {
    voice: Tone.AMSynth,
    lead: { harmonicity: 1, oscillator: { type: "sine" }, modulation: { type: "triangle" }, envelope: env(0.08, 0.3, 0.6, 0.9) },
    pad: { harmonicity: 1, oscillator: { type: "sine" }, envelope: env(1, 0.5, 0.8, 2.5) },
  },
  choir: {
    trim: -2, // dB; dense/bright tone, so quieter
    voice: Tone.Synth,
    lead: { oscillator: { type: "fatsine", count: 4, spread: 30 }, envelope: env(0.3, 0.4, 0.7, 2) },
    pad: { oscillator: { type: "fatsine", count: 6, spread: 40 }, envelope: env(2.5, 1, 0.9, 5) },
  },
};
const FADE_IN = 0.6;
const TAIL = 3; // seconds of reverb tail after the track ends
const MAX_DRIFT = 0.75; // seek the video if it is this far from the audio clock

const midi = (note) => Tone.Frequency(note, "midi").toFrequency();

// Builds the instruments and schedules a whole track on the Tone transport.
// The transport is the master clock; the video follows it.
// Overall loudness boost in dB. Raise for louder, lower if it sounds squashed.
const MAKEUP_DB = 8;

export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);
let playbackOwner = null;

export async function createPlayback({ config, features, duration, video, onEnded, onVideoError, isCurrent = () => true }) {
  await Tone.start();
  if (!isCurrent()) throw new Error("Playback changed while starting.");
  const leadInstrument = INSTRUMENTS[config.lead_instrument];
  const padInstrument = INSTRUMENTS[config.pad_instrument];
  if (!leadInstrument || !padInstrument) throw new Error("Unsupported instrument in music config.");
  const events = createMusicEvents(config, features, duration);

  const transport = Tone.getTransport();
  const owner = Symbol("playback");
  playbackOwner = owner;
  transport.stop();
  transport.cancel();
  transport.bpm.value = config.bpm;
  transport.seconds = 0;

  // Mix: leads -> delay -> reverb -> compressor -> makeup -> limiter -> master -> speakers.
  // Makeup gain raises overall loudness; the limiter after it stops clipping.
  const master = new Tone.Gain(0).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  const makeup = new Tone.Gain(MAKEUP_DB, "decibels").connect(limiter);
  const compressor = new Tone.Compressor({ threshold: -22, ratio: 3, attack: 0.03, release: 0.25 }).connect(makeup);
  const reverb = new Tone.Reverb({ decay: 7, preDelay: 0.03, wet: config.reverb }).connect(compressor);
  const delay = new Tone.FeedbackDelay({ delayTime: "4n.", maxDelay: 2.5, feedback: 0.22, wet: 0.16 }).connect(reverb);
  const meter = new Tone.Meter({ smoothing: 0.85, normalRange: true });
  const fft = new Tone.FFT({ size: 128, smoothing: 0.8 });
  master.connect(meter);
  master.connect(fft);
  await reverb.ready;
  if (!isCurrent()) {
    [master, limiter, makeup, compressor, reverb, delay, meter, fft].forEach((node) => node.dispose());
    throw new Error("Playback changed while preparing instruments.");
  }

  // Separate buses let listeners isolate the data voices without rebuilding the
  // synths or disturbing the shared audio/video clock.
  const melodyBus = new Tone.Gain(1).connect(delay);
  const textureBus = new Tone.Gain(1).connect(delay);
  const padBus = new Tone.Gain(1).connect(reverb);
  const bassBus = new Tone.Gain(1).connect(compressor);
  // Pad and bass have different effects routes; both follow the harmony fader.

  // The melody: one clear voice, loudest in the mix, with its own tone filter and pan.
  const melodyPanner = new Tone.Panner(0).connect(melodyBus);
  const melodyFilter = new Tone.Filter({ frequency: 2000, type: "lowpass", rolloff: -12 }).connect(melodyPanner);
  const melodySynth = new Tone.PolySynth(leadInstrument.voice, { ...leadInstrument.lead, volume: -4 + (leadInstrument.trim ?? 0) }).connect(melodyFilter);
  melodySynth.maxPolyphony = 16; // overlapping releases + grace notes must not steal the melody
  // Texture: one quiet voice per latitude band, each with its own tone filter and pan.
  const voices = Array.from({ length: events.rows }, () => {
    const panner = new Tone.Panner(0).connect(textureBus);
    const filter = new Tone.Filter({ frequency: 1500, type: "lowpass", rolloff: -12 }).connect(panner);
    const synth = new Tone.PolySynth(leadInstrument.voice, { ...leadInstrument.lead, volume: -17 + (leadInstrument.trim ?? 0) }).connect(filter);
    synth.maxPolyphony = 8;
    return { synth, filter, panner };
  });
  const padFilter = new Tone.Filter({ frequency: 900, type: "lowpass", rolloff: -24 }).connect(padBus);
  const pad = new Tone.PolySynth(padInstrument.voice, { ...padInstrument.pad, volume: -14 + (padInstrument.trim ?? 0) }).connect(padFilter);
  pad.maxPolyphony = 12;
  const bass = new Tone.MonoSynth({
    oscillator: { type: "sine" }, volume: -9,
    envelope: { attack: 0.5, decay: 0.4, sustain: 0.85, release: 2.5 },
    filterEnvelope: { attack: 0.5, baseFrequency: 140, octaves: 1.5, release: 2 },
  }).connect(bassBus);
  const nodes = [master, limiter, makeup, compressor, reverb, delay, meter, fft, padFilter, pad, bass,
    melodyBus, textureBus, padBus, bassBus,
    melodySynth, melodyFilter, melodyPanner, ...voices.flatMap((voice) => [voice.synth, voice.filter, voice.panner])];

  resetBands(events.rows);
  const draw = Tone.getDraw();
  const noteSeconds = Tone.Time(config.note_duration).toSeconds();
  const leadPart = new Tone.Part((time, lead) => {
    const voice = voices[lead.row];
    voice.filter.frequency.rampTo(380 + lead.warmth * 3800, 0.3, time);
    voice.panner.pan.rampTo(lead.pan, 0.5, time);
    voice.synth.triggerAttackRelease(midi(lead.note), noteSeconds, time, lead.velocity);
    draw.schedule(() => {
      if (disposed || playbackOwner !== owner) return;
      const band = sonification.bands[lead.row];
      if (!band) return;
      band.level = Math.min(1, band.level + lead.velocity * 2);
      band.warmth = lead.warmth;
      if (sonification.ripples.length < 64) {
        sonification.ripples.push({ row: lead.row, u: scanPosition(lead.t), warmth: lead.warmth, velocity: lead.velocity });
      }
    }, time);
  }, events.leads.map((lead) => [lead.t, lead])).start(0);
  const melodyPart = new Tone.Part((time, note) => {
    // Warm water opens the filter wide (bright), cold water keeps it dark.
    melodyFilter.frequency.setValueAtTime(300 + note.warmth * 5000, time);
    melodyPanner.pan.rampTo(note.pan, 0.3, time);
    melodySynth.triggerAttackRelease(midi(note.note), noteSeconds, time, note.velocity);
    draw.schedule(() => {
      if (disposed || playbackOwner !== owner) return;
      const band = sonification.bands[note.row];
      if (band) {
        band.level = 1;
        band.warmth = note.warmth;
      }
      sonification.pulse = note.velocity;
      sonification.hotRow = note.row;
      if (sonification.ripples.length < 64) {
        sonification.ripples.push({ row: note.row, u: scanPosition(note.t), warmth: note.warmth, velocity: Math.min(1, note.velocity * 1.3) });
      }
    }, time);
  }, events.melody.map((note) => [note.t, note])).start(0);
  const chordPart = new Tone.Part((time, chord) => {
    padFilter.frequency.rampTo(500 + chord.warmth * 2200, 2, time);
    pad.triggerAttackRelease(chord.notes.map(midi), chord.duration + 0.4, time, chord.velocity);
    bass.triggerAttackRelease(midi(chord.bass), chord.duration * 0.95, time, chord.velocity * 0.9);
    draw.schedule(() => {
      if (!disposed && playbackOwner === owner) sonification.chord = chordName(chord.pitchClasses);
    }, time);
  }, events.chords.map((chord) => [chord.t, chord])).start(0);

  let volume = 0.8;
  let playing = false;
  let buffering = false;
  let ended = false;
  let disposed = false;
  let timelineRevision = 0;
  let videoFailed = !video || Boolean(video.error);
  const getTime = () => Math.min(duration, Math.max(0, transport.seconds));

  const silenceNotes = () => {
    melodySynth.releaseAll();
    voices.forEach((voice) => voice.synth.releaseAll());
    pad.releaseAll();
    bass.triggerRelease();
  };

  // A sustained chord may have begun long before a seek or pause. Tone.Part
  // schedules note onsets, so restore the remainder explicitly when resuming.
  const restoreHarmony = () => {
    const seconds = getTime();
    if (seconds < 0.05 || seconds >= duration - 0.05) return;
    const chord = events.chords.findLast((event) => event.t <= seconds);
    const remaining = chord ? chord.t + chord.duration - seconds : 0;
    if (remaining <= 0.05) return;
    const time = Tone.now() + 0.06;
    padFilter.frequency.rampTo(500 + chord.warmth * 2200, 0.1, time);
    pad.triggerAttackRelease(chord.notes.map(midi), remaining, time, chord.velocity);
    bass.triggerAttackRelease(midi(chord.bass), remaining * 0.95, time, chord.velocity * 0.9);
    sonification.chord = chordName(chord.pitchClasses);
  };

  // Keep the video on the audio clock: nudge its rate for small drift, seek for large drift.
  const syncVideo = () => {
    if (videoFailed || !playing || buffering || video.paused || video.seeking) return;
    const drift = video.currentTime - getTime();
    if (Math.abs(drift) > MAX_DRIFT) {
      video.currentTime = getTime();
      video.playbackRate = 1;
    } else {
      video.playbackRate = Math.min(1.08, Math.max(0.92, 1 - drift * 0.5));
    }
  };
  const syncTimer = setInterval(syncVideo, 250);

  // If the video stalls to buffer, hold the music until it can continue.
  const onWaiting = () => {
    if (!playing || ended || videoFailed) return;
    buffering = true;
    transport.pause();
    silenceNotes();
  };
  const onPlaying = () => {
    if (!buffering) return;
    buffering = false;
    if (playing) {
      transport.seconds = video.currentTime;
      transport.start();
      restoreHarmony();
    }
  };
  const onVideoFailure = () => {
    if (disposed || videoFailed) return;
    videoFailed = true;
    const wasBuffering = buffering;
    buffering = false;
    onVideoError?.();
    if (playing && wasBuffering) {
      transport.start();
      restoreHarmony();
    }
  };
  video?.addEventListener("waiting", onWaiting);
  video?.addEventListener("playing", onPlaying);
  video?.addEventListener("error", onVideoFailure);

  const playVideo = async () => {
    if (videoFailed) return;
    try {
      video.currentTime = getTime();
      video.playbackRate = 1;
      await video.play();
    } catch {
      if (disposed) return;
      onVideoFailure();
    }
  };

  // schedule (not scheduleOnce) so the end fires again after seeking back.
  transport.schedule((time) => {
    if (disposed || playbackOwner !== owner) return;
    const scheduledRevision = timelineRevision;
    master.gain.rampTo(0, TAIL, time);
    draw.schedule(() => {
      if (disposed || playbackOwner !== owner || scheduledRevision !== timelineRevision || !playing) return;
      ended = true;
      playing = false;
      transport.pause();
      video?.pause();
      onEnded?.();
    }, time);
  }, duration);

  const playback = {
    duration,
    getTime,
    getLevel: () => Math.min(1, meter.getValue() * 2.5),
    getSpectrum: () => fft.getValue(),
    isPlaying: () => playing,
    async play() {
      if (disposed || playing) return;
      if (ended || getTime() >= duration - 0.05) playback.seek(0);
      ended = false;
      playing = true;
      master.gain.cancelScheduledValues(Tone.now());
      master.gain.rampTo(volume, FADE_IN);
      transport.start("+0.05");
      restoreHarmony();
      await playVideo();
    },
    pause() {
      if (!playing) return;
      timelineRevision++;
      playing = false;
      buffering = false;
      transport.pause();
      silenceNotes();
      video?.pause();
    },
    seek(seconds) {
      if (!Number.isFinite(seconds)) return;
      timelineRevision++;
      const target = Math.max(0, Math.min(duration - 0.05, seconds));
      silenceNotes();
      transport.seconds = target;
      ended = false;
      sonification.ripples.length = 0;
      sonification.chord = chordName(events.chords.findLast((chord) => chord.t <= target).pitchClasses);
      if (playing) {
        master.gain.cancelScheduledValues(Tone.now());
        master.gain.rampTo(volume, 0.1);
        restoreHarmony();
      }
      if (!videoFailed) video.currentTime = target;
    },
    setMix(levels) {
      const now = Tone.now();
      for (const [bus, value] of [[melodyBus, levels.melody], [textureBus, levels.texture], [padBus, levels.harmony], [bassBus, levels.harmony]]) {
        bus.gain.cancelScheduledValues(now);
        bus.gain.rampTo(Math.max(0, Math.min(1, value)), 0.1);
      }
    },
    setVolume(value) {
      volume = value;
      if (playing && !ended) master.gain.rampTo(value, 0.1);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      playing = false;
      clearInterval(syncTimer);
      video?.removeEventListener("waiting", onWaiting);
      video?.removeEventListener("playing", onPlaying);
      video?.removeEventListener("error", onVideoFailure);
      video?.pause();
      if (video) video.playbackRate = 1;
      if (sonification.getTime === getTime) sonification.active = false;
      if (playbackOwner === owner) {
        transport.stop();
        transport.cancel();
        playbackOwner = null;
      }
      leadPart.dispose();
      melodyPart.dispose();
      chordPart.dispose();
      // Let ringing notes fade out before tearing down so stopping never clicks.
      master.gain.cancelScheduledValues(Tone.now());
      master.gain.rampTo(0, 0.25);
      setTimeout(() => nodes.forEach((node) => node.dispose()), 400);
    },
  };

  sonification.active = true;
  sonification.getTime = getTime;
  sonification.getLevel = playback.getLevel;
  sonification.getSpectrum = playback.getSpectrum;
  return playback;
}
