import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPlayback, type Playback } from "./musicGeneration.js";
import { DEFAULT_CONFIG } from "./musicMapping.js";
import type { Track } from "../../types";

export interface TrackPlayer {
  ready: boolean;
  starting: boolean;
  playing: boolean;
  volume: number;
  error: string;
  notice: string;
  play(): Promise<void>;
  pause(): void;
  toggle(): void;
  seek(seconds: number): void;
  setVolume(value: number): void;
  getTime(): number;
}

export default function useTrackPlayer(
  track: Track | null,
  videoRef: RefObject<HTMLVideoElement | null>,
): TrackPlayer {
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const playback = useRef<Playback | null>(null);
  const revision = useRef(0);
  const position = useRef(0);

  const disposePlayback = useCallback(() => {
    playback.current?.dispose();
    playback.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    revision.current += 1;
    disposePlayback();
    position.current = 0;
    setStarting(false);
    setError("");
    setNotice("");
    return () => {
      revision.current += 1;
      disposePlayback();
    };
  }, [track, disposePlayback]);

  const ready = Boolean(track?.features.length);

  const play = useCallback(async () => {
    if (!track || !ready || starting) return;
    const currentRevision = revision.current;
    setError("");
    setStarting(true);
    try {
      if (!playback.current) {
        const config = track.config ?? { ...DEFAULT_CONFIG, track_id: track.id };
        const created = await createPlayback({
          config,
          features: track.features,
          duration: track.duration,
          video: videoRef.current,
          onEnded: () => {
            if (revision.current === currentRevision) setPlaying(false);
          },
          onVideoError: () => {
            if (revision.current === currentRevision) setNotice("Video unavailable; audio will continue.");
          },
        });
        if (revision.current !== currentRevision) {
          created.dispose();
          return;
        }
        created.setVolume(volume);
        created.seek(position.current);
        playback.current = created;
      }
      await playback.current.play();
      if (revision.current === currentRevision) setPlaying(true);
    } catch (failure) {
      if (revision.current === currentRevision) {
        setError(failure instanceof Error ? failure.message : "Could not start playback.");
      }
    } finally {
      if (revision.current === currentRevision) setStarting(false);
    }
  }, [track, ready, starting, videoRef, volume]);

  const pause = useCallback(() => {
    playback.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else void play();
  }, [playing, pause, play]);

  const seek = useCallback((seconds: number) => {
    if (!track) return;
    position.current = Math.max(0, Math.min(track.duration, seconds));
    playback.current?.seek(position.current);
  }, [track]);

  const setVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolumeState(next);
    playback.current?.setVolume(next);
  }, []);

  const getTime = useCallback(() => playback.current?.getTime() ?? position.current, []);

  return { ready, starting, playing, volume, error, notice, play, pause, toggle, seek, setVolume, getTime };
}
