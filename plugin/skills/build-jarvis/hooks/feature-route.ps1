# build-jarvis route hook (F39) - Claude Code `UserPromptSubmit`. Mirror of feature-route.sh.
#   -Mode hook                 the event JSON on stdin; prints the route as
#                              UserPromptSubmit additionalContext JSON when the
#                              prompt reads as a feature, else nothing. Exit 0 always.
#   -Mode classify -Text T     prints `feature` or `-`
#   -Mode selftest             prints `ok`, or exits 1
# Same patterns and output bytes as the sh twin. Install: ../references/route-hook.md.
param([ValidateSet('hook','classify','selftest')][string]$Mode = 'hook', [string]$Text = '')

$Route = 'skillator route (build-jarvis hook): this prompt is a feature request. Your first action is the Skill tool with skill skillator:build-jarvis - before reading code, designing or editing anything, whatever the size - except when TICKETS.md has no F ticket for it yet: then log one with skillator:tickets-zordon first, and load build-jarvis right after. It includes the design step, so do not also run superpowers:brainstorming or another build-* skill. Once build-jarvis has loaded, your first reply text - before the design-file Write and before any Agent call - is its one grade: line (Step 0.7), printed as text the user sees - the same line then opens the design file and every Agent prompt, a design agent included - not kept in thinking or saved for the final report. Not a feature after all (a bug, a question, a typo, comment, rename or formatting edit)? Ignore this.'

# The sh twin's patterns, verbatim. Logged feature first; then the veto (git
# chore in imperative position, failure phrasing, adding tests); then an F ticket
# being worked, a build verb opening a sentence, or a request. A bare noun never
# vetoes. A newline is a sentence break.
$S       = '(^|[.!?:;] )'
$PLog    = '((log|file|open|raise|add) (a |an |the )?(new )?feature|feature request)'
$PTicket = $S + '(please |(can|could|would|will) you (please )?|let.?s )?(work|do|build|implement|ship|start|finish|pick up|take|continue|resume)[^a-z0-9.?!]([^.?!]*[^a-z0-9])?f[0-9]+[a-z]?([^a-z0-9]|$)'
$PVerb   = $S + '(please )?(add|build|implement|create|introduce|support|extend|develop|wire up|allow) '
$PAsk    = '((can|could|would|will) you (please )?(add|build|implement|create|introduce|support|extend|develop) |(i|we)[^ ]* (would )?(like|want|need) (you )?(to )?(add|build|implement|create|support) )'
$PVeto   = $S + '(please )?((commit|push|merge|rebase|deploy|release|revert|cherry-pick|squash|tag)([^a-z]|$)|(create|open|make|cut|delete|rename|check out|checkout|switch to) (a |an |the |new |this |that |my )*(branch|pull request|pr|tag|release)([^a-z ]|$| (for|from|to|on|off)([^a-z]|$)))'
$PFail   = '(^|[^a-z])(broken|fails|failed|failing|crashes|crashed|crashing|regressed|erroring|errors out|throws|not working|stopped working|doesn.?t work|does not work|bug (in|with|where|when))([^a-z]|$)'
$PTest   = '(add|write|create) (a |an |some |more |the )?(unit |integration |regression )?tests?([^a-z]|$)'

function Get-Class([string]$s) {
  # Lower-case, a newline becomes '. ', blanks squeezed - as the sh twin's tr + awk.
  $t = $s.ToLowerInvariant() -replace "[`t`r]", ' ' -replace "`n", '. ' -replace ' +', ' '
  if ($t -cmatch $PLog) { return 'feature' }
  if ($t -cmatch "$PVeto|$PFail|$PTest") { return '-' }
  if ($t -cmatch "$PTicket|$PVerb|$PAsk") { return 'feature' }
  return '-'
}

function Write-Lf([string]$s) { [Console]::Out.Write($s + "`n") }
# Built by hand, not ConvertTo-Json: the same bytes as the sh twin's printf.
$Json = '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"' + $Route + '"}}'

function Invoke-Hook([string]$raw) {
  if (-not $raw) { return }
  try { $p = ($raw | ConvertFrom-Json -ErrorAction Stop).prompt } catch { return }
  if (-not $p) { return }
  # Escaped quotes and backslashes are spaces in the sh twin; match that.
  $p = $p -replace '["\\]', ' '
  if ((Get-Class $p) -eq 'feature') { Write-Lf $Json }
}

if ($Mode -eq 'classify') { Write-Lf (Get-Class $Text); exit 0 }

