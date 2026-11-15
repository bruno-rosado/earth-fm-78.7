import { FormattedAiText } from "../services/aiFormatting.js";
import "katex/dist/katex.min.css";

export default function AiAnswer({ text }: { text: string }) {
  return <FormattedAiText text={text} />;
}
