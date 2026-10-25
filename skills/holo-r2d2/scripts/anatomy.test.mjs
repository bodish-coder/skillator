// node --test skills/holo-r2d2/scripts - F83: the run drawn as a bench machine.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRun, render, artifactPage, standalonePage, renderAscii } from "./holo.mjs";
import { figureParts, behind } from "./anatomy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(HERE, "fixtures", n), "utf8");
const NOW = Date.parse("2026-09-01T12:30Z");
const FIXTURES = {
  "all states": fx("fixture-all-states.md"),
  plain: fx("fixture-plain.md"),
  "two qs": fx("repo-two-qs/_run.md").replaceAll("@LANDED@", "abc1234"),
};
// Read the table here by regex, independent of parseRun.
const rows = (md) => [...md.matchAll(/^\|\s*(\d+)\s*\|[^|]*\|([^|]*)\|[^|]*\|([^|]*)\|/gm)]
  .map((m) => ({ n: Number(m[1]), st: m[2].trim(), hb: m[3].trim() }));

for (const [name, md] of Object.entries(FIXTURES)) {
  test(`${name}: painter's order - no two parts overlap, nothing drawn before what hides it`, () => {
    const parts = figureParts(parseRun(md));
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        assert.ok(behind(a.box, b.box) || behind(b.box, a.box), `${a.id} and ${b.id} share space`);
        assert.ok(!(behind(b.box, a.box) && !behind(a.box, b.box)), `${b.id} is behind ${a.id} but drawn after it`);
      }
    }
  });

  test(`${name}: one station per stage, lamp = state, readout matches the run file`, () => {
    const run = parseRun(md);
    const page = artifactPage(render(run, { anatomy: true, now: NOW }));
    const rs = rows(md);
    for (const r of rs) {
      const state = { "": "pending", "~": "inflight", x: "landed", "!": "failed", "?": "parked", ">": "replanned" }[r.st] ?? "unknown";
      assert.match(page, new RegExp(`data-station="${r.n}" data-state="${state}"`), `station ${r.n}`);
    }
    assert.equal((page.match(/data-station="/g) || []).length, rs.length);
    const done = rs.filter((r) => r.st === "x" || r.st === ">").length;
    assert.ok(page.includes(`stage ${Math.min(done + 1, rs.length)} of ${rs.length}`), "stage n of m");
    const hbs = rs.map((r) => r.hb).filter((h) => /^\d{4}-/.test(h)).sort();
    if (hbs.length) {
      assert.ok(page.includes(`data-hb-at="${hbs[hbs.length - 1]}"`), "newest heartbeat");
      const min = Math.round((NOW - Date.parse(hbs[hbs.length - 1])) / 60000);
      assert.match(page, new RegExp(`heartbeat [^<]*${min < 60 ? min + " min" : min < 2880 ? Math.floor(min / 60) + " h" : Math.floor(min / 1440) + " d"}`), "heartbeat age");
    }
    assert.ok(page.includes(`resume: continue ${run.id}`), "resume sentence");
  });
}

test("all states: landed shows its sha, re-plan is a bypass, parked decisions are levers to the wizard", () => {
  const run = parseRun(FIXTURES["all states"]);
  const page = artifactPage(render(run, { anatomy: true, now: NOW }));
  assert.match(page, /data-station="1" data-state="landed"[^]*?>4d72860</, "sha on the landed tag");
  assert.ok(page.includes('data-bypass="5-6"'), "re-planned stage 5 rides a bypass track to stage 6");
  const levers = page.match(/<a class="lever"[^>]*>/g) || [];
  assert.equal(levers.length, 2, "Q1 and Q2 open/asked; settled Qs draw no lever");
  for (const l of levers) assert.match(l, /href="RUN-9\.wizard\.html"/);
  assert.ok(page.includes('data-belt="1-2"') && page.includes('data-belt="2-4"'), "after: lines are belts");
  assert.ok(!page.includes('data-belt="9-'), "no belt to a stage that is not there");
  assert.match(page, /class="bx lamp lamp-inflight"/);
  assert.match(page, /\.lamp-inflight,\.key-inflight\{--c:var\(--accent\)\}/, "in flight is the amber lamp");
});

test("page rules: both themes, offline, reduced motion stills it, ascii unchanged", () => {
  const run = parseRun(FIXTURES["all states"]);
  const r = render(run, { anatomy: true, now: NOW });
  const page = artifactPage(r), full = standalonePage(r);
  assert.ok(!/<(!doctype|html|head|body)\b/i.test(page));
  assert.ok(/^<!doctype html>/.test(full));
  assert.ok(page.includes(":root[data-theme=\"dark\"]") && page.includes("@media (prefers-color-scheme:dark)"));
  assert.ok(/--iso-top:[^;]+;[^]*:root\[data-theme="dark"\][^}]*--iso-top/.test(page), "figure tones in both themes");
  assert.ok(!/<script[^>]+src=/i.test(page) && !/https?:\/\//.test(page), "no external fetch");
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)\{[^}]*\.pulse\{animation:none/, "reduced motion stills the pulse");
  assert.ok(!artifactPage(render(run, { now: NOW })).includes("data-station"), "no figure without --anatomy");
  assert.equal(renderAscii(run), renderAscii(parseRun(FIXTURES["all states"])), "ascii untouched");
  assert.ok(!/<svg[^>]*role="img"[^>]*class="bench"/.test(page), "the bench is a group: its levers stay reachable");
});
