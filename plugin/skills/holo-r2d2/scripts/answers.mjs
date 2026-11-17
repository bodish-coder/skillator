// holo-r2d2 answers finder (F179): "check wizard answers" / "r2d2 answers".
// Finds the newest `<set>-decisions-FINAL|draft.json` for each open wizard set in
// the page folder (.skillator/holo), then the browser's real download folder(s),
// the OS Downloads folder and the folder named in ~/.skillator/holo/answers-dir.
// Validates a FINAL exactly as --next-wizard does (nextWizardSet, A210 identity
// rules) and prints the existing writers' lines for the session to run. A draft
// is reported, never applied. Reads local files only and writes nothing; from a
// browser profile it reads only the download-directory preference.
//
//   node answers.mjs [--root DIR]
import { readFile, readdir, stat } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nextWizardSet, setFromRun, answersToCommands } from "./wizard.mjs";
import { parseRun, findRoot, runFiles } from "./holo.mjs";

const MAX_FILE = 1048576;
const NAME = /^(.+)-decisions-(FINAL|draft)\s*(?:\(\d+\))?\.json$/i;
const SHELL_FOLDERS = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";
const DOWNLOADS_GUID = "{374DE290-123F-4565-9164-39C4925E467B}";

const tryRead = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const tryDir = (p) => { try { return readdirSync(p); } catch { return []; } };

function winDownloads() {
  try {
    const out = execFileSync("reg", ["query", SHELL_FOLDERS, "/v", DOWNLOADS_GUID], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 });
    return /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out)?.[1].trim() || null;
  } catch { return null; }
}

// Every download folder worth searching, in order, each with where it came from.
export function downloadDirs({ home = homedir(), env = process.env, platform = process.platform, regQuery = winDownloads } = {}) {
  const out = [];
  const add = (dir, why) => { if (dir && !out.some((d) => d.dir.toLowerCase() === dir.toLowerCase())) out.push({ dir, why }); };
  let chromium, firefox;
  if (platform === "win32") {
    const L = env.LOCALAPPDATA || join(home, "AppData", "Local");
    chromium = [["Chrome", join(L, "Google", "Chrome", "User Data")], ["Edge", join(L, "Microsoft", "Edge", "User Data")]];
    firefox = join(env.APPDATA || join(home, "AppData", "Roaming"), "Mozilla", "Firefox", "Profiles");
  } else if (platform === "darwin") {
    const S = join(home, "Library", "Application Support");
    chromium = [["Chrome", join(S, "Google", "Chrome")], ["Edge", join(S, "Microsoft Edge")]];
    firefox = join(S, "Firefox", "Profiles");
  } else {
    const C = env.XDG_CONFIG_HOME || join(home, ".config");
    chromium = [["Chrome", join(C, "google-chrome")], ["Edge", join(C, "microsoft-edge")]];
    firefox = join(home, ".mozilla", "firefox");
  }
  for (const [browser, userData] of chromium) {
    for (const p of tryDir(userData).filter((n) => n === "Default" || /^Profile \d+$/.test(n)).sort()) {
      let dir;
      try { dir = JSON.parse(tryRead(join(userData, p, "Preferences")) || "{}")?.download?.default_directory; } catch { dir = null; }
      if (typeof dir === "string") add(dir, `${browser} ${p} download.default_directory`);
    }
  }
  for (const p of tryDir(firefox).sort()) {
    const m = /^user_pref\("browser\.download\.dir",\s*"((?:[^"\\]|\\.)*)"\);/m.exec(tryRead(join(firefox, p, "prefs.js")) || "");
    if (m) { try { add(JSON.parse(`"${m[1]}"`), `Firefox ${p} browser.download.dir`); } catch { /* malformed pref */ } }
  }
  const known = platform === "win32" ? regQuery() : null;
  if (known) add(known.replace(/%([^%]+)%/g, (all, k) => env[k] ?? env[k.toUpperCase()] ?? all), "Windows Downloads folder");
  else add(join(home, "Downloads"), "Downloads folder");
  const owner = (tryRead(join(home, ".skillator", "holo", "answers-dir")) || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (owner) add(owner, "~/.skillator/holo/answers-dir");
  return out;
}

// Open sets: a wizard page in the page folder; a RUN set is rebuilt from its run
// file (the live truth) and is open only while it has an open or asked decision.
async function openSets(root, holo) {
  const sets = new Map();
  const runs = await runFiles(root);
  for (const n of tryDir(holo).filter((n) => n.endsWith(".wizard.html"))) {
    const stem = n.slice(0, -".wizard.html".length);
    try {
      const m = /^RUN-(\d+)$/i.exec(stem);
      let set;
      if (m) {
        const path = runs.find((f) => { const k = /^run-(\d+)-/.exec(f.replace(/^.*[\\/]/, "")); return k && Number(k[1]) === Number(m[1]); });
        if (!path) continue;
        set = setFromRun(parseRun(await readFile(path, "utf8")), relative(root, path).replace(/\\/g, "/"));
      } else {
        const page = await readFile(join(holo, n), "utf8");
        set = JSON.parse(/<script type="application\/json" id="holo-set">([\s\S]*?)<\/script>/.exec(page)[1]);
      }
      if (set.decisions && set.decisions.length) sets.set(String(set.id), set);
    } catch { /* not a readable wizard page */ }
  }
  return sets;
}

