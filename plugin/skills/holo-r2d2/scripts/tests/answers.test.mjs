// F179: answers back without hand-sharing - the page's copy/save code (answerSaver,
// the same function the page embeds) and the finder (answers.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { answerSaver, wizardPage, pageSet, setFromRun, nextWizardSet, SET_SCHEMA, ANSWER_SCHEMA } from "../wizard.mjs";
import { parseRun } from "../holo.mjs";
import { findAnswers, downloadDirs, report } from "../answers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- page ----
function fakeWin({ picker = true, perm = "granted", abort = false, db = new Map(), dirName = "holo" } = {}) {
  const files = {}, calls = { picker: 0, clip: [], opts: [] }, state = { perm };
  const dir = {
    name: dirName, kind: "directory",
    queryPermission: async () => state.perm, requestPermission: async () => state.perm,
    getFileHandle: async (n) => ({ createWritable: async () => { let buf = ""; return { write: async (s) => { buf += s; }, close: async () => { files[n] = buf; } }; } }),
  };
  const req = (fn) => { const r = {}; queueMicrotask(() => { try { r.result = fn(); r.onsuccess && r.onsuccess({ target: r }); } catch (e) { r.error = e; r.onerror && r.onerror({ target: r }); } }); return r; };
  const idb = {
    objectStoreNames: { contains: () => false }, createObjectStore() {},
    transaction: () => ({ objectStore: () => ({ get: (k) => req(() => db.get(k)), put: (v, k) => req(() => db.set(k, v)) }) }),
  };
  const win = {
    indexedDB: { open: () => { const r = {}; queueMicrotask(() => { r.result = idb; r.onupgradeneeded && r.onupgradeneeded({ target: r }); r.onsuccess && r.onsuccess({ target: r }); }); return r; } },
    navigator: { clipboard: { writeText: async (t) => { calls.clip.push(t); } } },
  };
  if (picker) win.showDirectoryPicker = async (o) => { calls.picker++; calls.opts.push(o); if (abort) { const e = new Error("cancel"); e.name = "AbortError"; throw e; } return dir; };
  return { win, files, calls, db, state };
}
function saverFor(f, key = "repo-a/RUN-7.wizard.html") {
  const out = { said: [], downloads: [] };
  out.saver = answerSaver({
    win: f.win, setId: "RUN-7", key, pickerId: "holo-" + key.split("/")[0],
    json: (final) => JSON.stringify({ set: "RUN-7", final }),
    download: (final) => out.downloads.push(final),
    say: (m) => out.said.push(m),
  });
  return out;
}

test("page: Copy JSON puts the same export on the clipboard", async () => {
  const f = fakeWin(), s = saverFor(f);
  await s.saver.copy(true);
  assert.deepEqual(f.calls.clip, [JSON.stringify({ set: "RUN-7", final: true })]);
  assert.match(s.said.at(-1), /copied/i);
});

test("page: Save to page folder writes the named file and says where", async () => {
  const f = fakeWin(), s = saverFor(f);
  await s.saver.save(true);
  assert.equal(f.files["RUN-7-decisions-FINAL.json"], JSON.stringify({ set: "RUN-7", final: true }));
  assert.equal(s.downloads.length, 0);
  assert.match(s.said.at(-1), /holo.*RUN-7-decisions-FINAL\.json/);
  await s.saver.save(false);
  assert.ok(f.files["RUN-7-decisions-draft.json"], "a draft is saved under its draft name");
});

test("page: the folder is remembered per set - Finalize later saves there without a picker", async () => {
  const f = fakeWin();
  await saverFor(f).saver.save(false);
  const s2 = saverFor(f); // a fresh page load, same IndexedDB
  await s2.saver.deliver(true);
  assert.equal(f.calls.picker, 1, "no second picker");
  assert.ok(f.files["RUN-7-decisions-FINAL.json"]);
  assert.equal(s2.downloads.length, 0);
  const other = answerSaver({ win: f.win, setId: "RUN-8", key: "repo-a/RUN-8.wizard.html", pickerId: "holo-8", json: () => "{}", download: () => s2.downloads.push("RUN-8"), say: () => {} });
  await other.deliver(true);
  assert.deepEqual(s2.downloads, ["RUN-8"], "another set does not reuse RUN-7's folder");
});

test("page: no folder chosen -> Finalize downloads as before", async () => {
  const f = fakeWin(), s = saverFor(f);
  await s.saver.deliver(true);
  assert.deepEqual(s.downloads, [true]);
  assert.equal(f.calls.picker, 0);
  assert.match(s.said.at(-1), /download folder/i);
});

