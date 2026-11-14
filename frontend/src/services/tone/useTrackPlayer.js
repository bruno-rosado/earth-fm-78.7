import { useCallback, useEffect, useRef, useState } from "react";
import { generateMusicConfig, getFeatures, getMusicConfig } from "../api";
import { createPlayback } from "./musicGeneration";
import { DEFAULT_CONFIG } from "./musicMapping";
import { sonification } from "./sonificationState";

const isTyping = (target) => Boolean(target?.closest?.("input, textarea, select"));

// Loads a track's features and style and owns its playback. The UI reads
// fast-changing values (time, levels) from `sonification` every frame; React
// state here only changes on user actions.
export default function useTrackPlayer(selectedTrack, videoRef, { autoPlay = false } = {}) {
  const [features, setFeatures] = useState(null);
  const [config, setConfig] = useState(null);
  const [configSource, setConfigSource] = useState("default");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const playback = useRef(null);
  const revision = useRef(0);
  const request = useRef(null);
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
    const current = ++revision.current;
    const abort = new AbortController();
    request.current = abort;
    disposePlayback();
    position.current = 0;
    pendingPlay.current = Boolean(selectedTrack && autoPlay);
    setFeatures(null);
    setConfig(null);
    setConfigSource("default");
    setGenerating(false);
    setError("");
    setNotice("");
    setLoading(Boolean(selectedTrack));
    if (selectedTrack) {
      Promise.all([
        getFeatures(selectedTrack.id, { signal: abort.signal }),
        getMusicConfig(selectedTrack.id, { signal: abort.signal }).then(
          (recipe) => ({ recipe, source: "generated" }),
          (failure) => {
            if (abort.signal.aborted) throw failure;
            if (failure.status === 409) return { recipe: null, source: "stale" };
            if (failure.status !== 404) setError(failure.message);
            return { recipe: null, source: "default" };
          },
        ),
      ]).then(([samples, { recipe, source }]) => {
        if (revision.current !== current) return;
        setFeatures(samples);
        setConfig(recipe ?? { ...DEFAULT_CONFIG, track_id: selectedTrack.id });
        setConfigSource(source);
      }).catch((failure) => {
        if (!abort.signal.aborted) setError(failure.message);
      }).finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    }
    return () => {
      revision.current++;
      abort.abort();
      disposePlayback();
    };
    // autoPlay is read once per track selection on purpose.
  }, [selectedTrack, disposePlayback]);

  const ready = Boolean(selectedTrack && features && config && !loading);

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

  const generate = useCallback(async (prompt) => {
    const abort = request.current;
    const current = revision.current;
    setGenerating(true);
    setError("");
    try {
      const recipe = await generateMusicConfig(selectedTrack.id, prompt, { signal: abort.signal });
      if (abort.signal.aborted || revision.current !== current) return;
      // Rebuild the instruments with the new style, continuing from the same moment.
      pendingPlay.current = playing;
      disposePlayback();
      setConfig(recipe);
      setConfigSource("generated");
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure.message);
    } finally {
      if (!abort.signal.aborted) setGenerating(false);
    }
  }, [selectedTrack, playing, disposePlayback]);

  return {
    features, config, configSource, duration, loading, generating, starting, playing, ready,
    volume, error, notice, play, pause, toggle, seek, setVolume, generate, getTime,
  };
}