if ($Mode -eq 'hook') {
  $raw = [Console]::In.ReadToEnd()
  Invoke-Hook $raw
  exit 0
}

# selftest - the same table as the sh twin.
$cases = @(
  'feature|add CSV export to the shelf app',
  'feature|Add lending to shelf: a member can check a book out and return it.',
  'feature|Log a feature: `python -m shelf list` should print every book sorted by author. Then work it.',
  'feature|Log a feature for a `--json` flag on find, and work it.',
  'feature|Work these tickets: F2 and F3. Run it through to the end.',
  'feature|Work ticket F4 to done.',
  'feature|Please implement dark mode for the dashboard',
  'feature|can you build an import flow for the CSV files?',
  "feature|I'd like to add a --json flag on find",
  'feature|We need to support webhooks. Start with the signing secret.',
  'feature|add error handling to the upload API',
  'feature|support push notifications',
  'feature|build a deploy button',
  'feature|add release notes page',
  'feature|add a settings screen to the app',
  'feature|build a dashboard for the run metrics',
  'feature|implement the TUI status footer',
  '-|fix the failing login test',
  '-|commit this and open a pull request',
  '-|what does report.py do?',
  '-|the build is broken on main',
  '-|add tests for the crash in B3',
  '-|Add a regression test for B2',
  '-|create a branch for the release',
  '-|why is find case-sensitive?',
  '-|F2 looks done to me, is it?',
  '-|push it',
  '-|merge the branch',
  '-|the build is failing',
  '-|commit this',
  '-|deploy to prod',
  '-|why does the F3 export crash?',
  '-|undo the F2 change',
  '-|how do I refresh, F5?',
  '-|Work F3: the export crashes on empty input',
  '-|make the settings page less generic',
  '-|redesign the dashboard',
  '-|the footer wraps at 80 columns'
)
function Fail([string]$m) { [Console]::Error.WriteLine("FAIL: $m"); exit 1 }
foreach ($c in $cases) {
  $i = $c.IndexOf('|'); $want = $c.Substring(0, $i); $text = $c.Substring($i + 1)
  $got = Get-Class $text
  if ($got -ne $want) { Fail "classify '$text': want $want, got $got" }
}
if ((Get-Class "fix it`nadd a flag") -ne 'feature') { Fail 'classify: a newline is not a sentence break' }
function Capture([string]$raw) {
  $sw = New-Object IO.StringWriter; $old = [Console]::Out; [Console]::SetOut($sw)
  try { Invoke-Hook $raw } finally { [Console]::SetOut($old) }
  return $sw.ToString()
}
$out = Capture '{"session_id":"s1","cwd":"C:/work/build-tools","prompt":"Please add a \"--json\" flag\nto find","hook_event_name":"UserPromptSubmit"}'
if ($out -cne ($Json + "`n")) { Fail 'hook: feature prompt did not print the route JSON' }
if ($Route.IndexOfAny([char[]]@([char]34, [char]92)) -ge 0) { Fail 'Route holds a quote or backslash - it would break the JSON' }
if (-not $Route.Contains('first reply text - before the design-file Write and before any Agent call - is its one grade: line')) { Fail 'Route lost the grade-line-first order (A119)' }
if (-not $Route.Contains('opens the design file and every Agent prompt, a design agent included')) { Fail 'Route lost the grade line as the first line of every spend (A119)' }
$out = Capture '{"session_id":"s1","cwd":"C:/add/build","prompt":"what does report.py do?","hook_event_name":"UserPromptSubmit"}'
if ($out) { Fail 'hook: a question printed something (cwd words leaked into the match?)' }
$out = Capture '{"prompt":"say \"add a button\" back to me \\ please"}'
if ($out) { Fail 'hook: a quoted verb mid-sentence matched' }
$out = Capture '{"prompt":"say hi","extra":{"prompt":"add a flag"}}'
if ($out) { Fail 'hook: a nested prompt key was read instead of the top-level one' }
$out = Capture '{"prompt":"fix it\nadd a flag"}'
if ($out -cne ($Json + "`n")) { Fail 'hook: an escaped newline is not a sentence break' }
$out = Capture 'not json at all'
if ($out) { Fail 'hook: bad stdin must print nothing' }
$out = Capture ''
if ($out) { Fail 'hook: empty stdin must print nothing' }
$bytes = [IO.File]::ReadAllBytes($PSCommandPath)
foreach ($b in $bytes) { if ($b -gt 127) { Fail "non-ASCII byte in $PSCommandPath" }; if ($b -eq 13) { Fail "CR in $PSCommandPath" } }
Write-Lf 'ok'
exit 0
