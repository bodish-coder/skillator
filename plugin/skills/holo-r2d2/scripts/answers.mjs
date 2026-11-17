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
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nextWizardSet, setFromRun, answersToCommands, isFinalized, fileStem, pageSet, settledIn, without, CTRL, clean, q } from "./wizard.mjs";
import { parseRun, findRoot, runFiles, nonceFile } from "./holo.mjs";

const MAX_FILE = 1048576;
const NAME = /^(.+)-decisions-(FINAL|draft)\s*(?:\(\d+\))?\.json$/i;
const SHELL_FOLDERS = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";
const DOWNLOADS_GUID = "{374DE290-123F-4565-9164-39C4925E467B}";

// Text from an answers file is data (clean and q come from wizard.mjs); free text printed JSON-quoted.
const CTRL_G = new RegExp(CTRL.source, "g");
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;
const show = (v) => JSON.stringify(clean(v));

const tryRead =(p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const tryDir = (p) => { try { return readdirSync(p); } catch { return []; } };

function winDownloads() {
  try {
    const out = execFileSync("reg", ["query", SHELL_FOLDERS, "/v", DOWNLOADS_GUID], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 });
    return /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out)?.[1].trim() || null;
  } catch { return null; }
}

// One folder, one key: resolved, symlinks followed when it exists; case folded only
// where the file system folds it by default.
function dedupe(list, platform = process.platform) {
  const seen = new Set();
  return list.filter(({ dir }) => {
    let k = resolve(dir);
    try { k = realpathSync(k); } catch { /* not there (yet) */ }
    k = k.replace(/[\\/]+$/, "");
    if (platform === "win32" || platform === "darwin") k = k.toLowerCase();
    return dir && !seen.has(k) && seen.add(k);
  });
}

// XDG_DOWNLOAD_DIR from user-dirs.dirs, $HOME expanded; null when unset.
function xdgDownload(home, env) {
  const m = /^XDG_DOWNLOAD_DIR="([^"]*)"/m.exec(tryRead(join(env.XDG_CONFIG_HOME || join(home, ".config"), "user-dirs.dirs")) || "");
  const h = m && /^\$(?:HOME|\{HOME\})(?=\/|$)(.*)$/.exec(m[1]);
  return h ? join(home, h[1]) : m && m[1] ? m[1] : null;
}

