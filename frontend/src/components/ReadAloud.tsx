import { useState } from "react";
import type { SpeechReader } from "../services/useAccessibility";

export default function ReadAloud({ speech }: { speech: SpeechReader }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <section className="speech-transcript" aria-labelledby="read-aloud-title">
      <div className="read-aloud-heading">
        <h2 id="read-aloud-title">Read aloud</h2>
        <div className="access-actions">
          <button className="access-button" type="button" aria-expanded={expanded} aria-controls="read-aloud-transcript" onClick={() => setExpanded((previous) => !previous)}>{expanded ? "Collapse read aloud" : "Expand read aloud"}</button>
          <button className="access-button" type="button" disabled={!speech.speaking} onClick={speech.stop}>Stop reading</button>
        </div>
      </div>
      <div id="read-aloud-transcript" hidden={!expanded}><p>{speech.text}</p></div>
      <p className="speech-message">{speech.message}</p>
    </section>
  );
}
