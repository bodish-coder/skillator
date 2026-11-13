import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseRun, render, artifactPage, standalonePage, renderAscii, parseArgs, layout } from "./holo.mjs";
import { FORMATS, THEMES, parseTime, themeCss, formatPage, timelineModel, executiveModel, runbookModel, mindmapModel } from "./formats.mjs";

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

test("executive: KPIs, audit of every decision, milestones, state-derived risks", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = executiveModel(run);
  assert.equal(m.kpis.total, 8);
  assert.equal(m.kpis.done, 2, "landed + replanned (anatomy readout rule)");
  assert.equal(m.kpis.pct, 25);
  assert.equal(m.kpis.openDecisions, 2);
  assert.deepEqual(m.milestones.map((x) => x.n), [1]);
  assert.equal(m.audit.length, 7, "every decision, not only open ones");
  assert.ok(m.risks.some((r) => r.signal === "failed stage" && r.stages.includes(6)));
  assert.ok(m.risks.some((r) => r.detail.includes("Q1")), "parked stage names its holding decision");
  const html = formatPage(run, "executive", {});
  assert.ok(html.includes('class="kpi-band"') && html.includes('class="audit-table"') && html.includes("Decision audit log"));
  assert.ok(!/<script/.test(html), "executive is static: no script");
  const empty = executiveModel(parseRun("# RUN-7 - empty\n"));
  assert.equal(empty.kpis.pct, null, "no NaN percent on zero stages");
});

test("runbook: dependency order, recorded vs not-recorded verify, no invented commands", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = runbookModel(run, layout(run));
  assert.deepEqual(m.steps.map((s) => s.n), [1, 3, 5, 6, 7, 2, 4, 8], "layout columns, then stage number");
  const s1 = m.steps.find((s) => s.n === 1);
  assert.equal(s1.verify.kind, "recorded");
  assert.ok(s1.verify.text.includes("4d72860"), "landed value is the recorded evidence");
  const s4 = m.steps.find((s) => s.n === 4);
  assert.equal(s4.verify.kind, "none");
  const html = formatPage(run, "runbook", { layout: layout(run) });
  assert.ok(html.includes("Verify command: not recorded in the run file."));
  assert.ok(html.includes('type="checkbox"') && html.includes('id="rb-progress"'));
  assert.ok(html.includes("item F2: export."), "captured prompt is the step instructions");
  assert.ok(!/npm test|pytest|node --test/.test(html), "no guessed verify command anywhere");
});

test("mindmap: suffix parent only when in the run, dependencies kept out of the tree", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = mindmapModel(run);
  assert.ok(m.tickets.every((t) => t.parent === null), "no suffix children in this fixture: all roots");
  assert.deepEqual(m.tickets.find((t) => t.id === "F6").dependsOn, ["F2"], "stage 4 is after stage 2");
  assert.ok(m.tickets.find((t) => t.id === "F2").modules.includes("src"));
  const child = parseRun("# RUN-8 - sub\n\n## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|---|---|---|---|---|\n| 1 | F90 parent work | x | - | - | abc1234 |\n| 2 | F90a child work |   | - | - | - |\n| 3 | F91a orphan sub |   | - | - | - |\n");
  const mm = mindmapModel(child);
  assert.equal(mm.tickets.find((t) => t.id === "F90a").parent, "F90");
  assert.equal(mm.tickets.find((t) => t.id === "F91a").parent, null, "parent F91 not in run: root, never guessed");
  const html = formatPage(child, "mindmap", {});
  assert.ok(html.includes('data-ticket="F91a" data-parent="none"') && html.includes("parent F91 not in this run"));
  assert.ok(html.includes('class="mm-tree"'));
});

test("all formats x all themes: standalone, offline, themed, escaped", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  for (const f of FORMATS) for (const t of THEMES) {
    const html = formatPage(run, f, { theme: t, layout: layout(run) });
    assert.ok(html.startsWith("<!doctype html>"), `${f}/${t} doctype`);
    assert.ok(html.includes(`data-format="${f}"`) && html.includes(`data-theme="${t}"`), `${f}/${t} markers`);
    assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*https?:/i.test(html), `${f}/${t} offline`);
    assert.ok(!/https?:\/\//.test(html.replaceAll('xmlns="http://www.w3.org/2000/svg"', "")), `${f}/${t} no external URL`);
  }
  const noTheme = formatPage(run, "timeline", { layout: layout(run) });
  assert.ok(!noTheme.includes("data-theme="), "no theme flag, no theme attribute");
});

test("timeline: no stages and thin times still render", () => {
  const empty = parseRun("# RUN-7 - empty\n");
  const m = timelineModel(empty, layout(empty));
  assert.equal(m.window, null);
  assert.ok(formatPage(empty, "timeline", { layout: layout(empty) }).includes("No stage rows in this run file."));
});
