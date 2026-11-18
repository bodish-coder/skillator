// F179: answers back without hand-sharing - the page's copy/save code (answerSaver,
// the same function the page embeds) and the finder (answers.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync, rmSync, renameSync, symlinkSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { answerSaver, wizardPage, pageSet, setFromRun, nextWizardSet, reconcile, sameSet, runKey, answersToCommands, SET_SCHEMA, ANSWER_SCHEMA } from "../wizard.mjs";
import { parseRun, nonceFile } from "../holo.mjs";
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
  assert.match(s.said.at(-1), /^Saved into 'holo'\./);
  assert.ok(s.said.at(-1).endsWith('Then say "check wizard answers" in the working conversation.'), "r3-5: same next step as the download");
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

test("r4-1: a fully settled run is still loaded - its FINAL's answers are skipped, not 'not an open wizard set'", async () => {
  const s = sandbox();
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replaceAll("### Q1 open", "### Q1 answered").replaceAll("### Q2 open", "### Q2 answered");
  writeFileSync(join(s.root, ".skillator", "run-1-shelf-export.md"), md);
  const before = new Date("2026-11-17T11:00:00Z"); // the FINAL is newer than the run file (A233-4)
  utimesSync(join(s.root, ".skillator", "run-1-shelf-export.md"), before, before);
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), "<!doctype html>");
  put(s.holo, "RUN-1-decisions-FINAL.json", { ...answers(), set: "RUN-1" }, 0);
  const text = report(await findAnswers(s.opts));
  assert.match(text, /Q1: already settled - skipped/);
  assert.match(text, /0 to apply, 1 already settled/);
  assert.ok(!/not an open wizard set| answer Q/.test(text), text);
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