// Every download folder worth searching, in order, each with where it came from.
export function downloadDirs({ home = homedir(), env = process.env, platform = process.platform, regQuery = winDownloads } = {}) {
  const out = [];
  const add = (dir, why) => { if (dir) out.push({ dir, why }); };
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
  const xdg = platform !== "win32" && platform !== "darwin" ? xdgDownload(home, env) : null;
  if (known) add(known.replace(/%([^%]+)%/g, (all, k) => env[k] ?? env[k.toUpperCase()] ?? all), "Windows Downloads folder");
  else if (xdg) add(xdg, "XDG_DOWNLOAD_DIR");
  else add(join(home, "Downloads"), "Downloads folder");
  const owner = (tryRead(join(home, ".skillator", "holo", "answers-dir")) || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (owner) add(owner, "~/.skillator/holo/answers-dir");
  return dedupe(out, platform);
}

// Open sets: a wizard page in the page folder, validated against the set the page
// embeds (a --next-wizard page is round 2+). A RUN set's run file is found by that set's id (by the page's
// file name only when the page is unreadable - the set is then rebuilt from the run). openNow: a RUN
// set's decisions still open or asked in the run file now - only those may get a command; gone: the ones settled there.
async function openSets(root, holo) {
  const sets = new Map(), openNow = new Map(), gone = new Map();
  const runs = await runFiles(root);
  for (const n of tryDir(holo).filter((n) => n.endsWith(".wizard.html"))) {
    try {
      let set = pageSet(await readFile(join(holo, n), "utf8"));
      const m = /^RUN-(\d+)$/i.exec(String(set?.id ?? n.slice(0, -".wizard.html".length)));
      const path = m && runs.find((f) => { const k = /^run-(\d+)-/.exec(f.replace(/^.*[\\/]/, "")); return k && Number(k[1]) === Number(m[1]); });
      if (path) {
        const run = parseRun(await readFile(path, "utf8"));
        const live = setFromRun(run, relative(root, path).replace(/\\/g, "/"));
        if (!set || String(set.id) !== String(live.id)) set = live;
        openNow.set(String(set.id), new Set(live.decisions.map((d) => d.id)));
        gone.set(String(set.id), settledIn(run));
      }
      if (set && set.decisions && (path || set.decisions.length)) sets.set(String(set.id), set);
    } catch { /* not a readable wizard page */ }
  }
  return { sets, openNow, gone };
}

export async function findAnswers({ root = findRoot(process.cwd()), ...where } = {}) {
  const holo = join(root, ".skillator", "holo");
  const { sets, openNow, gone } = await openSets(root, holo);
  const searched = dedupe([{ dir: holo, why: "page folder" }, ...downloadDirs(where)], where.platform);
  const byStem = new Map();
  for (const id of sets.keys()) byStem.set(fileStem(id), [...(byStem.get(fileStem(id)) || []), id]);
  const r = { searched, sets: [...sets.keys()], picks: [], superseded: [], unverifiedNewer: [], drafts: [], refused: [], ignored: [] };
  const cands = [];
  for (const [i, f] of searched.entries()) {
    let names;
    try { names = await readdir(f.dir); f.found = 0; } catch { f.missing = true; continue; }
    for (const n of names) {
      const m = NAME.exec(n);
      if (!m) continue;
      f.found++;
      const path = join(f.dir, n);
      const ids = byStem.get(m[1]);
      if (!ids) { r.ignored.push({ path, why: `"${m[1]}" is not an open wizard set` }); continue; }
      try {
        const s = await stat(path);
        if (s.size > MAX_FILE) throw new Error("larger than 1 MB");
        const ans = JSON.parse(await readFile(path, "utf8"));
        // Set ids can share a file stem ("F 12", "F_12"): the one the file names.
        const id = ids.find((x) => x === String(ans?.set));
        if (id === undefined) throw new Error(`set ${show(ans?.set)} is not an open wizard set`);
        cands.push({ path, folder: i, mtime: s.mtimeMs, id, ans, openNow: openNow.get(id) });
      } catch (e) { r.refused.push({ path, why: e.message }); }
    }
  }
  // Verified: the export carries this page's nonce (the sidecar's when the page has none), or
  // (an older export without one) it sits in the page folder, which is the owner's repo.
  for (const c of cands) {
    const pageNonce = sets.get(c.id).nonce || (tryRead(nonceFile(root, c.id)) || "").trim();
    c.verified = c.ans && c.ans.nonce ? !!pageNonce && c.ans.nonce === pageNonce : searched[c.folder].why === "page folder";
  }
  // FINAL before draft, verified before unverified (never fail open), then the
  // higher round, newest finalizedAt, newest file; folder order only breaks a tie.
  const when = (c) => Date.parse(c.ans && c.ans.finalizedAt) || 0;
  const fresher = (a, b) => (Number(b.ans?.round) || 1) - (Number(a.ans?.round) || 1) || when(b) - when(a) || b.mtime - a.mtime;
  cands.sort((a, b) => isFinalized(b.ans) - isFinalized(a.ans) || b.verified - a.verified || fresher(a, b) || a.folder - b.folder);
  for (const c of cands) {
    if (!isFinalized(c.ans)) { if (!r.drafts.some((d) => d.id === c.id)) r.drafts.push(c); continue; }
    try {
      if (!ISO.test(c.ans.finalizedAt) || !Date.parse(c.ans.finalizedAt)) throw new Error("finalizedAt is not an ISO 8601 time");
      if (typeof c.ans.owner !== "string" || c.ans.owner.trim().length > 200 || CTRL.test(c.ans.owner)) throw new Error("owner is not one short line");
      nextWizardSet(sets.get(c.id), without(c.ans, gone.get(c.id) || new Set()));
    } catch (e) { r.refused.push({ path: c.path, why: e.message }); continue; }
    const pick = r.picks.find((p) => p.id === c.id);
    if (!pick) r.picks.push(c);
    else if (pick.verified && !c.verified && fresher(pick, c) > 0) r.unverifiedNewer.push(c);
    else r.superseded.push(c);
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
    // Only decisions still open or asked in the run file now: a FINAL checked twice never applies twice.
    const live = (x) => !p.openNow || p.openNow.has(String(x?.id));
    const n = (a.answers || []).filter(live).length, skipped = (a.answers || []).length - n;
    L.push("", `picked: ${p.path}`, `  set ${clean(p.id)}, round ${Number(a.round) || 1}, FINAL by ${show(a.owner)} at ${clean(a.finalizedAt, 40)}, ${p.openNow ? `${n} to apply, ${skipped} already settled` : `${n} decision${n === 1 ? "" : "s"}`}`);
    const run = /^RUN-\d+$/i.test(p.id);
    if (!p.verified) { L.push("  unverified - confirm with the owner before applying (no page nonce match); no commands printed"); continue; }
    if (run && !p.openNow) { L.push(`  run file not found for ${clean(p.id)} - nothing applied`); continue; }
    if (run) {
      const c = answersToCommands({ ...a, answers: (a.answers || []).filter(live) });
      L.push("# POSIX sh lines (Git Bash on Windows) - read them, then run them yourself", ...c.commands, ...c.review.map((x) => `# review: ${x}`), ...c.open.map((x) => `# still open: ${x}`),
        ...(a.answers || []).filter((x) => !live(x)).map((x) => `# ${clean(x?.id, 40)}: already settled - skipped`));
    } else {
      for (const x of a.answers || []) {
        const cid = String(x?.choice?.id || "");
        const what = cid === "custom" ? `custom - owner text (data): ${show(x.custom)}`
          : cid === "defer" || cid === "explain" ? `ask / explain - owner text (data): ${show(x.clarification)}`
          : cid ? `answered - ${show(x.choice.label || cid)}` : "no answer";
        L.push(`  ${clean(x?.id, 40)}${x?.ticket ? ` (${clean(x.ticket, 40)})` : ""}: ${what}`);
      }
    }
    if ((a.answers || []).some((x) => ["custom", "defer", "explain"].includes(String(x?.choice?.id || "")))) {
      L.push(run
        ? `next round: node ${q(join(dirname(fileURLToPath(import.meta.url)), "holo.mjs"))} ${p.id} --next-wizard ${q(p.path)}`
        : `next round: holo.mjs --decisions <the set JSON that drew this page> --next-wizard ${q(p.path)}`);
    }
  }
  for (const x of r.superseded) L.push(`superseded: ${x.path} (set ${clean(x.id)}; older than the FINAL picked)`);
  for (const x of r.unverifiedNewer) L.push(`newer unverified file found: ${x.path} - confirm with the owner (set ${clean(x.id)}; not applied)`);
  for (const d of r.drafts) L.push("", `draft - not applied: ${d.path} (set ${clean(d.id)}; finalize it on the page first)`);
  for (const x of r.refused) L.push(`refused: ${x.path} - ${clean(x.why)}`);
  for (const x of r.ignored) L.push(`ignored: ${x.path} - ${clean(x.why)}`);
  if (!r.picks.length && !r.drafts.length) L.push("", "no answers file found for an open set");
  // Paths and folder names come from disk and profiles: no line may carry a control character.
  return L.map((l) => l.replace(CTRL_G, " ")).join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf("--root");
  if (i >= 0 && !a[i + 1]) { console.error("answers: --root needs a path"); process.exit(2); }
  findAnswers(i >= 0 ? { root: resolve(a[i + 1]) } : {})
    .then((r) => { console.log(report(r)); })
    .catch((e) => { console.error(`answers: ${e.message}`); process.exit(1); });
}
