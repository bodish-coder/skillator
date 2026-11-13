import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseRun, render, artifactPage, standalonePage, renderAscii, parseArgs, layout } from "./holo.mjs";
import { FORMATS, THEMES, parseTime, themeCss, formatPage, timelineModel } from "./formats.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(HERE, "fixtures", n), "utf8");

test("cli: --format/--theme parse in both spellings, refuse unknowns and bad combos", () => {
  assert.equal(parseArgs(["RUN-9", "--format=timeline"]).format, "timeline");
  assert.equal(parseArgs(["RUN-9", "--format", "executive", "--theme=print"]).theme, "print");
  assert.equal(parseArgs(["RUN-9", "--html", "--theme", "dark"]).theme, "dark");
  assert.throws(() => parseArgs(["RUN-9", "--format=bogus"]), /unknown --format bogus \(timeline, executive, runbook, mindmap, default\)/);
  assert.throws(() => parseArgs(["RUN-9", "--theme=bogus", "--html"]), /unknown --theme bogus \(dark, light, contrast, print\)/);
  assert.throws(() => parseArgs(["RUN-9", "--format=timeline", "--md"]), /--format/);
  assert.throws(() => parseArgs(["RUN-9", "--format=timeline", "--anatomy"]), /--format/);
  assert.throws(() => parseArgs(["RUN-9", "--theme=dark"]), /--theme needs --html or --format/);
  assert.throws(() => parseArgs(["RUN-9", "--theme=dark", "--ascii"]), /--theme/);
});

test("parseTime: only full ISO stamps pass", () => {
  assert.equal(parseTime("2026-09-01T11:50Z"), Date.parse("2026-09-01T11:50Z"));
  for (const v of ["-", "", "4d72860", "stage 6", "dispatched", "09:40", "2026-09-01"]) assert.equal(parseTime(v), null, v);
});

test("model: prompt and dispatchedAt captured, fields inside prompts stay inert", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  assert.match(run.stages.find((s) => s.n === 2).prompt, /item F2: export\./);
  assert.equal(run.stages.find((s) => s.n === 2).dispatchedAt, "2026-09-01T11:00Z");
  assert.ok(!run.stages.find((s) => s.n === 2).files.some((f) => f.includes("prompt")), "prompt body is not a field");
  assert.equal(parseRun(fx("fixture-plain.md")).stages.find((s) => s.n === 21).dispatchedAt, "", "time-only head yields no date");
});

test("default output byte-identical; explicit theme only adds data-theme + themeCss", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  // runPath is printed in the footer, so it is part of the hashed bytes: keep it identical to Task 1 Step 1.
  assert.equal(sha(artifactPage(render(run, { runPath: "fixture-all-states.md" }))), "72fb231a1bf834d6a2e788e0cf19d65374223fa9388b1c386f40b72cc1c4efbd");
  assert.equal(sha(standalonePage(render(run, { runPath: "fixture-all-states.md" }))), "4372395b6c5980bb4e8ca5ada452600c934d2c72ca2546702bdecbdbc085ede1");
  assert.equal(sha(renderAscii(run)), "c9619d2f1d0c1be9d000e2169b5ae86df8b1ad89e6d80bcbd8289563bf809aae");
  const themed = standalonePage(render(run, { runPath: "fixture-all-states.md", theme: "contrast" }), "contrast");
  assert.ok(themed.includes('<html lang="en" data-theme="contrast">'));
  assert.ok(themed.includes(themeCss("contrast")) && themeCss("contrast").includes('[data-theme="contrast"]'));
  assert.equal(themeCss("dark"), "");
  assert.equal(themeCss(undefined), "");
});

test("timeline: bars only from recorded dispatched->heartbeat, critical path by stage count", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = timelineModel(run, layout(run));
  assert.deepEqual(m.criticalPath, [1, 2, 4], "longest after: chain 1->2->4");
  const s2 = m.rows.find((r) => r.n === 2);
  assert.deepEqual([s2.bar.from, s2.bar.to], [Date.parse("2026-09-01T11:00Z"), Date.parse("2026-09-01T11:50Z")], "observed window");
  assert.equal(m.rows.find((r) => r.n === 1).bar, null, "landed sha is not an end time");
  assert.ok(m.rows.every((r) => r.lane >= 0) && m.laneCount >= 1);
  const html = formatPage(run, "timeline", { layout: layout(run) });
  assert.ok(html.includes('data-format="timeline"') && html.includes('class="tl-svg"') && html.includes('data-critical="1"'));
  assert.ok(html.includes("critical path (longest after: chain, by stage count): 1 -&gt; 2 -&gt; 4"), "labelled chain, HTML-escaped arrow");
  assert.ok(!/duration: \d/.test(html), "no invented duration");
});

test("timeline: no stages and thin times still render", () => {
  const empty = parseRun("# RUN-7 - empty\n");
  const m = timelineModel(empty, layout(empty));
  assert.equal(m.window, null);
  assert.ok(formatPage(empty, "timeline", { layout: layout(empty) }).includes("No stage rows in this run file."));
});
