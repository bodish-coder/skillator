# merge-smith — conflict routing: payloads, return formats, timeouts

The dispatch contract behind `SKILL.md` Phase 3. Every agent gets its own prompt and
no session history; everything it needs is in the payload. A return that does not
match its format is treated as null (§Null and timeout).

## Order of work

1. **Classify** every conflicted hunk (build tier). No hunk is resolved before it has
   a `class:` + `why:` row in the merge log.
2. **Resolve** — `trivial` hunks: cheap tier. `semantic` hunks: deep tier proposes,
   a second deep-tier agent reviews where required, the user approves (or `assumed:`
   when unattended), and the **main session** applies the approved text.
3. **Reconcile** (Phase 4). An unexplained `FAIL`: deep tier diagnoses, build tier
   re-applies.

**Hunks of one file run in sequence; different files run in parallel.** Resolving
hunk 2 shifts the lines of hunk 3, and two agents writing one file race — so one file
is one queue, and each step in it starts from the file as the previous step left it.

## Classify (build tier — `model: "opus"`)

One agent per conflicted file. Payload: the path; the file after
`git checkout --conflict=diff3 -- <path>` (base | destination | source for every
hunk); both branches' Phase 1 `INTENT:` lines; the class lists from `SKILL.md`
Phase 3. Return, one block per hunk, in file order:

```
HUNK:   <path> #<n>  (lines <a>-<b>)
CLASS:  trivial | semantic
WHY:    <one line: what each side did relative to the base>
```

No base section visible, or the agent cannot say what each side did → `semantic`.

## Resolve a trivial hunk (cheap tier — `model: "sonnet"`)

Payload: the diff3 hunk, its CLASS/WHY block, the take rules (`source` /
`destination` / `both`; lockfiles regenerate per git-procedure.md §Lockfiles).
Return:

```
HUNK:   <path> #<n>
TAKE:   source | destination | both | regenerated
TEXT:   <the resolved lines, verbatim>
```

If the agent finds the hunk is not trivial after all, it returns
`TAKE: escalate` + a `WHY:` line, and the hunk goes to Propose.

## Propose a semantic hunk (deep tier — `model: "fable"`)

Payload:
- **mode** (`consolidate` / `into-base` / `reconcile`) and the confirmed direction
  `<source> INTO <destination>`;
- **both INTENTs** from Phase 1, and **both PR bodies** (`gh pr view <branch>
  --json title,body`; "none" when there is no PR or no `gh`);
- the **diff3 hunk** with ~20 lines of context either side, plus the CLASS/WHY block;
- whether the run is **attended** or **unattended**.

Return:

```
HUNK:     <path> #<n>
SOURCE:   <what the source side does here and why>
DEST:     <what the destination side does here and why>
TAKE:     source | destination | both | rewrite
TEXT:     <the resolved lines, verbatim — required for every take>
WHY:      <why this keeps both intents, or which one it drops and why that is right>
```

## Second review (deep tier, a separate agent)

Required for **every semantic hunk in an unattended run**, and for **any hunk in
migrations, schema, auth or payments code** whether attended or not. Payload: the
Propose payload plus the proposal. The reviewer does not see the proposer's
reasoning as authority — it checks the TEXT against both sides. Return:

```
HUNK:     <path> #<n>
VERDICT:  agree | disagree
WHY:      <what the proposal keeps or loses from each side>
```

`disagree` → the hunk takes `destination`, its row is marked `flagged:` with both
WHY lines, and the report lists it. Attended runs show the verdict to the user next
to the proposal.

## Apply (main session)

The approved TEXT is written in by the main session — it already holds the hunk,
the proposal and the approval, and a fresh agent would have to be told all three.
Then confirm no markers remain (`git diff --check -- <path>`) and write the log row:

```
| <path> | #<n> lines <a>-<b> | trivial/semantic | take: <take> | <who classified> / <who decided> | <why> | assumed:/flagged: if any |
```

## Unexplained reconcile FAIL (Phase 4)

Deep tier diagnoses. Payload: the `FAIL` line, the merge-log rows for that path, the
diff3 hunk(s) from the merge commit, both INTENTs. Return:

```
FAIL:     <the line>
CAUSE:    <which resolution dropped it, or which later merge did>
FIX:      <the hunk text to restore, verbatim>
```

The build tier (`model: "opus"`) re-applies FIX, re-runs `reconcile`, and logs it.

## Null and timeout

An agent that returns nothing, returns something not in its format, or has not
returned within **15 minutes** (or the host's agent timeout, if shorter) is retried
**once** with the same payload. A second failure:
- **Classify** → the hunks it held are `semantic` (unsure = semantic).
- **Trivial resolve** → the hunk goes to Propose.
- **Propose / second review** → stop: `git merge --abort`, log the hunk and the
  failed dispatch, report.
- **Diagnose** → stop before the next merge, log the `FAIL` and the failed
  dispatch, report.

Never fall back to a side, and never let a cheaper tier decide a semantic hunk.