test("page: no File System Access API -> Save falls back to the download", async () => {
  const f = fakeWin({ picker: false }), s = saverFor(f);
  assert.equal(s.saver.canSave, false);
  await s.saver.save(true);
  assert.deepEqual(s.downloads, [true]);
});

test("page: a cancelled picker writes nothing and downloads nothing", async () => {
  const f = fakeWin({ abort: true }), s = saverFor(f);
  await s.saver.save(true);
  assert.deepEqual(f.files, {});
  assert.deepEqual(s.downloads, []);
  assert.match(s.said.at(-1), /cancel/i);
});

test("page: permission refused on the remembered folder -> download, and says why", async () => {
  const f = fakeWin();
  await saverFor(f).saver.save(true);
  f.state.perm = "denied"; // a later page load where the owner refuses the prompt
  const s = saverFor(f);
  await s.saver.deliver(true);
  assert.deepEqual(s.downloads, [true]);
  assert.match(s.said.at(-1), /permission/i);
});

test("page: the wizard embeds the saver and labels the new buttons", () => {
  const set = { schema: SET_SCHEMA, id: "X", decisions: [{ id: "Q1", question: "q", options: [{ id: "a", label: "A" }] }] };
  const wp = wizardPage(set);
  assert.ok(wp.includes("function answerSaver"), "the page runs the tested function");
  assert.ok(wp.includes('aria-label": "Copy the answers JSON to the clipboard') || wp.includes("Copy the answers JSON to the clipboard"));
  assert.ok(wp.includes("Save to a folder (choose this page's folder)"), "an honest label");
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(wp), "nothing is sent anywhere");
});

// -------------------------------------------------------------- finder ----
const SET = { schema: SET_SCHEMA, id: "review-x", title: "Review X", decisions: [
  { id: "Q1", ticket: "F12", question: "Pick a store?", options: [{ id: "o1", label: "SQLite" }, { id: "o2", label: "Postgres" }] },
] };
function answers(over = {}) {
  return { schema: ANSWER_SCHEMA, set: "review-x", setSchema: SET_SCHEMA, round: 1, owner: "Owner", reviewed: true, final: true,
    finalizedAt: "2026-11-17T10:00:00Z", answers: [{ id: "Q1", question: "Pick a store?", status: "answered", choice: { id: "o1", label: "SQLite" } }], ...over };
}
const DRAFT = { final: false, finalizedAt: null, reviewed: false };
let seq = 0;
function sandbox() {
  const base = mkdtempSync(join(tmpdir(), "holo-f179-"));
  const root = join(base, "repo"), home = join(base, "home");
  const holo = join(root, ".skillator", "holo"), dl = join(home, "Downloads");
  for (const d of [holo, dl]) mkdirSync(d, { recursive: true });
  writeFileSync(join(holo, "review-x.wizard.html"), wizardPage(SET));
  const env = { LOCALAPPDATA: join(home, "AppData", "Local"), APPDATA: join(home, "AppData", "Roaming") };
  const opts = { root, home, env, platform: "win32", regQuery: () => null };
  return { base, root, home, holo, dl, env, opts };
}
function put(dir, name, obj, ageSec = 0) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, JSON.stringify(obj));
  const t = new Date(Date.parse("2026-11-17T12:00:00Z") - ageSec * 1000 + seq++);
  utimesSync(p, t, t);
  return p;
}

test("finder: on a tie (same round, finalizedAt and file time) the page folder beats Downloads", async () => {
  const s = sandbox();
  const dl = put(s.dl, "review-x-decisions-FINAL.json", answers(), 0);
  const inPage = put(s.holo, "review-x-decisions-FINAL.json", answers(), 0);
  const t = new Date("2026-11-17T12:00:00Z");
  utimesSync(dl, t, t); utimesSync(inPage, t, t);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, inPage);
});

test("finder: FINAL beats a newer draft", async () => {
  const s = sandbox();
  const fin = put(s.holo, "review-x-decisions-FINAL.json", answers(), 600);
  put(s.holo, "review-x-decisions-draft.json", answers(DRAFT), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, fin);
});

test("finder: newest FINAL wins inside one folder (browser ' (1)' copies count)", async () => {
  const s = sandbox();
  put(s.dl, "review-x-decisions-FINAL.json", answers(), 600);
  const newer = put(s.dl, "review-x-decisions-FINAL (1).json", answers(), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, newer);
});

