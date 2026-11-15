import { useCallback, useEffect, useRef, useState } from "react";
import { createPlayback } from "./musicGeneration";
import { deriveStyle } from "./musicStyle";
import { sonification } from "./sonificationState";

const isTyping = (target) => Boolean(target?.closest?.("input, textarea, select"));

// Takes a track (with its features and summary attached) and owns its playback.
// The style is derived from the summary, with an optional mood preset. The UI
// reads fast-changing values (time, levels) from `sonification` every frame;
// React state here only changes on user actions.
export default function useTrackPlayer(selectedTrack, videoRef, { autoPlay = false } = {}) {
  const [features, setFeatures] = useState(null);
  const [config, setConfig] = useState(null);
  const [mood, setMoodState] = useState("natural");
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const playback = useRef(null);
  const revision = useRef(0);
  const pendingPlay = useRef(false); // play as soon as the track is ready
  const position = useRef(0); // time to start from when no playback exists yet
  const duration = selectedTrack?.duration ?? 0;

  const disposePlayback = useCallback(() => {
    if (playback.current) position.current = playback.current.getTime();
    playback.current?.dispose();
    playback.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    revision.current++;
    disposePlayback();
    position.current = 0;
    pendingPlay.current = Boolean(selectedTrack && autoPlay);
    setFeatures(null);
    setConfig(null);
    setMoodState("natural");
    setError("");
    setNotice("");
    if (selectedTrack) {
      // The track list already carries the features and summary.
      setFeatures(selectedTrack.features);
      setConfig(deriveStyle(selectedTrack, "natural"));
    }
    return () => {
      revision.current++;
      disposePlayback();
    };
    // autoPlay is read once per track selection on purpose.
  }, [selectedTrack, disposePlayback]);

  const ready = Boolean(selectedTrack && features && config);

  const play = useCallback(async () => {
    if (!ready || starting) return;
    const current = revision.current;
    setError("");
    setStarting(true);
    try {
      if (!playback.current) {
        const created = await createPlayback({
          config, features, duration, video: videoRef?.current,
          onEnded: () => {
            if (revision.current === current) setPlaying(false);
          },
          onVideoError: () => {
            if (revision.current === current) setNotice("Video unavailable; playing audio only.");
          },
        });
        if (revision.current !== current) {
          created.dispose();
          return;
        }
        created.setVolume(volume);
        created.seek(position.current >= duration - 0.1 ? 0 : position.current);
        playback.current = created;
      }
      await playback.current.play();
      if (revision.current === current) setPlaying(true);
    } catch (failure) {
      if (revision.current === current) setError(failure.message);
    } finally {
      if (revision.current === current) setStarting(false);
    }
  }, [ready, starting, config, features, duration, videoRef, volume]);

  const pause = useCallback(() => {
    playback.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, play, pause]);

  // Start once loaded if asked to (the hero button, or a new style mid-song).
  useEffect(() => {
    if (pendingPlay.current && ready && !playback.current) {
      pendingPlay.current = false;
      play();
    }
  }, [ready, config, play]);

  // Space toggles play/pause; the globe can be clicked to toggle too.
  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== "Space" || isTyping(event.target) || event.target?.closest?.("button")) return;
      if (!selectedTrack) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    sonification.toggle = selectedTrack ? toggle : null;
    return () => {
      window.removeEventListener("keydown", onKey);
      sonification.toggle = null;
    };
  }, [toggle, selectedTrack]);

  const getTime = useCallback(
    () => (playback.current ? playback.current.getTime() : position.current),
    [],
  );

  const seek = useCallback((seconds) => {
    position.current = seconds;
    playback.current?.seek(seconds);
  }, []);

  const setVolume = useCallback((value) => {
    setVolumeState(value);
    playback.current?.setVolume(value);
  }, []);

  // Swap the mood preset; playback continues from the same moment with new instruments.
  const setMood = useCallback((next) => {
    if (!selectedTrack || next === mood) return;
    pendingPlay.current = playing;
    disposePlayback();
    setMoodState(next);
    setConfig(deriveStyle(selectedTrack, next));
  }, [selectedTrack, mood, playing, disposePlayback]);

  return {
    features, config, mood, duration, starting, playing, ready,
    volume, error, notice, play, pause, toggle, seek, setVolume, setMood, getTime,
  };
}