test("r1-9/r2-10: findAnswers dedupes once, on resolved path; case only on win32/darwin; page folder included", async () => {
  const s = sandbox();
  const prefs = join(s.env.LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Preferences");
  mkdirSync(dirname(prefs), { recursive: true });
  writeFileSync(prefs, JSON.stringify({ download: { default_directory: s.dl.toUpperCase() + "\\" } }));
  assert.equal(downloadDirs(s.opts).length, 1, "r3-7: downloadDirs dedupes its own result");
  assert.equal((await findAnswers(s.opts)).searched.length, 2, "findAnswers dedupes: page folder + one Downloads (other case, trailing slash)");
  mkdirSync(join(s.home, ".config"), { recursive: true });
  writeFileSync(join(s.home, ".config", "user-dirs.dirs"), 'XDG_DOWNLOAD_DIR="$HOME/DL"\n');
  mkdirSync(join(s.home, ".skillator", "holo"), { recursive: true });
  writeFileSync(join(s.home, ".skillator", "holo", "answers-dir"), join(s.home, "dl") + "\n");
  assert.equal((await findAnswers({ ...s.opts, env: {}, platform: "linux" })).searched.length, 3, "linux: page folder, DL and dl");
  writeFileSync(join(s.home, ".skillator", "holo", "answers-dir"), join(s.home, "DOWNLOADS") + "\n");
  assert.equal((await findAnswers({ ...s.opts, env: {}, platform: "darwin" })).searched.length, 2, "darwin: page folder, and Downloads and DOWNLOADS as one");
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
  const fresh = put(s.dl, "review-x-decisions-FINAL.json", answers({ finalizedAt: "2026-11-17T11:00:00Z", nonce: nonceOf(s, "review-x") }), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, fresh);
  assert.ok(r.superseded.some((x) => x.path === old));
  assert.match(report(r), /superseded: .*review-x-decisions-FINAL\.json/);
});

const sidecar = (s, id) => nonceFile(s.root, id);
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

test("r1-4b: wizardPage with no nonce given makes a fresh one, and the export carries it", () => {
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

test("r1-6/r2-5: the picker starts in the remembered folder; the status states the facts, judging no folder name", async () => {
  const f = fakeWin({ dirName: "Desktop" }), s = saverFor(f);
  await s.saver.save(true);
  assert.equal(f.calls.opts[0].startIn, undefined, "no handle yet: no forced Downloads");
  const facts = (d) => "Saved into '" + d + "'. 'check wizard answers' searches this page's .skillator/holo folder, your browser's download folder, and the folder in ~/.skillator/holo/answers-dir. Then say \"check wizard answers\" in the working conversation.";
  assert.equal(s.said.at(-1), facts("Desktop"));
  await s.saver.save(true);
  assert.equal(f.calls.opts[1].startIn && f.calls.opts[1].startIn.name, "Desktop");
  const h = fakeWin(), sh = saverFor(h);
  await sh.saver.save(true);
  assert.equal(sh.said.at(-1), facts("holo"), "the same message, whatever the folder is called");
});

test("r1-11: a newer unverified FINAL never displaces a verified one; it is reported apart", async () => {
  const s = sandbox();
  const ok = put(s.holo, "review-x-decisions-FINAL.json", answers({ finalizedAt: "2026-11-17T10:00:00Z" }), 600);
  const newer = put(s.dl, "review-x-decisions-FINAL.json", answers({ finalizedAt: "2026-11-17T11:00:00Z" }), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked.path, ok);
  assert.equal(r.picked.verified, true);
  assert.ok(!r.superseded.some((x) => x.path === ok));
  const text = report(r);
  assert.ok(text.includes("newer unverified file found: " + newer + " - confirm with the owner"), text);
});

// ------------------------------------------------- review round 2 (F179) ----
const HOLO = join(HERE, "..", "holo.mjs");
const cli = (s, ...args) => spawnSync(process.execPath, [HOLO, ...args], { cwd: s.root, encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
function run1Answers(s, set) {
  const [q1, q2] = set.decisions;
  return { ...answers(), set: "RUN-1", nonce: nonceOf(s, "RUN-1"), answers: [
    { id: "Q1", question: q1.question, choice: { id: "o2", label: q1.options[1].label } },
    { id: "Q2", question: q2.question, choice: { id: "o1", label: q2.options[0].label } },
  ] };
}

test("r2-1: a FINAL checked again after its Q1 command was applied prints no Q1 command", async () => {
  const s = sandbox();
  const set = run1(s);
  put(s.dl, "RUN-1-decisions-FINAL.json", run1Answers(s, set), 0);
  assert.match(report(await findAnswers(s.opts)), / answer Q1 /);
  const runPath = join(s.root, ".skillator", "run-1-shelf-export.md");
  writeFileSync(runPath, readFileSync(runPath, "utf8").replace("### Q1 open", "### Q1 answered"));
  const text = report(await findAnswers(s.opts));
  assert.ok(!/ answer Q1 /.test(text), text);
  assert.match(text, /Q1: already settled - skipped/);
  assert.match(text, / answer Q2 /);
  assert.match(text, /, 1 to apply, 1 already settled/);
});

test("r2-2: rebuilding the same set reuses its nonce - --wizard, --batch and --html --anatomy alike", () => {
  const s = sandbox();
  run1(s);
  rmSync(join(s.holo, "RUN-1.wizard.html"));
  const nonces = [];
  for (const args of [["--wizard"], ["--wizard"], ["--batch"], ["--html", "--anatomy"]]) {
    const r = cli(s, "RUN-1", ...args);
    assert.equal(r.status, 0, r.stderr);
    nonces.push(nonceOf(s, "RUN-1"));
  }
  assert.match(nonces[0], /^[0-9a-f]{32}$/);
  assert.deepEqual(new Set(nonces).size, 1, nonces.join(" "));
  assert.equal(readFileSync(sidecar(s, "RUN-1"), "utf8").trim(), nonces[0], "sidecar written");
  rmSync(join(s.holo, "RUN-1.wizard.html"));
  assert.equal(cli(s, "RUN-1", "--wizard").status, 0);
  assert.equal(nonceOf(s, "RUN-1"), nonces[0], "no page: the sidecar keeps the nonce");
});

test("r2-3: an unreadable page falls back to the sidecar nonce", async () => {
  for (const [nonce, verified] of [["a".repeat(32), true], ["b".repeat(32), false]]) {
    const s = sandbox();
    const set = run1(s);
    const ans = { ...run1Answers(s, set), nonce };
    writeFileSync(join(s.holo, "RUN-1.wizard.html"), "<!doctype html>");
    writeFileSync(sidecar(s, "RUN-1"), "a".repeat(32) + "\n");
    put(s.holo, "RUN-1-decisions-FINAL.json", ans, 0);
    const r = await findAnswers(s.opts);
    assert.equal(r.picked && r.picked.verified, verified, JSON.stringify(r.refused));
  }
});

test("r2-4: a 120-character owner is accepted", async () => {
  const s = sandbox();
  put(s.holo, "review-x-decisions-FINAL.json", answers({ owner: "o".repeat(120) }), 0);
  const r = await findAnswers(s.opts);
  assert.deepEqual(r.refused, []);
  assert.ok(r.picked);
  assert.ok(wizardPage(SET).includes('maxlength: 200, autocomplete: "name"'), "page owner input cap");
});

test("r2-6: --next-wizard never mixes rounds", () => {
  // round 1 FINAL while the page on disk is round 2: the base is the run's round-1 set
  const s = sandbox();
  const { set2 } = runRound2(s);
  const set1 = setFromRun(parseRun(readFileSync(join(s.root, ".skillator", "run-1-shelf-export.md"), "utf8")), ".skillator/run-1-shelf-export.md");
  const p1 = put(s.base, "r1.json", { ...answers(), set: "RUN-1", answers: [{ id: "Q1", question: set1.decisions[0].question, choice: { id: "defer" }, clarification: "?" }] }, 0);
  let r = cli(s, "RUN-1", "--next-wizard", p1);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /round 2/);
  // round 3 FINAL while the page on disk is round 2: refused
  const p3 = put(s.base, "r3.json", { ...answers(), set: "RUN-1", round: 3, answers: [{ id: set2.decisions[0].id, question: set2.decisions[0].question, choice: { id: "defer" }, clarification: "?" }] }, 0);
  r = cli(s, "RUN-1", "--next-wizard", p3);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /the page for round 3 is not on disk - open the round-3 page and finalize again/);
});

test("r2-7: an unverified pick prints only its summary line and path", async () => {
  const s = sandbox();
  const p = put(s.dl, "review-x-decisions-FINAL.json", answers({ answers: [{ id: "Q1", question: "Pick a store?", choice: { id: "custom" }, custom: "secret plan" }] }), 0);
  const text = report(await findAnswers(s.opts));
  assert.ok(text.includes("picked: " + p), text);
  assert.match(text, /set review-x, round 1, FINAL by "Owner" at 2026-11-17T10:00:00Z, 1 decision/);
  assert.ok(!/secret plan|owner text|^\s+Q1/m.test(text), text);
});

test("r2-8: two sets with one file stem ('F 12', 'F_12') are each found", async () => {
  const s = sandbox();
  const mk = (id) => ({ ...SET, id });
  writeFileSync(join(s.holo, "F-12.wizard.html"), wizardPage(mk("F 12")));
  writeFileSync(join(s.holo, "F_12.wizard.html"), wizardPage(mk("F_12")));
  put(s.holo, "F_12-decisions-FINAL.json", answers({ set: "F 12" }), 0);
  put(s.dl, "F_12-decisions-FINAL.json", answers({ set: "F_12", nonce: pageSet(readFileSync(join(s.holo, "F_12.wizard.html"), "utf8")).nonce }), 0);
  const r = await findAnswers(s.opts);
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.picks.map((p) => p.id).sort(), ["F 12", "F_12"]);
});

test("r2-9: one sanitizer and one quoter, imported from wizard.mjs", () => {
  const src = readFileSync(join(HERE, "..", "answers.mjs"), "utf8");
  assert.ok(!/const (clean|q) =/.test(src), "no local copies");
  assert.match(src, /import \{[^}]*\bclean\b[^}]*\bq\b[^}]*\} from "\.\/wizard\.mjs"/);
});