test("finder: a file for a set that is not open is ignored", async () => {
  const s = sandbox();
  put(s.holo, "other-decisions-FINAL.json", answers({ set: "other" }), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked, null);
  assert.ok(r.ignored.some((x) => x.path.endsWith("other-decisions-FINAL.json")));
});

test("finder: a file whose set id differs from the open set is refused, the next valid one picked", async () => {
  const s = sandbox();
  put(s.holo, "review-x-decisions-FINAL.json", answers({ set: "RUN-999" }), 0);
  const stale = put(s.holo, "review-x-decisions-FINAL (1).json", answers({ answers: [{ id: "Q1", question: "Different text?", choice: { id: "o1" } }] }), 10);
  const good = put(s.dl, "review-x-decisions-FINAL.json", answers(), 900);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, good);
  assert.equal(r.refused.length, 2);
  assert.ok(r.refused.some((x) => x.path === stale && /question/.test(x.why)));
});

test("finder: a draft alone is reported, never picked", async () => {
  const s = sandbox();
  const d = put(s.holo, "review-x-decisions-draft.json", answers(DRAFT), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked, null);
  assert.equal(r.draft.path, d);
  assert.match(report(r), /draft - not applied/);
});

test("finder: Chrome's real download folder is read and searched", async () => {
  const s = sandbox();
  const custom = join(s.base, "D", "My Downloads");
  const prefs = join(s.env.LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Preferences");
  mkdirSync(dirname(prefs), { recursive: true });
  writeFileSync(prefs, JSON.stringify({ download: { default_directory: custom, prompt_for_download: false }, profile: { name: "secret" } }));
  const p = put(custom, "review-x-decisions-FINAL.json", answers(), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, p);
  assert.match(report(r), /Chrome/);
  assert.ok(!report(r).includes("secret"), "nothing else from the profile is printed");
});

test("finder: Edge and Firefox download folders and the owner-set folder are found, in order", () => {
  const s = sandbox();
  const edge = join(s.env.LOCALAPPDATA, "Microsoft", "Edge", "User Data", "Profile 1", "Preferences");
  mkdirSync(dirname(edge), { recursive: true });
  writeFileSync(edge, JSON.stringify({ download: { default_directory: "E:\\edge dl" } }));
  const ff = join(s.env.APPDATA, "Mozilla", "Firefox", "Profiles", "ab12.default-release", "prefs.js");
  mkdirSync(dirname(ff), { recursive: true });
  writeFileSync(ff, 'user_pref("browser.startup.page", 3);\nuser_pref("browser.download.dir", "F:\\\\ff \\"dl\\"");\n');
  mkdirSync(join(s.home, ".skillator", "holo"), { recursive: true });
  writeFileSync(join(s.home, ".skillator", "holo", "answers-dir"), "G:\\owner set\n");
  const dirs = downloadDirs(s.opts).map((d) => d.dir);
  assert.deepEqual(dirs, ["E:\\edge dl", 'F:\\ff "dl"', join(s.home, "Downloads"), "G:\\owner set"]);
});

test("finder: the Windows Downloads known folder replaces ~/Downloads when the registry names one", () => {
  const s = sandbox();
  const dirs = downloadDirs({ ...s.opts, env: { ...s.env, USERPROFILE: "C:\\Users\\me" }, regQuery: () => "%USERPROFILE%\\Dl" });
  assert.deepEqual(dirs.map((d) => d.dir), ["C:\\Users\\me\\Dl"]);
});

test("finder: report names every searched folder and prints relay answer lines for a run", async () => {
  const s = sandbox();
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replaceAll("@LANDED@", "abc1234");
  writeFileSync(join(s.root, ".skillator", "run-1-shelf-export.md"), md);
  const set = setFromRun(parseRun(md), ".skillator/run-1-shelf-export.md");
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), wizardPage(set));
  const [q1, q2] = set.decisions;
  put(s.dl, "RUN-1-decisions-FINAL.json", { ...answers(), set: "RUN-1", nonce: nonceOf(s, "RUN-1"), answers: [
    { id: "Q1", question: q1.question, choice: { id: "o2", label: q1.options[1].label } },
    { id: "Q2", question: q2.question, choice: { id: "defer" }, clarification: "why?" },
  ] }, 0);
  const r = await findAnswers(s.opts);
  const text = report(r);
  assert.ok(text.includes(s.holo) && text.includes(join(s.home, "Downloads")), text);
  assert.match(text, /answer Q1 'CSV'/);
  assert.match(text, /still open: Q2: deferred/);
  assert.match(text, /--next-wizard/);
});

