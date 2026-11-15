import { useMemo } from "react";
import { explanationNarration, FormattedAiText } from "../services/aiFormatting.js";
import type { SpeechReader } from "../services/useAccessibility";
import "katex/dist/katex.min.css";

export default function AiAnswer({ text, speech }: { text: string; speech: SpeechReader }) {
  const narration = useMemo(() => explanationNarration(text), [text]);
  const reading = speech.speaking && speech.text === narration;
  return <>
    <div className="access-actions explanation-reading-actions">
      <button className="access-button" type="button" disabled={!narration || reading} onClick={() => speech.read(narration)}>
        {reading ? "Reading explanation…" : speech.supported ? "Read explanation aloud" : "Show explanation transcript"}
      </button>
    </div>
    <FormattedAiText text={text} />
  </>;
}
