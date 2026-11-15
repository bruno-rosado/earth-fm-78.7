import { createElement } from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

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