test("finder: a run with no open decision is not an open set", async () => {
  const s = sandbox();
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replaceAll("### Q1 open", "### Q1 answered").replaceAll("### Q2 open", "### Q2 answered");
  writeFileSync(join(s.root, ".skillator", "run-1-shelf-export.md"), md);
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), "<!doctype html>");
  put(s.holo, "RUN-1-decisions-FINAL.json", { ...answers(), set: "RUN-1" }, 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked, null);
  assert.ok(r.ignored.some((x) => x.path.endsWith("RUN-1-decisions-FINAL.json")));
});

// ------------------------------------------------- review round 1 (F179) ----
test("r1-7: one isFinalized, shared by nextWizardSet, answersToCommands and the finder", async () => {
  const w = await import("../wizard.mjs");
  assert.equal(typeof w.isFinalized, "function");
  assert.equal(w.isFinalized(answers()), true);
  assert.equal(w.isFinalized(answers({ final: false })), false);
  assert.equal(w.isFinalized(answers(DRAFT)), false);
  assert.throws(() => w.answersToCommands({ ...answers({ final: false }), set: "RUN-1" }), /draft/);
});

test("r1-10: --root with no value says so and exits 2", () => {
  const r = spawnSync(process.execPath, [join(HERE, "..", "answers.mjs"), "--root"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /answers: --root needs a path/);
  assert.ok(!/at .*answers\.mjs/.test(r.stderr), "no stack trace");
});

test("r1-5: page and finder sanitise the file name the same way", async () => {
  const f = fakeWin();
  const s = answerSaver({ win: f.win, setId: "a/b c", key: "k", pickerId: "p", json: () => "{}", download: () => {}, say: () => {} });
  await s.save(true);
  assert.deepEqual(Object.keys(f.files), ["a_b_c-decisions-FINAL.json"]);
  assert.equal(s.name(true), "a_b_c-decisions-FINAL.json");
  const sb = sandbox();
  const set = { ...SET, id: "a/b c" };
  writeFileSync(join(sb.holo, "odd.wizard.html"), wizardPage(set));
  const p = put(sb.holo, "a_b_c-decisions-FINAL.json", answers({ set: "a/b c" }), 0);
  const r = await findAnswers(sb.opts);
  assert.equal(r.picked && r.picked.path, p);
});

test("r1-8: Linux reads XDG_DOWNLOAD_DIR from user-dirs.dirs", () => {
  const s = sandbox();
  mkdirSync(join(s.home, ".config"), { recursive: true });
  writeFileSync(join(s.home, ".config", "user-dirs.dirs"), '# x\nXDG_DESKTOP_DIR="$HOME/Desk"\nXDG_DOWNLOAD_DIR="$HOME/Dl"\n');
  const dirs = downloadDirs({ home: s.home, env: {}, platform: "linux" }).map((d) => d.dir);
  assert.deepEqual(dirs, [join(s.home, "Dl")]);
});

test("r1-9: folders dedupe on resolved path; case only on win32/darwin; page folder included", async () => {
  const s = sandbox();
  const prefs = join(s.env.LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Preferences");
  mkdirSync(dirname(prefs), { recursive: true });
  writeFileSync(prefs, JSON.stringify({ download: { default_directory: s.dl.toUpperCase() + "\\" } }));
  assert.equal(downloadDirs(s.opts).length, 1, "same folder, other case and a trailing slash");
  mkdirSync(join(s.home, ".config"), { recursive: true });
  writeFileSync(join(s.home, ".config", "user-dirs.dirs"), 'XDG_DOWNLOAD_DIR="$HOME/DL"\n');
  mkdirSync(join(s.home, ".skillator", "holo"), { recursive: true });
  writeFileSync(join(s.home, ".skillator", "holo", "answers-dir"), join(s.home, "dl") + "\n");
  assert.equal(downloadDirs({ home: s.home, env: {}, platform: "linux" }).length, 2, "linux: DL and dl are two folders");
  writeFileSync(join(s.home, ".skillator", "holo", "answers-dir"), join(s.home, "DOWNLOADS") + "\n");
  assert.equal(downloadDirs({ home: s.home, env: {}, platform: "darwin" }).length, 1, "darwin: Downloads and DOWNLOADS are one folder");
  writeFileSync(join(s.home, ".skillator", "holo", "answers-dir"), s.holo + "\n");
  const r = await findAnswers(s.opts);
  assert.equal(r.searched.filter((f) => f.dir.toLowerCase().replace(/[\\/]+$/, "") === s.holo.toLowerCase()).length, 1);
  assert.equal(r.searched[0].why, "page folder");
});

function runRound2(s) {
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replaceAll("@LANDED@", "abc1234");
  writeFileSync(join(s.root, ".skillator", "run-1-shelf-export.md"), md);
  const set1 = setFromRun(parseRun(md), ".skillator/run-1-shelf-export.md");
  const [q1, q2] = set1.decisions;
  const set2 = nextWizardSet(set1, { ...answers(), set: "RUN-1", answers: [
    { id: "Q1", question: q1.question, choice: { id: "o2", label: q1.options[1].label } },
    { id: "Q2", question: q2.question, choice: { id: "defer" }, clarification: "why?" },
  ] });
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), wizardPage(set2));
  const d = set2.decisions[0];
  const ans2 = { ...answers(), set: "RUN-1", round: 2, finalizedAt: "2026-11-17T11:00:00Z",
    answers: [{ id: d.id, question: d.question, choice: { id: "defer" }, clarification: "still unclear" }] };
  return { set2, ans2 };
}