// ------------------------------------------------------ review round 3 ----
test("r3-1: --next-wizard takes a --decisions set whose own round matches the FINAL's", () => {
  const s = sandbox();
  const set2 = nextWizardSet(SET, answers({ answers: [{ id: "Q1", question: "Pick a store?", choice: { id: "defer" }, clarification: "why?" }] }));
  const d = set2.decisions[0];
  const sp = put(s.base, "set2.json", set2), ap = put(s.base, "a2.json", answers({ round: 2, answers: [{ id: d.id, question: d.question, choice: { id: "defer" }, clarification: "more" }] }));
  const r = cli(s, "--decisions", sp, "--next-wizard", ap); // the page on disk is round 1
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /round 3/);
  const bad = cli(s, "--decisions", sp, "--next-wizard", put(s.base, "a4.json", answers({ round: 4 })));
  assert.match(bad.stderr, /the page for round 4 is not on disk/);
});

// Q1 answered in the run file, then the page rebuilt: neither the page nor the run lists Q1 any more.
function q1Settled(s) {
  const set = run1(s), runPath = join(s.root, ".skillator", "run-1-shelf-export.md");
  const md = readFileSync(runPath, "utf8").replace("### Q1 open", "### Q1 answered");
  writeFileSync(runPath, md);
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), wizardPage(setFromRun(parseRun(md), ".skillator/run-1-shelf-export.md")));
  return set;
}

test("r3-2: a FINAL naming a decision the run no longer lists - skipped, never 'unknown decision id'", async () => {
  const s = sandbox();
  const set = q1Settled(s);
  const ans = run1Answers(s, set);
  ans.answers[1] = { id: "Q2", question: set.decisions[1].question, choice: { id: "defer" }, clarification: "why?" };
  const p = put(s.dl, "RUN-1-decisions-FINAL.json", ans, 0);
  const found = await findAnswers(s.opts);
  assert.deepEqual(found.refused, []);
  assert.match(report(found), /Q1: already settled - skipped/);
  const r = cli(s, "RUN-1", "--next-wizard", p);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Q1: already settled - skipped/);
  assert.match(r.stdout, /round 2\), 1 decision to answer/);
  const junk = put(s.dl, "RUN-1-decisions-FINAL (1).json", { ...ans, answers: [{ id: "Q9", choice: { id: "o1" } }] }, 0);
  assert.match(cli(s, "RUN-1", "--next-wizard", junk).stderr, /unknown decision id "Q9"/, "an id the run never had is still refused");
});

