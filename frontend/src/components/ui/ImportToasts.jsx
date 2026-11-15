// Small progress toasts for imports while the browser panel is closed.
export default function ImportToasts({ jobs, hidden, onDismiss }) {
  const active = Object.entries(jobs).filter(([, job]) => job.status !== "done");
  if (hidden || active.length === 0) return null;
  return (
    <ul className="toasts" aria-live="polite">
      {active.map(([nasaId, job]) => (
        <li key={nasaId} className={`toast ${job.status === "error" ? "is-error" : ""}`}>
          <span className="toast-text">
            {job.status === "error" ? "Import failed" : job.status === "transcoding" ? "Optimizing video" : job.status === "analyzing" ? "Analyzing video" : "Downloading from NASA"}
            <small>{job.message}</small>
          </span>
          {job.status === "error"
            ? <button type="button" className="icon-button small" onClick={() => onDismiss(nasaId)} aria-label="Dismiss"><svg viewBox="0 0 24 24" aria-hidden><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
            : <span className="toast-ring" style={{ "--p": `${Math.round((job.progress ?? 0) * 100)}%` }} aria-hidden />}
        </li>
      ))}
    </ul>
  );
}
