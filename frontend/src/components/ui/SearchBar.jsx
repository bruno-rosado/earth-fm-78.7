// Top search bar. Focusing it opens the browser; typing searches NASA.
import { useEffect, useRef } from "react";

export default function SearchBar({ value, onChange, onOpen, onClose, open, busy }) {
  const inputRef = useRef(null);

  // "/" focuses the search from anywhere, like GitHub.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "/" && !event.target.closest?.("input, textarea")) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className={`search ${open ? "is-open" : ""}`}
      role="search"
      onSubmit={(event) => { event.preventDefault(); onOpen(); }}
    >
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden>
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m16.5 16.5 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder="Search NASA Earth visualizations — hurricanes, sea ice, wildfire smoke…"
        aria-label="Search NASA Earth visualizations"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onFocus={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (value) onChange("");
            else { event.target.blur(); onClose(); }
          }
        }}
      />
      {busy ? <span className="search-spinner" aria-label="Searching" /> : <kbd className="search-key" aria-hidden>/</kbd>}
    </form>
  );
}