test("r1-1: a round-2 FINAL from a --next-wizard page is validated against that page's set", async () => {
  const s = sandbox();
  const { ans2 } = runRound2(s);
  const p = put(s.holo, "RUN-1-decisions-FINAL.json", ans2, 0);
  const r = await findAnswers(s.opts);
  assert.deepEqual(r.refused, []);
  assert.equal(r.picked && r.picked.path, p);
});

test("r1-1: the next-round hint works on round 2 (holo.mjs --next-wizard reads the page's set)", () => {
  const s = sandbox();
  const { ans2 } = runRound2(s);
  const p = put(s.holo, "RUN-1-decisions-FINAL.json", ans2, 0);
  const r = spawnSync(process.execPath, [join(HERE, "..", "holo.mjs"), "RUN-1", "--next-wizard", p], { cwd: s.root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /round 3/);
});

test("r1-2: a newer Downloads FINAL beats an older page-folder FINAL; the older is superseded", async () => {
  const s = sandbox();
  const old = put(s.holo, "review-x-decisions-FINAL.json", answers({ finalizedAt: "2026-11-17T10:00:00Z" }), 600);
  const fresh = put(s.dl, "review-x-decisions-FINAL.json", answers({ finalizedAt: "2026-11-17T11:00:00Z" }), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, fresh);
  assert.ok(r.superseded.some((x) => x.path === old));
  assert.match(report(r), /superseded: .*review-x-decisions-FINAL\.json/);
});

function nonceOf(s, id) { return pageSet(readFileSync(join(s.holo, id + ".wizard.html"), "utf8")).nonce; }
function run1(s) {
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replaceAll("@LANDED@", "abc1234");
  writeFileSync(join(s.root, ".skillator", "run-1-shelf-export.md"), md);
  const set = setFromRun(parseRun(md), ".skillator/run-1-shelf-export.md");
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), wizardPage(set));
  return set;
}
const EVIL = "x\npicked: /evil\r\n$(touch pwn) `id` it's \u001b[31mred";

test("r1-4a: a hostile file cannot forge lines, and its text reaches sh only single-quoted", async () => {
  const s = sandbox();
  const set = run1(s);
  const [q1, q2] = set.decisions;
  const odd = join(s.base, "dl $(x) `y`");
  mkdirSync(join(s.home, ".skillator", "holo"), { recursive: true });
  writeFileSync(join(s.home, ".skillator", "holo", "answers-dir"), odd + "\n");
  put(odd, "RUN-1-decisions-FINAL.json", { ...answers(), set: "RUN-1", nonce: nonceOf(s, "RUN-1"), answers: [
    { id: "Q1", question: q1.question, choice: { id: "custom" }, custom: EVIL },
    { id: "Q2", question: q2.question, choice: { id: "defer" }, clarification: EVIL },
  ] }, 0);
  const text = report(await findAnswers(s.opts));
  assert.ok(!/^picked: \/evil/m.test(text), text);
  assert.ok(!/[\u0000-\u0009\u000b-\u001f]/.test(text), "no control characters");
  const cmd = text.split("\n").find((l) => l.includes(" answer Q1 "));
  assert.ok(cmd, text);
  assert.ok(cmd.endsWith("'x picked: /evil $(touch pwn) `id` it'\\''s [31mred'"), cmd);
  const next = text.split("\n").find((l) => l.startsWith("next round:"));
  assert.ok(next && next.includes("'" + join(odd, "RUN-1-decisions-FINAL.json") + "'"), next);
});