const isFinal = (a) => !!a && a.final !== false && typeof a.finalizedAt === "string" && !!a.finalizedAt.trim() && a.reviewed === true && !!String(a.owner || "").trim();

export async function findAnswers({ root = findRoot(process.cwd()), ...where } = {}) {
  const holo = join(root, ".skillator", "holo");
  const sets = await openSets(root, holo);
  const searched = [{ dir: holo, why: "page folder" }, ...downloadDirs(where)];
  const r = { searched, sets: [...sets.keys()], picks: [], drafts: [], refused: [], ignored: [] };
  const cands = [];
  for (const [i, f] of searched.entries()) {
    let names;
    try { names = await readdir(f.dir); f.found = 0; } catch { f.missing = true; continue; }
    for (const n of names) {
      const m = NAME.exec(n);
      if (!m) continue;
      f.found++;
      const path = join(f.dir, n);
      if (!sets.has(m[1])) { r.ignored.push({ path, why: `"${m[1]}" is not an open wizard set` }); continue; }
      try {
        const s = await stat(path);
        if (s.size > MAX_FILE) throw new Error("larger than 1 MB");
        cands.push({ path, folder: i, mtime: s.mtimeMs, id: m[1], ans: JSON.parse(await readFile(path, "utf8")) });
      } catch (e) { r.refused.push({ path, why: e.message }); }
    }
  }
  // FINAL before draft, then folder order, then newest.
  cands.sort((a, b) => isFinal(b.ans) - isFinal(a.ans) || a.folder - b.folder || b.mtime - a.mtime);
  for (const c of cands) {
    if (r.picks.some((p) => p.id === c.id)) continue;
    if (!isFinal(c.ans)) { if (!r.drafts.some((d) => d.id === c.id)) r.drafts.push(c); continue; }
    try { nextWizardSet(sets.get(c.id), c.ans); r.picks.push(c); }
    catch (e) { r.refused.push({ path: c.path, why: e.message }); }
  }
  r.drafts = r.drafts.filter((d) => !r.picks.some((p) => p.id === d.id));
  r.picked = r.picks[0] || null;
  r.draft = r.drafts[0] || null;
  return r;
}

export function report(r) {
  const L = ["holo answers - folders searched, in order:"];
  for (const f of r.searched) L.push(`  ${f.dir}  (${f.why}; ${f.missing ? "missing" : `${f.found} answer file${f.found === 1 ? "" : "s"}`})`);
  L.push(`open wizard sets: ${r.sets.join(", ") || "none"}`);
  for (const p of r.picks) {
    const a = p.ans;
    L.push("", `picked: ${p.path}`, `  set ${p.id}, FINAL by ${a.owner} at ${a.finalizedAt}`);
    if (/^RUN-\d+$/.test(p.id)) {
      const c = answersToCommands(a);
      L.push("# POSIX sh lines (Git Bash on Windows) - read them, then run them yourself", ...c.commands, ...c.review.map((x) => `# review: ${x}`), ...c.open.map((x) => `# still open: ${x}`));
    } else {
      for (const x of a.answers || []) {
        const cid = String(x?.choice?.id || "");
        const what = cid === "custom" ? `custom - ${x.custom || ""}` : cid === "defer" || cid === "explain" ? `ask / explain - ${x.clarification || ""}` : cid ? `answered - ${x.choice.label || cid}` : "no answer";
        L.push(`  ${x.id}${x.ticket ? ` (${x.ticket})` : ""}: ${what}`.replace(/\s+$/, ""));
      }
    }
    if ((a.answers || []).some((x) => ["custom", "defer", "explain"].includes(String(x?.choice?.id || "")))) {
      L.push(/^RUN-\d+$/.test(p.id)
        ? `next round: node ${join(dirname(fileURLToPath(import.meta.url)), "holo.mjs")} ${p.id} --next-wizard "${p.path}"`
        : `next round: holo.mjs --decisions <the set JSON that drew this page> --next-wizard "${p.path}"`);
    }
  }
  for (const d of r.drafts) L.push("", `draft - not applied: ${d.path} (set ${d.id}; finalize it on the page first)`);
  for (const x of r.refused) L.push(`refused: ${x.path} - ${x.why}`);
  for (const x of r.ignored) L.push(`ignored: ${x.path} - ${x.why}`);
  if (!r.picks.length && !r.drafts.length) L.push("", "no answers file found for an open set");
  return L.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf("--root");
  findAnswers(i >= 0 ? { root: resolve(a[i + 1]) } : {})
    .then((r) => { console.log(report(r)); })
    .catch((e) => { console.error(`answers: ${e.message}`); process.exit(1); });
}
