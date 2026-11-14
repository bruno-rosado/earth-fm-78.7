import * as Tone from "tone";
import { createMusicEvents } from "./musicMapping";
import { resetBands, sonification } from "./sonificationState";

const INSTRUMENTS = { synth: Tone.Synth, fm_synth: Tone.FMSynth, am_synth: Tone.AMSynth };

// Soft attacks and long releases keep notes from clicking and let them overlap.
const LEAD_OPTIONS = {
  synth: { oscillator: { type: "triangle" }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.25, release: 1.6 } },
  fm_synth: {
    harmonicity: 3, modulationIndex: 3.5, oscillator: { type: "sine" }, modulation: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 2.2 },
    modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.2, release: 1.5 },
  },
  am_synth: { harmonicity: 2, envelope: { attack: 0.03, decay: 0.5, sustain: 0.35, release: 1.8 } },
};
const PAD_OPTIONS = {
  synth: { oscillator: { type: "fattriangle", count: 3, spread: 18 }, envelope: { attack: 1.4, decay: 0.6, sustain: 0.8, release: 3.5 } },
  fm_synth: { harmonicity: 1, modulationIndex: 1.2, envelope: { attack: 1.2, decay: 0.8, sustain: 0.8, release: 3.5 } },
  am_synth: { harmonicity: 1.5, oscillator: { type: "sine" }, envelope: { attack: 1.6, decay: 0.6, sustain: 0.9, release: 4 } },
};
const FADE_IN = 0.6;
const TAIL = 3; // seconds of reverb tail after the track ends
const MAX_DRIFT = 0.75; // seek the video if it is this far from the audio clock

const midi = (note) => Tone.Frequency(note, "midi").toFrequency();

// Builds the instruments and schedules a whole track on the Tone transport.
// The transport is the master clock; the video follows it.
export async function createPlayback({ config, features, duration, video, onEnded, onVideoError }) {
  await Tone.start();
  const leadVoice = INSTRUMENTS[config.lead_instrument];
  const padVoice = INSTRUMENTS[config.pad_instrument];
  if (!leadVoice || !padVoice) throw new Error("Unsupported instrument in music config.");
  const events = createMusicEvents(config, features, duration);

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  transport.bpm.value = config.bpm;
  transport.seconds = 0;

  // Mix: leads -> delay -> reverb -> compressor -> limiter -> master -> speakers.
  const master = new Tone.Gain(0).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  const compressor = new Tone.Compressor({ threshold: -22, ratio: 3, attack: 0.03, release: 0.25 }).connect(limiter);
  const reverb = new Tone.Reverb({ decay: 7, preDelay: 0.03, wet: config.reverb }).connect(compressor);
  const delay = new Tone.FeedbackDelay({ delayTime: "4n.", feedback: 0.22, wet: 0.16 }).connect(reverb);
  const meter = new Tone.Meter({ smoothing: 0.85, normalRange: true });
  master.connect(meter);
  await reverb.ready;

  // One lead voice per latitude band, each with its own tone filter and pan.
  const voices = Array.from({ length: events.rows }, () => {
    const panner = new Tone.Panner(0).connect(delay);
    const filter = new Tone.Filter({ frequency: 1500, type: "lowpass", rolloff: -12 }).connect(panner);
    const synth = new Tone.PolySynth(leadVoice, { ...LEAD_OPTIONS[config.lead_instrument], volume: -11 }).connect(filter);
    synth.maxPolyphony = 4;
    return { synth, filter, panner };
  });
  const padFilter = new Tone.Filter({ frequency: 900, type: "lowpass", rolloff: -24 }).connect(reverb);
  const pad = new Tone.PolySynth(padVoice, { ...PAD_OPTIONS[config.pad_instrument], volume: -15 }).connect(padFilter);
  pad.maxPolyphony = 8;
  const bass = new Tone.MonoSynth({
    oscillator: { type: "sine" }, volume: -10,
    envelope: { attack: 0.5, decay: 0.4, sustain: 0.85, release: 2.5 },
    filterEnvelope: { attack: 0.5, baseFrequency: 140, octaves: 1.5, release: 2 },
  }).connect(compressor);
  const nodes = [master, limiter, compressor, reverb, delay, meter, padFilter, pad, bass,
    ...voices.flatMap((voice) => [voice.synth, voice.filter, voice.panner])];

  resetBands(events.rows);
  const draw = Tone.getDraw();
  const noteSeconds = Tone.Time(config.note_duration).toSeconds();
  const leadPart = new Tone.Part((time, lead) => {
    const voice = voices[lead.row];
    voice.filter.frequency.rampTo(380 + lead.warmth * 3800, 0.3, time);
    voice.panner.pan.rampTo(lead.pan, 0.5, time);
    voice.synth.triggerAttackRelease(midi(lead.note), noteSeconds, time, lead.velocity);
    draw.schedule(() => {
      const band = sonification.bands[lead.row];
      if (!band) return;
      band.level = Math.min(1, band.level + lead.velocity * 2);
      band.warmth = lead.warmth;
    }, time);
  }, events.leads.map((lead) => [lead.t, lead])).start(0);
  const chordPart = new Tone.Part((time, chord) => {
    padFilter.frequency.rampTo(500 + chord.warmth * 2200, 2, time);
    pad.triggerAttackRelease(chord.notes.map(midi), chord.duration + 0.4, time, chord.velocity);
    bass.triggerAttackRelease(midi(chord.bass), chord.duration * 0.95, time, chord.velocity * 0.9);
  }, events.chords.map((chord) => [chord.t, chord])).start(0);

  let volume = 0.8;
  let playing = false;
  let buffering = false;
  let ended = false;
  let disposed = false;
  let videoFailed = !video;
  const getTime = () => Math.min(duration, Math.max(0, transport.seconds));

  const silenceNotes = () => {
    voices.forEach((voice) => voice.synth.releaseAll());
    pad.releaseAll();
    bass.triggerRelease();
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
    if (!playing || ended) return;
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
    }
  };
  video?.addEventListener("waiting", onWaiting);
  video?.addEventListener("playing", onPlaying);

  const playVideo = async () => {
    if (videoFailed) return;
    try {
      video.currentTime = getTime();
      video.playbackRate = 1;
      await video.play();
    } catch {
      if (disposed) return;
      videoFailed = true;
      buffering = false;
      onVideoError?.();
    }
  };

  // schedule (not scheduleOnce) so the end fires again after seeking back.
  transport.schedule((time) => {
    ended = true;
    master.gain.rampTo(0, TAIL, time);
    draw.schedule(() => {
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
    isPlaying: () => playing,
    async play() {
      if (disposed || playing) return;
      if (ended || getTime() >= duration - 0.05) playback.seek(0);
      ended = false;
      playing = true;
      master.gain.cancelScheduledValues(Tone.now());
      master.gain.rampTo(volume, FADE_IN);
      transport.start("+0.05");
      await playVideo();
    },
    pause() {
      if (!playing) return;
      playing = false;
      buffering = false;
      transport.pause();
      silenceNotes();
      video?.pause();
    },
    seek(seconds) {
      const target = Math.min(duration - 0.05, Math.max(0, seconds));
      silenceNotes();
      transport.seconds = target;
      ended = false;
      if (!videoFailed) video.currentTime = target;
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
      video?.pause();
      if (video) video.playbackRate = 1;
      if (sonification.getTime === getTime) sonification.active = false;
      transport.stop();
      transport.cancel();
      leadPart.dispose();
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
  return playback;
}