test("r3-3: 'F 12' and 'F_12' keep separate nonces; each verifies only its own exports", async () => {
  const s = sandbox();
  for (const id of ["F 12", "F_12"]) assert.equal(cli(s, "--decisions", put(s.base, "set.json", { ...SET, id }), "--wizard").status, 0);
  const a = nonceOf(s, "F-12"), b = nonceOf(s, "F_12");
  assert.notEqual(a, b);
  assert.equal(readFileSync(sidecar(s, "F 12"), "utf8").trim(), a);
  assert.equal(readFileSync(sidecar(s, "F_12"), "utf8").trim(), b);
  put(s.dl, "F_12-decisions-FINAL.json", answers({ set: "F 12", nonce: a }), 0);
  put(s.dl, "F_12-decisions-FINAL (1).json", answers({ set: "F_12", nonce: a }), 0);
  const r = await findAnswers(s.opts);
  assert.deepEqual(r.picks.map((p) => [p.id, p.verified]).sort(), [["F 12", true], ["F_12", false]]);
});

test("r3-4: a RUN set with no run file prints no commands", async () => {
  const s = sandbox();
  const set = run1(s);
  writeFileSync(join(s.holo, "elsewhere.wizard.html"), readFileSync(join(s.holo, "RUN-1.wizard.html"), "utf8"));
  const ans = run1Answers(s, set);
  rmSync(join(s.holo, "RUN-1.wizard.html"));
  rmSync(join(s.root, ".skillator", "run-1-shelf-export.md"));
  put(s.holo, "RUN-1-decisions-FINAL.json", ans, 0);
  const text = report(await findAnswers(s.opts));
  assert.match(text, /run file not found for RUN-1 - nothing applied/);
  assert.ok(!/ answer Q/.test(text), text);
});

test("r4-1: a RUN set's run file is found by the id inside the page, not the page's file name", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set);
  renameSync(join(s.holo, "RUN-1.wizard.html"), join(s.holo, "elsewhere.wizard.html"));
  put(s.dl, "RUN-1-decisions-FINAL.json", ans, 0);
  const text = report(await findAnswers(s.opts));
  assert.match(text, / answer Q1 /);
  assert.ok(!/run file not found/.test(text), text);
});

test("r4-2: --next-wizard keeps a decision the run settled in the settled reference", () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set), runPath = join(s.root, ".skillator", "run-1-shelf-export.md");
  ans.answers[1] = { id: "Q2", question: set.decisions[1].question, choice: { id: "defer" }, clarification: "why?" };
  writeFileSync(runPath, readFileSync(runPath, "utf8").replace("### Q1 open", "### Q1 answered"));
  const r = cli(s, "RUN-1", "--next-wizard", put(s.dl, "RUN-1-decisions-FINAL.json", ans, 0));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(pageSet(readFileSync(join(s.holo, "RUN-1.wizard.html"), "utf8")).settled.map((x) => x.id), ["Q1"]);
});

test("r4-4: a file whose set names none of the ids sharing its stem is refused - no first-id fallback", async () => {
  const s = sandbox();
  for (const [f, id] of [["F-12", "F 12"], ["F_12", "F_12"]]) writeFileSync(join(s.holo, f + ".wizard.html"), wizardPage({ ...SET, id }));
  const p = put(s.holo, "F_12-decisions-FINAL.json", answers({ set: "F-12" }), 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked, null);
  assert.deepEqual(r.refused.map((x) => [x.path, x.why]), [[p, 'set "F-12" is not an open wizard set']]);
});

// ------------------------------------------------------------ A233 ----
const RUN1 = (s) => join(s.root, ".skillator", "run-1-shelf-export.md");
const at = (p, iso) => { const t = new Date(iso); utimesSync(p, t, t); return p; };

test("A233-1: no next-round hint when the only defer is already settled; --next-wizard refuses a 0-decision page", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set);
  ans.answers[1] = { id: "Q2", question: set.decisions[1].question, choice: { id: "defer" }, clarification: "why?" };
  writeFileSync(RUN1(s), readFileSync(RUN1(s), "utf8").replace("### Q2 open", "### Q2 answered"));
  const p = put(s.dl, "RUN-1-decisions-FINAL.json", ans, 0);
  const text = report(await findAnswers(s.opts));
  assert.match(text, / answer Q1 /);
  assert.ok(!/next round:/.test(text), text);
  const before = readFileSync(join(s.holo, "RUN-1.wizard.html"), "utf8");
  const r = cli(s, "RUN-1", "--next-wizard", p);
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /no decision left to ask/);
  assert.equal(readFileSync(join(s.holo, "RUN-1.wizard.html"), "utf8"), before, "the page is not rewritten");
});

