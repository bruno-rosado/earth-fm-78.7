import { createElement } from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { unified } from "unified";
import remarkParse from "remark-parse";

const heading = ({ children }) => createElement("h4", null, children);
const components = {
  h1: heading, h2: heading, h3: heading, h4: heading, h5: heading, h6: heading,
  img: () => null,
  a({ href, children }) {
    try {
      const url = new URL(href);
      if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) {
        return createElement("a", { href: url.href, target: "_blank", rel: "noopener noreferrer" },
          children, createElement("span", { className: "sr-only" }, " (opens in a new tab)"));
      }
    } catch { /* Invalid or unsafe links remain readable text. */ }
    return createElement("span", null, children);
  },
};

// No raw HTML, trusted TeX commands, or remote images. KaTeX includes MathML
// alongside its visual output so equations remain available to screen readers.
export function FormattedAiText({ text }) {
  return createElement(Markdown, {
    skipHtml: true,
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { trust: false, strict: "ignore", throwOnError: false, output: "htmlAndMathml", maxExpand: 1000, maxSize: 10 }]],
    components,
  }, text);
}

// Read labels and prose once, without Markdown punctuation, link URLs, or TeX
// commands. The spoken transcript uses the same Markdown structure as the view.
const speechParser = unified().use(remarkParse).use(remarkMath);
const spokenMath = (value) => value
  .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1 over $2")
  .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, "$1")
  .replace(/\^\s*\{?\s*\\circ\s*\}?|[°∘]/g, " degrees ")
  .replace(/degrees\s*C\b/g, "degrees Celsius")
  .replace(/degrees\s*F\b/g, "degrees Fahrenheit")
  .replace(/\\(?:approx|sim)\b|~/g, " approximately ")
  .replace(/\\times\b/g, " times ")
  .replace(/\\cdot\b/g, " times ")
  .replace(/\^\s*\{([^{}]*)\}|\^([a-zA-Z0-9]+)/g, " to the power $1$2 ")
  .replace(/\\([a-zA-Z]+)\b/g, " $1 ")
  .replace(/[{}]/g, "");

export function explanationNarration(text) {
  const read = (node) => {
    if (node.type === "html" || node.type === "image" || node.type === "imageReference" || node.type === "definition") return "";
    if (node.type === "math" || node.type === "inlineMath") return spokenMath(node.value);
    if (typeof node.value === "string") return node.value;
    const separator = ["root", "list", "listItem", "blockquote", "table", "tableRow"].includes(node.type) ? "\n" : "";
    return (node.children ?? []).map(read).join(separator);
  };
  const content = read(speechParser.parse(text))
    .replace(/~/g, " approximately ")
    .replace(/[°∘]\s*C\b/g, " degrees Celsius")
    .replace(/[°∘]\s*F\b/g, " degrees Fahrenheit")
    .replace(/\s+/g, " ").trim();
  return content ? `AI-generated explanation. ${content}` : "";
}
