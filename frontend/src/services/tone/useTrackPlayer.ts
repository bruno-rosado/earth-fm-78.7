import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPlayback, type Playback } from "./musicGeneration.js";
import { DEFAULT_CONFIG, type DataSource, type ScanPattern } from "./musicMapping.js";
import type { Track } from "../../types";

export interface TrackPlayer {
  ready: boolean;
  starting: boolean;
  playing: boolean;
  volume: number;
  scanPattern: ScanPattern;
  dataSource: DataSource;
  error: string;
  notice: string;
  play(): Promise<void>;
  pause(): void;
  toggle(): void;
  seek(seconds: number): void;
  setVolume(value: number): void;
  setScanPattern(pattern: ScanPattern): Promise<void>;
  setDataSource(source: DataSource): Promise<void>;
  setDucking(active: boolean): void;
  getTime(): number;
}

export default function useTrackPlayer(
  track: Track | null,
  videoRef: RefObject<HTMLVideoElement | null>,
): TrackPlayer {
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.8);
  const [scanPattern, setScanPatternState] = useState<ScanPattern>("left-to-right");
  const [dataSource, setDataSourceState] = useState<DataSource>("brightness");
  const volumeRef = useRef(0.8);
  const duckingRef = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const playback = useRef<Playback | null>(null);
  const revision = useRef(0);
  const position = useRef(0);
  const scanPatternRef = useRef<ScanPattern>("left-to-right");
  const dataSourceRef = useRef<DataSource>("brightness");

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
          scanPattern: scanPatternRef.current,
          dataSource: dataSourceRef.current,
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
        created.setVolume(volumeRef.current * (duckingRef.current ? 0.2 : 1));
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
  }, [track, ready, starting, videoRef]);

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
    volumeRef.current = next;
    setVolumeState(next);
    playback.current?.setVolume(next * (duckingRef.current ? 0.2 : 1));
  }, []);

  const reconfigurePlayback = useCallback(async (
    pattern: ScanPattern,
    source: DataSource,
    fallbackError: string,
  ) => {
    const currentPlayback = playback.current;
    const wasPlaying = currentPlayback?.isPlaying() ?? false;
    const currentTime = currentPlayback?.getTime() ?? position.current;
    position.current = currentTime;
    playback.current = null;
    currentPlayback?.dispose();
    if (!track || !ready || !wasPlaying) return;

    const currentRevision = revision.current;
    setStarting(true);
    setPlaying(false);
    setError("");
    try {
      const created = await createPlayback({
        config: track.config ?? { ...DEFAULT_CONFIG, track_id: track.id },
        features: track.features,
        duration: track.duration,
        video: videoRef.current,
        scanPattern: pattern,
        dataSource: source,
        onEnded: () => {
          if (revision.current === currentRevision) setPlaying(false);
        },
        onVideoError: () => {
          if (revision.current === currentRevision) setNotice("Video unavailable; audio will continue.");
        },
      });
      if (revision.current !== currentRevision
        || scanPatternRef.current !== pattern
        || dataSourceRef.current !== source) {
        created.dispose();
        return;
      }
      created.setVolume(volume);
      created.seek(currentTime);
      playback.current = created;
      await created.play();
      if (revision.current === currentRevision
        && scanPatternRef.current === pattern
        && dataSourceRef.current === source) setPlaying(true);
    } catch (failure) {
      if (revision.current === currentRevision
        && scanPatternRef.current === pattern
        && dataSourceRef.current === source) {
        setError(failure instanceof Error ? failure.message : fallbackError);
      }
    } finally {
      if (revision.current === currentRevision
        && scanPatternRef.current === pattern
        && dataSourceRef.current === source) setStarting(false);
    }
  }, [track, ready, videoRef, volume]);

  const setScanPattern = useCallback(async (pattern: ScanPattern) => {
    if (pattern === scanPatternRef.current) return;
    scanPatternRef.current = pattern;
    setScanPatternState(pattern);
    await reconfigurePlayback(pattern, dataSourceRef.current, "Could not change scanner pattern.");
  }, [reconfigurePlayback]);

  const setDataSource = useCallback(async (source: DataSource) => {
    if (source === dataSourceRef.current) return;
    dataSourceRef.current = source;
    setDataSourceState(source);
    await reconfigurePlayback(scanPatternRef.current, source, "Could not change sonification data source.");
  }, [reconfigurePlayback]);

  const setDucking = useCallback((active: boolean) => {
    duckingRef.current = active;
    playback.current?.setVolume(volumeRef.current * (active ? 0.2 : 1));
  }, []);

  const getTime = useCallback(() => playback.current?.getTime() ?? position.current, []);

  return {
    ready, starting, playing, volume, scanPattern, dataSource, error, notice, play, pause, toggle, seek, setVolume,
    setScanPattern, setDataSource, getTime,
  };
  return { ready, starting, playing, volume, error, notice, play, pause, toggle, seek, setVolume, setDucking, getTime };
}
