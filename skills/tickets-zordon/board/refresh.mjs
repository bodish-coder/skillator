#!/usr/bin/env node
// Bake the repo's TICKETS.md into a standalone file:// board viewer — the rich
// one, with search and filters. `artifact.mjs` is the publishable counterpart.
// Run from the repo root:  node <skills>/ticket-master/board/refresh.mjs
// A page opened from file:// may not read a sibling file, so the board carries
// its snapshot inline. This is the one command that refreshes it.
//
// index.html beside this script is the TEMPLATE and is never written to: post
// install it is shared by every repo, so baking in place would let one repo's
// board overwrite another's. Output goes to the tree the TICKETS.md came from.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tplPath = join(here, "index.html");
const mdPath = process.argv[2] ?? join(process.cwd(), "TICKETS.md");
const outPath = process.argv[3] ?? join(process.cwd(), ".tickets-board-full.html");

const BEGIN = "<!--TICKETS:BEGIN-->";
const END = "<!--TICKETS:END-->";

const md = await readFile(mdPath, "utf8");
const html = await readFile(tplPath, "utf8");

const a = html.indexOf(BEGIN);
const b = html.indexOf(END);
if (a === -1 || b === -1 || b < a) {
  console.error(`refresh: ${tplPath} has no ${BEGIN} / ${END} block.`);
  process.exit(1);
}

// The payload lives in a <script type="text/plain">, so the only sequence that
// can break out of it is a closing script tag.
const safe = md.replace(/<\/script/gi, "<\\/script");

const next =
  html.slice(0, a + BEGIN.length) + "\n" + safe.replace(/\s*$/, "") + "\n" + html.slice(b);

await writeFile(outPath, next);
const n = (md.match(/^\s*[-*]\s+\[[ x~!>\-]\]/gm) || []).length;
console.log(`refresh: baked ${n} ticket lines from ${mdPath} into ${outPath}`);