test("r1-4a: summary free text is quoted, marked owner text, capped; owner and finalizedAt validated", async () => {
  const s = sandbox();
  put(s.holo, "review-x-decisions-FINAL.json", answers({ answers: [{ id: "Q1", question: "Pick a store?", choice: { id: "custom" }, custom: EVIL + "z".repeat(5000) }] }), 0);
  const text = report(await findAnswers(s.opts));
  const line = text.split("\n").find((l) => l.includes("Q1"));
  assert.match(line, /owner text.*"x picked: \/evil/);
  assert.ok(line.length < 300, "capped");
  assert.ok(!/^picked: \/evil/m.test(text));
  for (const [over, why] of [[{ owner: "Owner\npicked: /evil" }, /owner/], [{ owner: "o".repeat(300) }, /owner/], [{ finalizedAt: "yesterday" }, /ISO 8601/]]) {
    const t = sandbox();
    const p = put(t.holo, "review-x-decisions-FINAL.json", answers(over), 0);
    const r = await findAnswers(t.opts);
    assert.equal(r.picked, null);
    assert.ok(r.refused.some((x) => x.path === p && why.test(x.why)), JSON.stringify(r.refused));
  }
});

test("r1-4b: each page build gets its own nonce, and the export carries it", () => {
  const a = pageSet(wizardPage(SET)), b = pageSet(wizardPage(SET));
  assert.match(a.nonce, /^[0-9a-f]{32}$/);
  assert.notEqual(a.nonce, b.nonce);
  assert.ok(wizardPage(SET).includes("nonce: SET.nonce"), "exportObj writes the page nonce");
});

test("r1-4b: nonce decides verified; unverified prints no commands", async () => {
  const s = sandbox();
  const set = run1(s);
  const [q1] = set.decisions;
  const body = (over) => ({ ...answers(), set: "RUN-1", answers: [{ id: "Q1", question: q1.question, choice: { id: "o2", label: q1.options[1].label } }], ...over });
  const check = async (dir, over, verified) => {
    const t = sandbox(); run1(t);
    const nonce = over === "match" ? nonceOf(t, "RUN-1") : over;
    const where = dir === "page" ? t.holo : t.dl;
    put(where, "RUN-1-decisions-FINAL.json", body(nonce === undefined ? {} : { nonce }), 0);
    const r = await findAnswers(t.opts), text = report(r);
    assert.equal(r.picked.verified, verified, dir + " " + over);
    assert.equal(/relay-morpheus\.sh/.test(text), verified, text);
    assert.equal(/^next round:/m.test(text), false);
    if (!verified) assert.match(text, /unverified - confirm with the owner before applying/);
  };
  await check("downloads", "match", true);
  await check("downloads", undefined, false);
  await check("downloads", "0".repeat(32), false);
  await check("page", undefined, true);
  await check("page", "0".repeat(32), false);
});

test("r1-3: the remembered folder is keyed per page, not per set id; each page has its own picker id", async () => {
  const f = fakeWin();
  await saverFor(f, "repo-a/RUN-7.wizard.html").saver.save(true);
  const b = saverFor(f, "repo-b/RUN-7.wizard.html"); // another repo, same set id
  await b.saver.deliver(true);
  assert.deepEqual(b.downloads, [true], "repo-b does not write into repo-a's folder");
  await b.saver.save(true);
  assert.notEqual(f.calls.opts[0].id, f.calls.opts[1].id);
});

test("r1-6: the picker starts in the remembered folder; the status names the folder chosen and warns off-holo", async () => {
  const f = fakeWin({ dirName: "Desktop" }), s = saverFor(f);
  await s.saver.save(true);
  assert.equal(f.calls.opts[0].startIn, undefined, "no handle yet: no forced Downloads");
  assert.match(s.said.at(-1), /Desktop/);
  assert.match(s.said.at(-1), /\.skillator\/holo/);
  await s.saver.save(true);
  assert.equal(f.calls.opts[1].startIn && f.calls.opts[1].startIn.name, "Desktop");
  const h = fakeWin(), sh = saverFor(h);
  await sh.saver.save(true);
  assert.ok(!/searches/.test(sh.said.at(-1)), "no warning for a folder named holo");
});
