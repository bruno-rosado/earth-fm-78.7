import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { explanationNarration, FormattedAiText } from "./aiFormatting.js";

const render = (text) => renderToStaticMarkup(createElement(FormattedAiText, { text }));

test("AI temperature notation renders as readable math instead of dollar-delimited LaTeX", () => {
  const text = String.raw`Green ($10^{\circ }\text{C}$ to $20^{\circ }\text{C}$) and yellow (\~ $25^{\circ }\text{C}$) up to red ($32^{\circ }\text{C}$).`;
  const html = render(text);
  assert.equal((html.match(/class="katex"/g) ?? []).length, 4);
  assert.equal((html.match(/<math /g) ?? []).length, 4, "math has an accessible MathML representation");
  assert.match(html, /<mn>20<\/mn>/);
  assert.match(html, /<mtext>C<\/mtext>/);
  assert.doesNotMatch(html, /katex-error|\$20|\\~/);
  assert.match(html, /yellow \(~/);
});

test("Markdown headings, emphasis, paragraphs, lists, and equations keep semantic formatting", () => {
  const html = render(String.raw`### Ocean colors

**Temperature** and movement.

- Warmer colors
- Cooler colors

$$
v = \frac{d}{t}
$$`);
  assert.match(html, /<h4>Ocean colors<\/h4>/);
  assert.match(html, /<strong>Temperature<\/strong>/);
  assert.match(html, /<ul>/);
  assert.match(html, /class="katex-display"/);
  assert.doesNotMatch(html, /katex-error/);
});

test("unsafe HTML, links, images, and trusted math commands cannot create executable markup", () => {
  const html = render(String.raw`<script>alert('x')</script>

[unsafe](javascript:alert%281%29)

![remote](https://example.com/tracker.png)

$\href{javascript:alert(1)}{unsafe}$

[NASA](https://svs.gsfc.nasa.gov/3912/)`);
  assert.doesNotMatch(html, /<script|<img|href="javascript:/);
  assert.match(html, /href="https:\/\/svs.gsfc.nasa.gov\/3912\/"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("malformed math leaves a readable fallback without crashing the explanation", () => {
  const html = render(String.raw`Before $\frac{broken}$ after.`);
  assert.match(html, /Before/);
  assert.match(html, /after/);
});

test("explanation narration reads prose and temperatures without Markdown or TeX", () => {
  const speech = explanationNarration(String.raw`## Ocean colors

**Green** ($10^{\circ }\text{C}$ to $20^{\circ }\text{C}$), yellow (\~ $25^{\circ }\text{C}$), red (32°C).

[Read more at NASA](https://svs.gsfc.nasa.gov/3912/).

![Tracking image](https://example.com/image.png)`);
  assert.match(speech, /^AI-generated explanation\. Ocean colors/);
  assert.match(speech, /10 degrees Celsius to 20 degrees Celsius/);
  assert.match(speech, /approximately 25 degrees Celsius/);
  assert.match(speech, /32 degrees Celsius/);
  assert.match(speech, /Read more at NASA/);
  assert.doesNotMatch(speech, /https:|Tracking image|\\text|\\circ|\$|\*\*|##/);
  assert.equal(explanationNarration(""), "");
});