test("A233-2: run-0001-*.md beside run-1-*.md - the canonical file wins, whatever the order", async () => {
  const { runFilesFor } = await import("../holo.mjs");
  const a = join("x", ".skillator", "run-1-old.md"), b = join("x", ".skillator", "run-0001-new.md");
  for (const files of [[a, b], [b, a]]) assert.equal(runFilesFor("RUN-1", files)[0], b);
  for (const older of ["canonical", "old"]) {
    const s = sandbox();
    const set = run1(s), md = readFileSync(RUN1(s), "utf8");
    rmSync(RUN1(s));
    const canon = join(s.root, ".skillator", "run-0001-shelf-export.md"), old = join(s.root, ".skillator", "run-1-shelf-export.md");
    writeFileSync(canon, md.replace("# RUN-1 ", "# RUN-0001 "));
    writeFileSync(old, md.replace("### Q1 open", "### Q1 answered"));
    at(older === "canonical" ? canon : old, "2026-11-17T09:00:00Z");
    put(s.dl, "RUN-1-decisions-FINAL.json", run1Answers(s, set), 0);
    const text = report(await findAnswers(s.opts));
    assert.match(text, / answer Q1 /, `${older} older: ${text}`);
  }
});

test("A233-3: a leftover page copy with the same set id never displaces the set's own page; else the newest copy", async () => {
  const s = sandbox(), A = "a".repeat(32), B = "b".repeat(32);
  writeFileSync(join(s.holo, "review-x.wizard.html"), wizardPage(SET, A));
  at(join(s.holo, "review-x.wizard.html"), "2026-11-17T09:00:00Z");
  writeFileSync(join(s.holo, "zz-leftover.wizard.html"), wizardPage(SET, B));
  put(s.dl, "review-x-decisions-FINAL.json", answers({ nonce: A }), 0);
  assert.equal((await findAnswers(s.opts)).picked.verified, true, "own page wins");
  rmSync(join(s.holo, "review-x.wizard.html"));
  writeFileSync(join(s.holo, "a-copy.wizard.html"), wizardPage(SET, A));
  at(join(s.holo, "zz-leftover.wizard.html"), "2026-11-17T09:00:00Z");
  assert.equal((await findAnswers(s.opts)).picked.verified, true, "newest copy wins");
});

function settledRun(s) {
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replaceAll("### Q1 open", "### Q1 answered").replaceAll("### Q2 open", "### Q2 answered");
  writeFileSync(RUN1(s), md);
  at(RUN1(s), "2026-11-17T11:00:00Z");
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), "<!doctype html>");
}

test("A233-4: a fully settled run is listed only while a FINAL for it is newer than the run file", async () => {
  const s = sandbox();
  settledRun(s);
  const p = at(put(s.holo, "RUN-1-decisions-FINAL.json", { ...answers(), set: "RUN-1" }, 0), "2026-11-17T10:00:00Z");
  const r = await findAnswers(s.opts), text = report(r);
  assert.ok(!r.sets.includes("RUN-1"), text);
  assert.ok(!/to apply/.test(text), text);
  assert.ok(r.ignored.some((x) => x.path === p), text);
  at(p, "2026-11-17T12:00:00Z");
  const r2 = await findAnswers(s.opts);
  assert.ok(r2.sets.includes("RUN-1"));
  assert.match(report(r2), /0 to apply, 1 already settled/);
});

test("A233-5: the summary counts only answers that produce a command", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set);
  ans.answers[1] = { id: "Q2", question: set.decisions[1].question, choice: { id: "defer" }, clarification: "why?" };
  put(s.dl, "RUN-1-decisions-FINAL.json", ans, 0);
  assert.match(report(await findAnswers(s.opts)), /, 1 to apply, 0 already settled/);
  put(s.dl, "RUN-1-decisions-FINAL (1).json", { ...ans, nonce: undefined }, 0);
  rmSync(join(s.dl, "RUN-1-decisions-FINAL.json"));
  assert.match(report(await findAnswers(s.opts)), /, 0 to apply, 0 already settled/, "an unverified pick applies nothing");
});

