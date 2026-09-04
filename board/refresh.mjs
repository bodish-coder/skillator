#!/usr/bin/env node
// Re-bake board/index.html's built-in snapshot from the repo's TICKETS.md.
// Run from anywhere:  node board/refresh.mjs
// A page opened from file:// may not read a sibling file, so the board carries
// a snapshot. This is the one command that refreshes it.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, "index.html");
const mdPath = process.argv[2] ?? join(here, "..", "TICKETS.md");

const BEGIN = "<!--TICKETS:BEGIN-->";
const END = "<!--TICKETS:END-->";

const md = await readFile(mdPath, "utf8");
const html = await readFile(htmlPath, "utf8");

const a = html.indexOf(BEGIN);
const b = html.indexOf(END);
if (a === -1 || b === -1 || b < a) {
  console.error(`refresh: ${htmlPath} has no ${BEGIN} / ${END} block.`);
  process.exit(1);
}

// The payload lives in a <script type="text/plain">, so the only sequence that
// can break out of it is a closing script tag.
const safe = md.replace(/<\/script/gi, "<\\/script");

const next =
  html.slice(0, a + BEGIN.length) + "\n" + safe.replace(/\s*$/, "") + "\n" + html.slice(b);

if (next === html) {
  console.log("refresh: snapshot already current.");
} else {
  await writeFile(htmlPath, next);
  const n = (md.match(/^\s*[-*]\s+\[[ x~!>\-]\]/gm) || []).length;
  console.log(`refresh: baked ${n} ticket lines from ${mdPath} into ${htmlPath}`);
}
