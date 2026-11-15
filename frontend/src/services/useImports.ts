import { useCallback, useEffect, useRef, useState } from "react";
import { getImport, startImport } from "./api";
import type { CatalogTrack, ImportJob } from "../types";

export default function useImports(onReady: (track: CatalogTrack) => void) {
  const [jobs, setJobs] = useState<Record<number, ImportJob>>({});
  const active = useRef(new Map<number, { controller: AbortController; timer?: ReturnType<typeof setTimeout> }>());
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => () => {
    for (const request of active.current.values()) {
      request.controller.abort();
      clearTimeout(request.timer);
    }
    active.current.clear();
  }, []);

  const importVideo = useCallback(async (nasaId: number) => {
    if (active.current.has(nasaId)) return;
    const request = { controller: new AbortController(), timer: undefined as ReturnType<typeof setTimeout> | undefined };
    active.current.set(nasaId, request);
    const pending: ImportJob = { id: "", nasa_id: nasaId, status: "queued", progress: 0, message: "Starting download…", track: null };
    setJobs((all) => ({ ...all, [nasaId]: pending }));

    const receive = (job: ImportJob) => {
      if (request.controller.signal.aborted) return;
      setJobs((all) => ({ ...all, [nasaId]: job }));
      if (job.status === "done" || job.status === "error") {
        active.current.delete(nasaId);
        if (job.status === "done" && job.track) ready.current(job.track);
      } else {
        request.timer = setTimeout(() => void poll(job.id), 1000);
      }
    };
    const fail = (error: unknown) => {
      if (request.controller.signal.aborted) return;
      active.current.delete(nasaId);
      setJobs((all) => ({ ...all, [nasaId]: {
        ...pending, status: "error", message: error instanceof Error ? error.message : "Import failed. Please try again.",
      } }));
    };
    const poll = async (id: string) => {
      try { receive(await getImport(id, request.controller.signal)); }
      catch (error) { fail(error); }
    };
    try { receive(await startImport(nasaId, request.controller.signal)); }
    catch (error) { fail(error); }
  }, []);

  const dismiss = (nasaId: number) => {
    if (active.current.has(nasaId)) return;
    setJobs((all) => {
      const next = { ...all };
      delete next[nasaId];
      return next;
    });
  };

  return { jobs, importVideo, dismiss };
}