test("A233-6: answers and --next-wizard give the same reconciled set for one page plus run", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set);
  ans.answers[1] = { id: "Q2", question: set.decisions[1].question, choice: { id: "defer" }, clarification: "why?" };
  writeFileSync(RUN1(s), readFileSync(RUN1(s), "utf8").replace("### Q1 open", "### Q1 answered"));
  const p = put(s.dl, "RUN-1-decisions-FINAL.json", ans, 0);
  const r = await findAnswers(s.opts), text = report(r);
  const c = cli(s, "RUN-1", "--next-wizard", p);
  assert.equal(c.status, 0, c.stderr);
  const page = pageSet(readFileSync(join(s.holo, "RUN-1.wizard.html"), "utf8"));
  assert.deepEqual([...r.picked.openNow], page.decisions.map((d) => d.id));
  assert.deepEqual([...text.matchAll(/# (\w+): already settled - skipped/g)].map((m) => m[1]), [...c.stdout.matchAll(/(\w+): already settled - skipped/g)].map((m) => m[1]));
  assert.ok(page.settled.filter((x) => x.id === "Q1").length === 1, "Q1 settled once");
});

test("A233-7: an unreadable own page does not block a readable copy with the same set id", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set), A = "a".repeat(32);
  writeFileSync(join(s.holo, "zz-copy.wizard.html"), wizardPage(set, A));
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), "<!doctype html>");
  put(s.dl, "RUN-1-decisions-FINAL.json", { ...ans, nonce: A }, 0);
  const r = await findAnswers(s.opts);
  assert.equal(r.picked && r.picked.verified, true, report(r));
});

test("A233-8: only a verified FINAL keeps a settled run listed", async () => {
  const s = sandbox();
  settledRun(s);
  put(s.dl, "RUN-1-decisions-FINAL.json", { ...answers(), set: "RUN-1" }, 0);
  put(s.dl, "RUN-1-decisions-FINAL (1).json", { ...answers(), set: "RUN-1", nonce: "c".repeat(32) }, 0);
  const r = await findAnswers(s.opts);
  assert.ok(!r.sets.includes("RUN-1"), report(r));
});

// ------------------------------------------------------------ A237 ----
test("A237-1: a settled run with answer times in its run file is judged by finalizedAt, not file times", async () => {
  const s = sandbox();
  settledRun(s);
  writeFileSync(RUN1(s), readFileSync(RUN1(s), "utf8").replace("answer: -", "answer: JSON\nanswered: 2026-11-17T11:00Z"));
  at(RUN1(s), "2026-11-17T13:00:00Z"); // relay-morpheus rewrote run.md later
  const p = at(put(s.holo, "RUN-1-decisions-FINAL.json", { ...answers({ finalizedAt: "2026-11-17T12:00:00Z" }), set: "RUN-1" }, 0), "2026-11-17T12:00:00Z");
  assert.ok((await findAnswers(s.opts)).sets.includes("RUN-1"), "a FINAL finalized after the last answer stays listed though the run file is newer");
  writeFileSync(p, JSON.stringify({ ...answers(), set: "RUN-1" })); // finalized 10:00, before the 11:00 answer
  at(p, "2026-11-17T14:00:00Z"); // a copy or sync made the file look new
  const r = await findAnswers(s.opts);
  assert.ok(!r.sets.includes("RUN-1"), report(r));
  assert.ok(r.ignored.some((x) => x.path === p), report(r));
});

test("A237-5: one runKey - RUN-1, RUN-0001 and run-1 are one set everywhere", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set);
  writeFileSync(join(s.holo, "RUN-0001.wizard.html"), readFileSync(join(s.holo, "RUN-1.wizard.html"), "utf8"));
  put(s.dl, "RUN-0001-decisions-FINAL.json", { ...ans, set: "RUN-0001" }, 0);
  const r = await findAnswers(s.opts), text = report(r);
  assert.deepEqual(r.sets.filter((x) => x !== "review-x"), ["RUN-1"], text);
  assert.match(text, / answer Q1 /);
  const c = cli(s, "RUN-1", "--next-wizard", put(s.base, "a.json", { ...ans, set: "RUN-0001", answers: [ans.answers[0], { ...ans.answers[1], choice: { id: "defer" }, clarification: "why?" }] }));
  assert.equal(c.status, 0, c.stderr);
});

test("A237-5: an unreadable lowercase page keys by runKey", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set);
  rmSync(join(s.holo, "RUN-1.wizard.html"));
  writeFileSync(join(s.holo, "run-1.wizard.html"), "<!doctype html>");
  put(s.holo, "RUN-1-decisions-FINAL.json", { ...ans, nonce: undefined }, 0);
  assert.match(report(await findAnswers(s.opts)), / answer Q1 /);
});

test("A237-6: an unverified or draft file on a settled run says so", async () => {
  const s = sandbox();
  settledRun(s);
  const u = put(s.dl, "RUN-1-decisions-FINAL.json", { ...answers(), set: "RUN-1" }, 0);
  const d = put(s.holo, "RUN-1-decisions-draft.json", { ...answers(DRAFT), set: "RUN-1" }, 0);
  const r = await findAnswers(s.opts), why = (p) => r.ignored.find((x) => x.path === p)?.why;
  assert.match(why(u), /unverified/, report(r));
  assert.match(why(d), /draft/, report(r));
});

