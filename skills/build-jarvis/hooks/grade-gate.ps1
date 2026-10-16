# build-jarvis grade gate (A119) - Claude Code `PreToolUse`. Mirror of grade-gate.sh.
#   -Mode hook                  the event JSON on stdin; denies the tool call while
#                               build-jarvis is loaded and no `grade:` line has been
#                               printed as reply text since. Else nothing. Exit 0 always.
#   -Mode check -Path F         prints `deny` or `-` for a transcript file
#   -Mode selftest              prints `ok`, or exits 1
# Same rule and output bytes as the sh twin. Install: ../references/route-hook.md.
param([ValidateSet('hook','check','selftest')][string]$Mode = 'hook', [string]$Path = '')

$Reason = 'skillator grade gate (build-jarvis Step 0.7): print your one grade: line as reply text first - a line starting grade: that the user sees, not in thinking - then make this call again. If you already printed it in this message, just retry.'

# The sh twin's patterns, verbatim.
$PAsst  = '"type": ?"assistant"'
$PSkill = '"name": ?"Skill"'
$PJarv  = '"skill": ?"[^"]*build-jarvis"'
$PGrade = '"type": ?"text", ?"text": ?"(([^"\\]|\\.)*\\n)?grade:'

function Get-Verdict([string]$f) {
  try {
    # FileShare ReadWrite: Claude Code may be appending to the transcript.
    $fs = New-Object IO.FileStream($f, 'Open', 'Read', 'ReadWrite')
    $rd = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)
    $loaded = $false; $graded = $false
    try { while ($null -ne ($l = $rd.ReadLine())) {
      if ($l -cnotmatch $PAsst) { continue }
      if ($l -cmatch $PSkill -and $l -cmatch $PJarv) { $loaded = $true; $graded = $false; continue }
      if ($loaded -and $l -cmatch $PGrade) { $graded = $true }
    } } finally { $rd.Close() }
    if ($loaded -and -not $graded) { return 'deny' } else { return '-' }
  } catch { return '-' }
}

function Write-Lf([string]$s) { [Console]::Out.Write($s + "`n") }
function Get-Json { '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"' + $Reason + '"}}' }

function Invoke-Hook([string]$raw) {
  if (-not $raw) { return }
  try { $p = ($raw | ConvertFrom-Json -ErrorAction Stop).transcript_path } catch { return }
  if (-not $p) { return }
  if ((Get-Verdict $p) -eq 'deny') { Write-Lf (Get-Json) }
}

if ($Mode -eq 'check') { Write-Lf (Get-Verdict $Path); exit 0 }

if ($Mode -eq 'hook') {
  # UTF-8, not the console code page: a non-ASCII transcript path must survive.
  try { Invoke-Hook ((New-Object IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)).ReadToEnd()) } catch { }
  exit 0
}

# --- selftest ---
function Fail([string]$m) { [Console]::Error.WriteLine("FAIL: $m"); exit 1 }
$d = Join-Path ([IO.Path]::GetTempPath()) ("grade-gate-" + [guid]::NewGuid())
New-Item -ItemType Directory $d | Out-Null
$tf = Join-Path $d 't.jsonl'
function T([string[]]$lines) {
  [IO.File]::WriteAllText($tf, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
  Get-Verdict $tf
}
function Capture([string]$raw) {
  $sw = New-Object IO.StringWriter; $old = [Console]::Out; [Console]::SetOut($sw)
  try { Invoke-Hook $raw } finally { [Console]::SetOut($old) }
  $sw.ToString()
}
try {
  $load   = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"skillator:build-jarvis"}}]}}'
  $body   = '{"type":"user","message":{"content":[{"type":"text","text":"grade: bounded - the skill body example"}]}}'
  $think  = '{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"grade: bounded"}]}}'
  $narr   = '{"type":"assistant","message":{"content":[{"type":"text","text":"Let me look at the code first."}]}}'
  $first  = '{"type":"assistant","message":{"content":[{"type":"text","text":"grade: bounded 00b7 critical no"}]}}'
  $later  = '{"type":"assistant","message":{"content":[{"type":"text","text":"Loaded.\ngrade: small 00b7 critical no"}]}}'
  $quoted = '{"type":"assistant","message":{"content":[{"type":"text","text":"say \"x\" grade: later"}]}}'
  $decoy  = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Send","input":{"text":"grade: fake"}}]}}'
  $other  = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"skillator:tickets-zordon"}}]}}'
  if ((T @($other, $narr)) -ne '-') { Fail 'no build-jarvis load must allow' }
  if ((T @($load, $body)) -ne 'deny') { Fail "the skill body's example grade line counted" }
  if ((T @($load, $body, $think)) -ne 'deny') { Fail 'a grade in thinking counted' }
  if ((T @($load, $body, $narr)) -ne 'deny') { Fail 'narration counted as the grade' }
  if ((T @($load, $body, $quoted)) -ne 'deny') { Fail 'grade: mid-line counted' }
  if ((T @($load, $body, $decoy)) -ne 'deny') { Fail 'a tool input text field counted' }
  if ((T @($load, $body, $first)) -ne '-') { Fail 'a first-line grade did not allow' }
  if ((T @($load, $body, $later)) -ne '-') { Fail 'a grade on a later line did not allow' }
  if ((T @($load, $first, $load, $narr)) -ne 'deny') { Fail 'a reload did not reset the grade' }
  if ((Get-Verdict (Join-Path $d 'missing.jsonl')) -ne '-') { Fail 'a missing transcript must allow' }
  $null = T @($load, $narr)
  $jp = $tf -replace '\\', '\\'
  if ((Capture ('{"session_id":"s","transcript_path":"' + $jp + '","tool_name":"Write"}')) -cne ((Get-Json) + "`n")) { Fail 'hook: a backslash path did not deny' }
  $null = T @($load, $first)
  if ((Capture ('{"transcript_path":"' + $jp + '"}')) -ne '') { Fail 'hook: a graded session printed something' }
  if ((Capture 'not json') -ne '') { Fail 'hook: bad stdin must print nothing' }
  if ($Reason -match '["\\]') { Fail 'Reason holds a quote or backslash - it would break the JSON' }
  $bytes = [IO.File]::ReadAllBytes($PSCommandPath)
  if ($bytes | Where-Object { $_ -gt 127 }) { Fail "non-ASCII byte in $PSCommandPath" }
  if ($bytes -contains 13) { Fail "CR in $PSCommandPath" }
} finally { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
Write-Lf 'ok'
exit 0
