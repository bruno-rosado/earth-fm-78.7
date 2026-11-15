import { useCallback, useEffect, useRef, useState } from "react";
import { getImport, startImport } from "./api";

const POLL_MS = 700;

// Tracks NASA imports in progress, keyed by NASA visualization id.
// `onReady(track)` fires once when an import finishes.
export default function useImports(onReady) {
  const [jobs, setJobs] = useState({});
  const timers = useRef({});
  const ready = useRef(onReady);
  ready.current = onReady;

  const update = useCallback((nasaId, job) => {
    setJobs((all) => ({ ...all, [nasaId]: job }));
  }, []);

  const poll = useCallback((nasaId, jobId) => {
    timers.current[nasaId] = setTimeout(async () => {
      try {
        const job = await getImport(jobId);
        update(nasaId, job);
        if (job.status === "done") ready.current?.(job.track);
        else if (job.status !== "error") poll(nasaId, jobId);
      } catch (failure) {
        update(nasaId, { status: "error", message: failure.message, progress: 0 });
      }
    }, POLL_MS);
  }, [update]);

  const importVideo = useCallback(async (nasaId) => {
    update(nasaId, { status: "queued", progress: 0, message: "Starting…" });
    try {
      const job = await startImport(nasaId);
      update(nasaId, job);
      if (job.status === "done") ready.current?.(job.track);
      else if (job.status !== "error") poll(nasaId, job.id);
    } catch (failure) {
      update(nasaId, { status: "error", message: failure.message, progress: 0 });
    }
  }, [update, poll]);

  const dismiss = useCallback((nasaId) => {
    clearTimeout(timers.current[nasaId]);
    setJobs(({ [nasaId]: _, ...rest }) => rest);
  }, []);

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  return { jobs, importVideo, dismiss };
}