test("A237-7: sameSet and runKey - by number, any case; reconcile drops a foreign page set", () => {
  assert.equal(runKey("RUN-0001"), "RUN-1");
  assert.equal(runKey("run-5"), "RUN-5");
  assert.equal(runKey("F 12"), "F 12");
  assert.ok(sameSet("RUN-1", "RUN-0001") && sameSet("run-1", "RUN-1"));
  assert.ok(!sameSet("RUN-1", "RUN-10") && !sameSet("F12", "f12"));
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8"), run = parseRun(md);
  const r = reconcile({ ...SET, id: "RUN-10" }, run, "run-1.md");
  assert.equal(r.set.id, "RUN-1");
  assert.deepEqual(r.set.decisions.map((d) => d.id), ["Q1", "Q2"]);
  assert.equal(reconcile({ ...SET, id: "RUN-0001" }, run, "run-1.md").set.title, SET.title, "the same run, spelled otherwise, keeps the page's set");
});

test("A237-10: a lowercase set id never crashes report - one case rule", async () => {
  const s = sandbox();
  const set = run1(s), ans = run1Answers(s, set), A = "a".repeat(32);
  rmSync(join(s.holo, "RUN-1.wizard.html"));
  writeFileSync(join(s.holo, "run-1.wizard.html"), wizardPage({ ...set, id: "run-1" }, A));
  put(s.dl, "run-1-decisions-FINAL.json", { ...ans, set: "run-1", nonce: A }, 0);
  assert.equal(answersToCommands({ ...answers(), set: "run-1" }).commands[0], "sh relay-morpheus.sh 1 answer Q1 'SQLite'");
  assert.match(report(await findAnswers(s.opts)), / answer Q1 /);
});

// ------------------------------------------------------- A237 fix round ----
test("A237-r1: only a RUN- id is a run - a --decisions set '12' keeps its own set beside run-0012-*.md", async () => {
  const s = sandbox();
  writeFileSync(join(s.holo, "12.wizard.html"), wizardPage({ ...SET, id: "12" }));
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replace("# RUN-1 ", "# RUN-12 ");
  writeFileSync(join(s.root, ".skillator", "run-0012-shelf-export.md"), md);
  put(s.holo, "12-decisions-FINAL.json", { ...answers(), set: "12" }, 0);
  const r = await findAnswers(s.opts), text = report(r);
  assert.equal(r.picked && r.picked.id, "12", text);
  assert.equal(r.picked.openNow, undefined, text);
  assert.match(text, /Q1: answered - "SQLite"/);
});

function stampedRun(s, q2 = "### Q2 answered") {
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replace("### Q1 open", "### Q1 answered")
    .replace("answer: -", "answer: JSON\nanswered: 2026-11-17T11:00Z").replace("### Q2 open", q2);
  writeFileSync(RUN1(s), md);
  at(RUN1(s), "2026-11-17T13:00:00Z");
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), "<!doctype html>");
}
const finalAt = (s, iso) => put(s.holo, "RUN-1-decisions-FINAL.json", { ...answers({ finalizedAt: iso }), set: "RUN-1" }, 0);

test("A237-r2: a FINAL is newer than the run's last answer only in a later minute", async () => {
  const s = sandbox();
  stampedRun(s);
  finalAt(s, "2026-11-17T11:00:30Z");
  assert.ok(!(await findAnswers(s.opts)).sets.includes("RUN-1"), "same minute as the answered stamp: not newer");
  finalAt(s, "2026-11-17T11:01:00Z");
  assert.ok((await findAnswers(s.opts)).sets.includes("RUN-1"), "a later minute: newer");
});

test("A237-r3: a settled decision with no time (moot) - judged by the later of the answer time and the run's updated: stamp", async () => {
  const s = sandbox();
  mootQ2(s, "2026-11-17T13:00Z");
  finalAt(s, "2026-11-17T12:00:00Z");
  assert.ok(!(await findAnswers(s.opts)).sets.includes("RUN-1"), "finalized after the 11:00 answer but before the 13:00 run file");
  finalAt(s, "2026-11-17T13:01:00Z");
  assert.ok((await findAnswers(s.opts)).sets.includes("RUN-1"));
});

test("A237-r4/A241-1: the canonical page is pageFile(set.id) - holo's padded RUN-0001 page beats a stray RUN-1 copy", async () => {
  const s = sandbox(), A = "a".repeat(32), B = "b".repeat(32);
  const md = readFileSync(join(HERE, "..", "fixtures", "repo-two-qs", "_run.md"), "utf8").replaceAll("@LANDED@", "abc1234").replace("# RUN-1 ", "# RUN-0001 ");
  writeFileSync(join(s.root, ".skillator", "run-0001-shelf-export.md"), md);
  const set = setFromRun(parseRun(md), ".skillator/run-0001-shelf-export.md"), own = join(s.holo, "RUN-0001.wizard.html");
  at((writeFileSync(own, wizardPage(set, A)), own), "2026-11-17T09:00:00Z");
  writeFileSync(join(s.holo, "RUN-1.wizard.html"), wizardPage(set, B));
  const ans = run1Answers(s, set);
  put(s.dl, "RUN-1-decisions-FINAL.json", { ...ans, nonce: A }, 0);
  assert.equal((await findAnswers(s.opts)).picked.verified, true, "canonical RUN-0001 page beats a newer RUN-1 copy");
  writeFileSync(own, "<!doctype html>");
  put(s.dl, "RUN-1-decisions-FINAL.json", { ...ans, nonce: B }, 0);
  assert.equal((await findAnswers(s.opts)).picked.verified, true, "canonical unreadable: the RUN-1 page");
});

