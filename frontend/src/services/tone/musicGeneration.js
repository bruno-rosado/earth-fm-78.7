import * as Tone from "tone";
import { createMusicEvents } from "./musicMapping";

const INSTRUMENTS = { synth: Tone.Synth, fm_synth: Tone.FMSynth, am_synth: Tone.AMSynth };

export async function playMusic({ config, features, duration, video, signal, onEnded, onVideoError }) {
  await Tone.start();
  if (signal?.aborted) return { stop() {} };
  const Voice = INSTRUMENTS[config.instrument];
  if (!Voice) throw new Error("Unsupported instrument in music config.");
  const events = createMusicEvents(config, features, duration);
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();
  transport.bpm.value = config.bpm;
  transport.position = 0;
  const filter = new Tone.Filter(1200, "lowpass").toDestination();
  const synth = new Tone.PolySynth(Voice, { volume: -12 }).connect(filter);
  synth.maxPolyphony = 8;
  let stopped = false;
  const part = new Tone.Part((time, event) => {
    filter.frequency.setTargetAtTime(event.filterFrequency, time, 0.1);
    const seconds = Math.min(Tone.Time(config.note_duration).toSeconds(), duration - event.t);
    synth.triggerAttackRelease(event.note, seconds, time, event.velocity);
  }, events.map((event) => [event.t, event])).start(0);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", stop);
    transport.stop();
    transport.cancel();
    part.dispose();
    synth.dispose();
    filter.dispose();
    video?.pause();
  };
  signal?.addEventListener("abort", stop, { once: true });
  transport.scheduleOnce((time) => {
    Tone.getDraw().schedule(() => { stop(); onEnded?.(); }, time);
  }, duration);

  if (video) {
    try {
      video.currentTime = 0;
      await video.play();
    } catch {
      if (!stopped) onVideoError?.();
    }
  }
  if (!stopped) transport.start();
  return { stop };
}