test("A237-r5: a settled-run FINAL with no valid finalizedAt is refused as such", async () => {
  const s = sandbox();
  stampedRun(s);
  const p = finalAt(s, "yesterday");
  const r = await findAnswers(s.opts);
  assert.equal(r.refused.find((x) => x.path === p)?.why, "finalizedAt is not an ISO 8601 time", report(r));
  assert.ok(!r.ignored.some((x) => x.path === p), report(r));
});

// ------------------------------------------------------------ A241 ----
// Q2 settled moot with no time; updated: the run file's stamp (null drops it); mtime: the file time.
function mootQ2(s, updated, mtime = "2026-11-17T13:00:00Z") {
  stampedRun(s, "### Q2 moot");
  const md = readFileSync(RUN1(s), "utf8").replace(/(### Q2 moot[\s\S]*?)answer: -/, "$1moot: covered by F5");
  writeFileSync(RUN1(s), md.replace(/ *updated: \S+/, updated ? ` updated: ${updated}` : ""));
  at(RUN1(s), mtime);
}

test("A241-2: an untimed settled decision is bounded by the run's updated: stamp, not a later file mtime", async () => {
  const s = sandbox();
  mootQ2(s, "2026-11-17T12:00Z", "2026-11-17T15:00:00Z"); // a checkout or merge bumped the file
  finalAt(s, "2026-11-17T11:30:00Z");
  assert.ok(!(await findAnswers(s.opts)).sets.includes("RUN-1"), "before the updated: stamp");
  finalAt(s, "2026-11-17T12:30:00Z");
  assert.ok((await findAnswers(s.opts)).sets.includes("RUN-1"), "after the updated: stamp, though before the file mtime");
});

test("A241-3: no updated: stamp - the millisecond file mtime bounds it, with no minute flooring", async () => {
  const s = sandbox();
  mootQ2(s, null, "2026-11-17T13:00:30.000Z");
  finalAt(s, "2026-11-17T13:00:15Z");
  assert.ok(!(await findAnswers(s.opts)).sets.includes("RUN-1"), "before the mtime");
  finalAt(s, "2026-11-17T13:00:45Z");
  assert.ok((await findAnswers(s.opts)).sets.includes("RUN-1"), "after the mtime, in the same minute");
});

test("A241-4: an answered decision with no stamp (legacy) is untimed, not time 0", async () => {
  const s = sandbox();
  stampedRun(s); // Q1 answered at 11:00, Q2 answered with no stamp
  writeFileSync(RUN1(s), readFileSync(RUN1(s), "utf8").replace(/updated: \S+/, "updated: 2026-11-17T13:00Z"));
  finalAt(s, "2026-11-17T12:00:00Z");
  assert.ok(!(await findAnswers(s.opts)).sets.includes("RUN-1"), "before the updated: stamp that covers Q2");
  finalAt(s, "2026-11-17T13:01:00Z");
  assert.ok((await findAnswers(s.opts)).sets.includes("RUN-1"));
});

// B30: the plugin cache is reached through a link (~/.claude-<profile>/plugins -> ~/.claude/plugins).
// argv[1] kept the link's spelling, import.meta.url the real path: main never ran, output was empty.
test("B30: holo.mjs --selftest and answers.mjs still run when started through a linked directory", (t) => {
  const d = mkdtempSync(join(tmpdir(), "holo-b30-"));
  const link = join(d, "linked");
  symlinkSync(join(HERE, ".."), link, process.platform === "win32" ? "junction" : "dir");
  // The link goes first: a recursive rm must never walk through it into the repo.
  t.after(() => { (process.platform === "win32" ? rmdirSync : unlinkSync)(link); rmSync(d, { recursive: true, force: true }); });
  const run = (...a) => spawnSync(process.execPath, a, { cwd: d, encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"] });
  const h = run(join(link, "holo.mjs"), "--selftest");
  assert.equal(h.status, 0, h.stderr);
  assert.match(h.stdout, /^selftest: ok$/m, h.stdout);
  const a = run(join(link, "answers.mjs"), "--root", d);
  assert.equal(a.status, 0, a.stderr);
  assert.ok(a.stdout.includes("no answers file found"), a.stdout);
});
