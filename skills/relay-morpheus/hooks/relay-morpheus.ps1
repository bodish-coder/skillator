# relay - bookkeeping for `.skillator/run.md`, the staged-run ledger.
#
# The PowerShell mirror of relay-morpheus.sh. Same commands, same file format, same
# refusals - `PLATFORMS.md` requires the pair to move together, and `selftest`
# on each side is what proves they still agree.
#
#   relay-morpheus.ps1 -Mode list                      every run + how to resume it
#   relay-morpheus.ps1 -Mode resume -Id 3              what a fresh session needs
#   relay-morpheus.ps1 -Mode init -Plan <p> -Title <t> -Stages "alpha,beta,gamma"
#   relay-morpheus.ps1 -Mode add -Title <stage>        append a row, print its number
#   relay-morpheus.ps1 -Mode stage -N 2 -State '~' [-Owner build:sonnet] [-Landed sha]
#   relay-morpheus.ps1 -Mode heartbeat -N 2
#   relay-morpheus.ps1 -Mode status
#   relay-morpheus.ps1 -Mode orphans [-Minutes 20]
#   relay-morpheus.ps1 -Mode selftest
#
# Chain (F31) - stages that are ticket workflows, each started by the last:
#   -Mode chain -Action plan -N <n> -PromptFile F [-Tickets T] [-Fix t -Verify t] [-Files F] [-ChainMode workflow|agents]
#   -Mode chain -Action dispatch -N <n> -Driver @tag [-Owner O] [-Take] [-Override] [-Confirmed]
#   -Mode chain -Action hold -Pct 84 [-Window 5h|7d] [-Next n]
#   -Mode chain -Action release [-Override [-Confirmed]]
#   -Mode chain -Action wait [-Interval 600] [-Max 19800] [-For 1500]
#   -Mode chain -Action status | decide
# Exit 2 = refused by a usage/driver/state guard; wait: 0 RELEASE, 2 STOP (the
# 7-day stop - nothing to wait for), 3 STUCK, 4 UNOBSERVABLE, 5 WAITING
# (re-arm). $env:RELAY_CHAIN_HOLD_PCT (80),
# RELAY_CHAIN_WEEKLY_PCT (90), RELAY_CHAIN_DRIVER_STALE (20 min),
# RELAY_LEVEL_CMD (replaces `usage-watch.ps1 -Mode level`, for tests).
#
# Any mode takes an optional -Id: `-Mode status -Id 3`.
#
# States: pending | '~' in flight | 'x' landed | '!' failed
#
# RUN ids and stage numbers are serial across the whole project, not per run
# (F22): they come from practice/scripts/next-id.ps1 (kinds RUN and S), which
# also reads every run file in the tree and on every ref. $env:RELAY_NEXT_ID
# overrides where that script is looked for.
#
# Two `-File` facts shape this signature, because `-File` is how this repo
# invokes every PS hook: it passes each argument as ONE literal string, so
# -Stages takes a delimited string and splits it here rather than relying on
# PowerShell array binding; and it drops empty-string arguments, so the pending
# state is spelled `pending` rather than ''.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('init','add','stage','heartbeat','status','orphans','list','resume','chain','selftest')][string]$Mode,
  [ValidateSet('plan','dispatch','hold','release','wait','status','decide')][string]$Action = 'status',
  [string]$PromptFile = '',
  [string]$Tickets = '',
  [string]$Files = '',
  [string]$Fix = '',
  [string]$Verify = '',
  [string]$ChainMode = 'workflow',
  [string]$Driver = '',
  [switch]$Take,
  [switch]$Confirmed,
  [switch]$Override,
  [string]$Pct = '',
  [string]$Window = '5h',
  [string]$Next = '',
  [int]$Interval = 600,
  [int]$Max = 19800,
  [int]$For = 1500,
  [string]$Plan,
  [string]$Title,
  [string]$Stages,
  [int]$N,
  [string]$State = 'pending',
  [string]$Owner = '',
  [string]$Landed = '',
  [int]$Minutes = 20,
  [string]$Run = '',
  [string]$Id = '',
  [string]$Dir = ''
)

$ErrorActionPreference = 'Stop'
if (-not $Dir) { $Dir = if ($env:RELAY_DIR) { $env:RELAY_DIR } else { '.skillator' } }
if (-not $Run -and $env:RELAY_RUN) { $Run = $env:RELAY_RUN }

# A run id is a short number a human can say out loud to another session -
# "continue RUN-3". The timestamp ids this replaces were unsayable, which made
# handing a run over a copy-paste of a path instead of a sentence.
function RunFiles {
  if (-not (Test-Path $Dir)) { return @() }
  @(Get-ChildItem $Dir -Filter 'run*.md' -File -ErrorAction SilentlyContinue | Sort-Object Name)
}
# The id out of a filename, with no regex to get wrong.
function IdOf($path) {
  $b = [IO.Path]::GetFileNameWithoutExtension($path)
  if (-not $b.StartsWith('run-')) { return '' }
  $b = $b.Substring(4).Split('-')[0]
  if ($b -match '^\d+$') { return $b }
  return ''
}
function NextId {
  $n = 0
  foreach ($f in RunFiles) { $i = IdOf $f.Name; if ($i -and [int]$i -gt $n) { $n = [int]$i } }
  $n + 1
}
# Numbers used to be local: RUN = 1 + the highest run file here, stages 1..n
# per run. Two worktrees both made RUN-4, and every run had a stage 1. The F21
# allocator fixes both - it ships beside the skills (installed:
# <skills>\practice\, a clone or plugin: <root>\practice\), and without it the
# local rule still works, said on stderr.
function FindNextId {
  if ($null -ne $env:RELAY_NEXT_ID) {
    if ($env:RELAY_NEXT_ID -and (Test-Path -LiteralPath $env:RELAY_NEXT_ID -PathType Leaf)) { return $env:RELAY_NEXT_ID }
    return $null
  }
  foreach ($c in @((Join-Path $PSScriptRoot '..\..\practice\scripts\next-id.ps1'),
                   (Join-Path $PSScriptRoot '..\..\..\practice\scripts\next-id.ps1'))) {
    if (Test-Path -LiteralPath $c -PathType Leaf) { return (Resolve-Path -LiteralPath $c).Path }
  }
  $null
}
function MaxStage($dir) {
  $m = 0
  foreach ($f in @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'run-*.md' -or $_.Name -eq 'run.md' })) {
    foreach ($l in [IO.File]::ReadAllLines($f.FullName)) { $r = RowNum $l; if ($null -ne $r -and $r -gt $m) { $m = $r } }
  }
  $m
}
# $count fresh numbers of $kind (RUN or S), for run files in $dir.
function Alloc($kind, $count, $dir) {
  $nid = FindNextId
  if ($nid) {
    $out = @(& $nid -Runs $dir -Count "$count" $kind)
    # Judged by its output, not $LASTEXITCODE: in-process, that holds whatever
    # git call ran last (git grep exits 1 on no match).
    if ($out.Count -ne $count -or ($out | Where-Object { "$_" -notmatch '^\s*\d+\s*$' })) { Die "next-id.ps1 could not allocate $kind (see above)" }
    return @($out | ForEach-Object { [int]"$_".Trim() })
  }
  [Console]::Error.WriteLine("relay-morpheus.ps1: next-id.ps1 not found - numbering $kind from this directory only, which another worktree can repeat")
  $saved = $script:Dir; $script:Dir = $dir
  try { if ($kind -eq 'RUN') { $m = (NextId) - 1 } else { $m = MaxStage $dir } } finally { $script:Dir = $saved }
  @(($m + 1)..($m + $count))
}

# RUN-3, run-3, 3 and a path all resolve to the same file, because whoever
# types it next is working from memory of a conversation.
function Resolve-Run($spec) {
  if ($spec -match '[\/]' -and (Test-Path $spec)) { return (Resolve-Path $spec).Path }
  $n = ($spec -replace '\D', '')
  if (-not $n) { return $null }
  foreach ($f in RunFiles) { if ((IdOf $f.Name) -eq $n) { return $f.FullName } }
  $null
}
# With no id given, fall back to the one run if there is exactly one. Two or
# more and this refuses rather than guessing which.
function PickRun {
  if ($script:Run) { return }
  $all = RunFiles
  if ($all.Count -gt 1) { Die "$($all.Count) runs here - name one (-Id 3), or see: -Mode list" }
  $script:Run = if ($all.Count -eq 1) { $all[0].FullName } else { Join-Path $Dir 'run.md' }
}
function Slug($t) {
  (($t.ToLower() -replace '[^a-z0-9]+', '-').Trim('-').Split('-') | Where-Object { $_ } | Select-Object -First 4) -join '-'
}

# Every timestamp is UTC and invariant-culture. Without this, a machine whose
# default calendar is not Gregorian (th-TH Buddhist, ar-SA Hijri) writes 2569
# for `yyyy`, and a run file touched by both mirrors mixes eras - which makes
# relay-morpheus.sh's age arithmetic return nonsense rather than fail.
$INV = [cultureinfo]::InvariantCulture
$FMT = "yyyy-MM-ddTHH:mmZ"

function Die($m) { throw "FAIL: $m" }
function Now { (Get-Date).ToUniversalTime().ToString($FMT, $INV) }
function AsUtc($s) { [datetime]::ParseExact($s, $FMT, $INV) }
function NeedRun { PickRun; if (-not (Test-Path $Run)) { Die "no run file at $Run (relay-morpheus.ps1 -Mode init ...)" } }

# Every mutation is a read-modify-write of the whole file, and SKILL.md
# sanctions concurrent in-flight stages - two `stage` calls landing at once
# would lose one row, which is the loss this whole skill exists to prevent.
# Creating a directory is the portable atomic test-and-set, same as the sh
# twin. ponytail: a spin with a stale timeout, not a lock manager.
$script:Lock = $null
# The lock dir carries its holder's pid. Breaking a stale lock without checking
# it let B delete a slow-but-alive A's lock, and A's release then deleted B's -
# admitting C mid-write, which is the lost update the lock exists to prevent.
function LockPid { try { (Get-Content (Join-Path $script:Lock 'pid') -Raw -ErrorAction Stop).Trim() } catch { '' } }
function Lock {
  $script:Lock = "$Run.lock"
  try { New-Item -ItemType Directory -Path $script:Lock -ErrorAction Stop | Out-Null
        Set-Content (Join-Path $script:Lock 'pid') "$PID"; return } catch {}
  $held = LockPid
  for ($i = 0; ; $i++) {
    try { New-Item -ItemType Directory -Path $script:Lock -ErrorAction Stop | Out-Null
          Set-Content (Join-Path $script:Lock 'pid') "$PID"; return } catch {}
    # 30s of ONE holder's turn means that process died holding it. Break it
    # only if the pid has not changed since we arrived.
    if ($i -gt 300 -and (LockPid) -eq $held) { Remove-Item -Recurse -Force $script:Lock -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 100
  }
}
function Unlock {
  if ($script:Lock -and (LockPid) -eq "$PID") { Remove-Item -Recurse -Force $script:Lock -ErrorAction SilentlyContinue }
  $script:Lock = $null
}

# LF, no BOM, written to a sibling temp then moved - matching relay-morpheus.sh's
# tmp+mv. Set-Content would truncate in place, so a Ctrl-C or a usage stop
# between truncate and write leaves the ledger empty, destroying the only
# record of what was in flight. `-Encoding utf8` on 5.1 also emits a BOM, which
# would make every cross-mirror edit rewrite all lines in the diff.
function WriteRun($lines) {
  $tmp = "$Run.tmp.$PID"
  [IO.File]::WriteAllText($tmp, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
  Move-Item -Force -Path $tmp -Destination $Run
}

function StampUpdated {
  $t = Now
  WriteRun (Get-Content $Run | ForEach-Object {
    if ($_ -match '^started: ') { $_ -replace 'updated: .*', "updated: $t" } else { $_ }
  })
}

function RowNum($line) {
  if ($line -match '^\|\s*(\d+)\s*\|') { return [int]$Matches[1] }
  return $null
}

function Cell($line, $i) { ($line -split '\|')[$i].Trim() }

function DoInit {
  if (-not $Plan -or -not $Title -or -not $Stages) {
    Die 'usage: -Mode init -Plan <p> -Title <t> -Stages "alpha,beta"'
  }
  $names = @($Stages -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (-not $names) { Die "no stage names in -Stages" }
  # A `|` in a stage name adds a column, and every later read is positional -
  # the state would land in the name cell and the sha in heartbeat, silently.
  # Checked before any number is reserved.
  foreach ($nm in $names) { if ($nm -match '\|') { Die "stage name contains '|', which would shift every column: $nm" } }
  if (-not $script:Run) {
    if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Force $Dir | Out-Null }
    $script:id = (Alloc 'RUN' 1 $Dir)[0]
    $script:Run = Join-Path $Dir ("run-{0}-{1}.md" -f $script:id, (Slug $Title))
  } else {
    $script:id = IdOf $script:Run; if (-not $script:id) { $script:id = '1' }
  }
  if (Test-Path $Run) { Die "run file already exists: $Run (a run file is never overwritten)" }
  $dir = Split-Path -Parent $Run
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  # Stage numbers continue after the highest any run has used, so "stage 24"
  # names one stage in the whole project, not one per run.
  if (-not $dir) { $dir = '.' }
  $nums = Alloc 'S' $names.Count $dir
  $t = Now
  $id = $script:id
  $lines = @("# RUN-$id - $Title", "plan: $Plan", "started: $t   updated: $t", "",
             "## Stages", "| # | stage | state | owner | heartbeat | landed |",
             "|---|-------|-------|-------|-----------|--------|")
  for ($i = 0; $i -lt $names.Count; $i++) { $lines += "| $($nums[$i]) | $($names[$i]) |   | - | - | - |" }
  $lines += @("", "## In flight", "", "## Rulings")
  WriteRun $lines
  $Run
  # The whole point of the id: this line is what gets pasted into another
  # session, or said out loud. A path is not a sentence.
  "hand this to any session:  continue RUN-$id"
}

# A stage found mid-run gets its row the same way init's did: the next serial
# number, after the last row. Printed so the caller can say -Mode stage -N <n>.
function DoAdd($name) {
  if (-not $name) { Die 'usage: -Mode add -Title <stage>' }
  if ($name -match '\|') { Die "stage name contains '|', which would shift every column: $name" }
  NeedRun
  $dir = Split-Path -Parent $Run; if (-not $dir) { $dir = '.' }
  $n = (Alloc 'S' 1 $dir)[0]
  Lock
  try {
    $lines = @(Get-Content $Run)
    # After the last table row of `## Stages`; the separator row counts, so an
    # empty table still takes its first row in the right place.
    $on = $false; $last = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match '^## Stages') { $on = $true; continue }
      if ($on -and $lines[$i] -match '^## ') { $on = $false }
      if ($on -and $lines[$i] -match '^\|') { $last = $i }
    }
    if ($last -lt 0) { Die "no stage table in $Run" }
    $out = @($lines[0..$last]) + @("| $n | $name |   | - | - | - |")
    if ($last + 1 -lt $lines.Count) { $out += $lines[($last + 1)..($lines.Count - 1)] }
    WriteRun $out
    StampUpdated
  } finally { Unlock }
  "$n"
}

# One line per run, with the sentence that resumes it.
function DoList {
  $all = RunFiles
  if (-not $all) { "no runs in $Dir"; return }
  foreach ($f in $all) {
    $id = IdOf $f.Name; if (-not $id) { $id = '?' }
    $lines = Get-Content $f.FullName
    $title = ($lines[0] -replace '^# RUN[-a-zA-Z0-9]* *- *', '')
    $plan  = ($lines[1] -replace '^plan: *', '')
    $tot = 0; $dn = 0; $open = @()
    foreach ($l in $lines) {
      $n = RowNum $l
      if ($null -ne $n) {
        $tot++
        $st = Cell $l 3
        if ($st -eq 'x') { $dn++ }
        if ($st -eq '~' -or $st -eq '!') { $open += $n }
      }
    }
    $row = "RUN-{0}  {1,-42}  {2}/{3} done" -f $id, $title, $dn, $tot
    if ($open) { $row += "  (stage $($open -join ',') open)" }
    $row
    "          plan: $plan"
    "          resume: continue RUN-$id"
  }
}

# Everything a session that has never seen this work needs, in one paste.
function DoResume($spec) {
  if (-not $spec) { Die "usage: -Mode resume -Id <id>" }
  $f = Resolve-Run $spec
  if (-not $f) { Die "no run matching '$spec' - see: -Mode list" }
  "# Resuming $f"
  "# Read the plan named below, then the ledger, then start at the first stage"
  "# that is not x. The In-flight block holds the exact prompt to redispatch"
  "# anything that was running."
  ""
  Get-Content $f
}

# Keyed by stage number, so a redispatch rewrites its row instead of appending
# a second one - that is what makes a resume idempotent.
function DoStage($n, $state, $owner, $landed) {
  if (-not $n) { Die "usage: -Mode stage -N <n> -State <s> [-Owner o] [-Landed l]" }
  if ($state -eq 'pending') { $state = '' }
  if ($state -notin @('', '~', 'x', '!')) { Die "unknown state: $state (one of pending ~ x !)" }
  # Same reason `init` refuses it in a stage name: a `|` adds a column, and the
  # next positional read writes state into the wrong cell. `landed` takes a
  # path, so this is reachable without an exotic owner string.
  foreach ($v in @($owner, $landed)) { if ($v -match '\|') { Die "'|' in owner/landed would shift every column: $v" } }
  if ($state -eq 'x' -and -not $landed) {
    Die "stage $n marked landed with no sha or path - that is the lie the next session believes"
  }
  NeedRun
  Lock
  try {
    if (-not (SetRow $n $state $owner $landed)) { Die "no stage $n in $Run" }
    StampUpdated
  } finally { Unlock }
}

# Rewrite row <n>'s state/owner/heartbeat/landed ('' state = pending). The
# caller holds the lock; $false when there is no such row.
function SetRow($n, $state, $owner, $landed) {
  $t = Now
  $found = $false
  $out = foreach ($l in @(Get-Content $Run)) {
    if ((RowNum $l) -eq [int]$n) {
      $found = $true
      $c = $l -split '\|'
      $c[3] = " $(if ($state -eq '') { ' ' } else { $state }) "
      if ($owner)  { $c[4] = " $owner " }
      $c[5] = " $t "
      if ($landed) { $c[6] = " $landed " }
      ($c -join '|')
    } else { $l }
  }
  if (-not $found) { return $false }
  WriteRun $out
  $true
}

# A heartbeat carries the row's existing `landed` back in. Without it the
# "x with no sha" guard fires on a stage that already landed, turning a no-op
# bookkeeping call from a late-reporting agent into a hard error.
function DoHeartbeat($n) {
  if (-not $n) { Die "usage: -Mode heartbeat -N <n> [-Driver TAG]" }
  NeedRun
  $st = $null; $la = ''
  Get-Content $Run | ForEach-Object {
    if ((RowNum $_) -eq $n) {
      $st = Cell $_ 3
      $la = Cell $_ 6
      if ($la -eq '-') { $la = '' }
    }
  }
  if ($null -eq $st) { Die "no stage $n in $Run" }
  if ($st -eq '') { $st = 'pending' }
  DoStage $n $st '' $la
  # F31: the driver's own heartbeat keeps its stamp fresh - a live driver in a
  # 40-minute stage is not stale. Anyone else's leaves the stamp alone.
  if (IsMe) { Lock; try { TouchDriver; StampUpdated } finally { Unlock } }
}

function DoStatus {
  PickRun
  if (-not (Test-Path $Run)) { return }
  $on = $false
  Get-Content $Run | ForEach-Object {
    if ($_ -match '^## Stages')        { $on = $true }
    elseif ($_ -match '^## In flight') { $on = $false }
    if ($on) { $_ }
  }
}

# The network-loss list: in-flight rows nobody has heard from. A dropped agent
# sends no error, it just stops reporting, so silence is the only signal.
function DoOrphans($limit) {
  PickRun
  if (-not (Test-Path $Run)) { return }
  $t = AsUtc (Now)
  $any = $false
  Get-Content $Run | ForEach-Object {
    $n = RowNum $_
    if (($null -ne $n) -and ((Cell $_ 3) -eq '~')) {
      $any = $true
      $name = Cell $_ 2; $hb = Cell $_ 5
      if ($hb -eq '-') { "stage $n ($name): in flight, never reported" }
      else {
        $a = [int]($t - (AsUtc $hb)).TotalMinutes
        if ($a -ge $limit) { "stage $n ($name): silent ${a}m (limit ${limit}m) - redispatch from its In-flight block" }
      }
    }
  }
  if (-not $any) { "no stages in flight" }
}

# ------------------------------------------------------------------ chain ----
# F31: a chain is a run whose stages are ticket workflows, each started by the
# last one's completion. Same `## Chain` section, same refusals, same exit
# codes as relay-morpheus.sh, which carries the full reasoning:
#
#   ## Chain
#   driver: @cc-680768 2026-10-09T19:02Z     hold: -     mode: workflow
#   ### AAQ7 - stage 66 - A110+A112 code-yoda absorb
#   tickets: A110 deep/build . A112 deep/build
#   prompt: |
#     <the exact prompt, verbatim>
#
# `hold:` is `-` or `<since> <pct>% <5h|7d> next=<stage>`. The one decision is
# ChainDecide (hold or release on a `level` reading), mutation-checked by the
# selftest.
$HOLD_PCT = if ($env:RELAY_CHAIN_HOLD_PCT) { [double]$env:RELAY_CHAIN_HOLD_PCT } else { 80 }
$WEEKLY_PCT = if ($env:RELAY_CHAIN_WEEKLY_PCT) { [double]$env:RELAY_CHAIN_WEEKLY_PCT } else { 90 }
$DRIVER_STALE = if ($env:RELAY_CHAIN_DRIVER_STALE) { [int]$env:RELAY_CHAIN_DRIVER_STALE } else { 20 }
$SEP = '     '

# Refusals by a usage/driver/state guard exit 2 (the main catch maps them).
function Refuse($m) { throw "REFUSED: $m" }

# One `level` line from watch-cortana ($env:RELAY_LEVEL_CMD overrides, for
# tests). Anything that is not a level line reads as unobservable, never 0%.
function LevelLine {
  $out = @()
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    if ($env:RELAY_LEVEL_CMD) { $out = @(Invoke-Expression $env:RELAY_LEVEL_CMD 2>$null | ForEach-Object { "$_" }) }
    else {
      foreach ($c in @((Join-Path $PSScriptRoot '..\..\watch-cortana\hooks\usage-watch.ps1'),
                       (Join-Path $PSScriptRoot '..\..\..\skills\watch-cortana\hooks\usage-watch.ps1'))) {
        if (Test-Path -LiteralPath $c -PathType Leaf) {
          $out = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $c -Mode level 2>$null | ForEach-Object { "$_" }); break
        }
      }
    }
  } catch { $out = @() } finally { $ErrorActionPreference = $prev }
  $l = $out | Where-Object { $_ -match '^src=' } | Select-Object -First 1
  if (-not $l -and (($out -join ' ') -match '^src=')) { $l = $out -join ' ' }
  if (-not $l) { $l = 'src=none 5h=- 7d=- ctx=- max=-' }
  "$l".Trim()
}

# One window's token as a percentage string, a trailing % dropped; $null for
# '-', empty or anything that is not a number - that window is unobservable,
# and a reading never throws.
function ChainPct($x) {
  $t = "$x" -replace '%$', ''; $num = 0.0
  if ($t -match '^[0-9]+(\.[0-9]+)?$' -and [double]::TryParse($t, [Globalization.NumberStyles]::Float, $INV, [ref]$num)) { return $t }
  $null
}
# The hold/release decision. In: a level line. Out: 'RELEASE <pct>',
# 'HOLD <pct>' / 'HOLD <pct> 7d', or 'UNOBSERVABLE'. The 7-day hard stop first;
# then the 5-hour reading. With no 5-hour reading the 7-day one stands in, at
# the 5-hour threshold, and a hold on it is a 7-day hold ('HOLD <pct> 7d'):
# that window does not refill in hours. Never `max` and never ctx: a full
# context is a compaction, not a quota. Neither window -> UNOBSERVABLE.
function ChainDecide($line) {
  $v = @{}
  foreach ($kv in ("$line" -split ' ')) { $p = $kv.Split('=', 2); if ($p.Count -eq 2) { $v[$p[0]] = $p[1] } }
  if (-not $v['src'] -or $v['src'] -eq 'none') { return 'UNOBSERVABLE' }
  $wk = ChainPct $v['7d']; $h = ChainPct $v['5h']
  if ($null -ne $wk -and [double]::Parse($wk, $INV) -ge $WEEKLY_PCT) { return "HOLD $wk 7d" }
  if ($null -eq $h) {
    if ($null -eq $wk) { return 'UNOBSERVABLE' }
    if ([double]::Parse($wk, $INV) -ge $HOLD_PCT) { return "HOLD $wk 7d" }
    return "RELEASE $wk"
  }
  if ([double]::Parse($h, $INV) -ge $HOLD_PCT) { return "HOLD $h" }
  "RELEASE $h"
}

function ChainHdr {
  $on = $false
  foreach ($l in @(Get-Content $Run)) {
    if ($l -ceq '## Chain') { $on = $true; continue }
    if ($on -and $l -match '^driver: ') { return $l }
  }
  $null
}
# @(driver, hold, mode) out of a readable header line, else $null. The driver
# cell is '-' or '<tag> <YYYY-MM-DDTHH:MMZ>': a tag with no stamp has no age.
function HdrSplit($l) {
  if ("$l" -notmatch '^driver: (.*?)     hold: (.*?)     mode: (.*)$') { return $null }
  $p = @($Matches[1], $Matches[2], $Matches[3])
  if ($p[0] -ne '-' -and $p[0] -cnotmatch '^\S+ \d{4}-\d\d-\d\dT\d\d:\d\dZ$') { return $null }
  $p
}
# @(driver, hold, mode) out of the header line, or $null with no chain.
function HdrParts {
  $l = ChainHdr
  if (-not $l) { return $null }
  $p = HdrSplit $l
  if (-not $p) { Die "unreadable Chain header in ${Run}: $l" }
  $p
}
# The caller's tag: -Driver on heartbeat, hold, release and wait, else
# RELAY_CHAIN_DRIVER. Only the driver's own call refreshes its stamp, so a live
# driver in a long stage or a long hold never reads as stale at 20 minutes,
# while a dead driver's stamp still ages when another session resumes the run.
# A header that is not readable (HdrSplit) is never "me": left alone.
function Me { if ($Driver) { $Driver } else { "$env:RELAY_CHAIN_DRIVER" } }
function IsMe {
  $l = ChainHdr; $me = Me
  if (-not $l -or -not $me) { return $false }
  $p = HdrSplit $l
  if ($p) { return ($p[0] -ne '-' -and $p[0].Split(' ')[0] -ceq $me) }
  $false
}
# The driver cell to write back: refreshed for the driver, unchanged otherwise.
function OwnDriver { if (IsMe) { "$(Me) $(Now)" } else { (HdrParts)[0] } }
# The caller holds the lock.
function TouchDriver { if (IsMe) { $hp = HdrParts; SetHdr "$(Me) $(Now)" $hp[1] $hp[2] } }

# Rewrite the header line in place. The caller holds the lock.
function SetHdr($drv, $hold, $mode) {
  $on = $false; $done = $false
  $out = foreach ($l in @(Get-Content $Run)) {
    if ($l -ceq '## Chain') { $on = $true }
    if ($on -and -not $done -and $l -match '^driver: ') { $done = $true; "driver: $drv${SEP}hold: $hold${SEP}mode: $mode" } else { $l }
  }
  WriteRun $out
}

function RowCellN($n, $i) {
  foreach ($l in @(Get-Content $Run)) { if ((RowNum $l) -eq [int]$n) { return (Cell $l $i) } }
  $null
}
function CodeOf($n) {
  foreach ($l in @(Get-Content $Run)) { if ($l -cmatch "^### ([A-Z0-9]{4}) - stage $n - ") { return $Matches[1] } }
  $null
}
# The prompt of stage <n>'s chain block, verbatim: the lines under
# `prompt: |` up to the next heading, two-space indent removed, trailing
# blanks dropped. One string, lines joined by LF.
function BlockPrompt($n) {
  $inb = $false; $inp = $false; $buf = New-Object System.Collections.Generic.List[string]
  foreach ($l in @(Get-Content $Run)) {
    if (-not $inb) { if ($l -cmatch "^### [A-Z0-9]{4} - stage $n - ") { $inb = $true }; continue }
    if ($l -match '^#') { break }
    if (-not $inp) { if ($l -ceq 'prompt: |') { $inp = $true }; continue }
    $buf.Add(($l -replace '^  ', ''))
  }
  while ($buf.Count -gt 0 -and $buf[$buf.Count - 1] -eq '') { $buf.RemoveAt($buf.Count - 1) }
  $buf -join "`n"
}
function FirstOpenRow {
  foreach ($l in @(Get-Content $Run)) {
    $n = RowNum $l
    if ($null -ne $n -and (Cell $l 3) -in @('', '!')) { return $n }
  }
  $null
}
function Indent($text) { @("$text" -split "`n" | ForEach-Object { if ($_ -eq '') { '' } else { "  $_" } }) }

# Remove stage <n>'s block from `## In flight`: its `### stage <n> - ` line up
# to the next heading. A redispatch of a failed stage replaces its block - a
# second block beside the first left two prompts and a dead `run:` id, and a
# resume read the first one.
function DropInFlight($n) {
  $sec = $false; $skip = $false
  $out = foreach ($l in @(Get-Content $Run)) {
    if ($l -match '^## ') { $sec = ($l -ceq '## In flight') }
    if ($skip -and $l -match '^#') { $skip = $false }
    if ($sec -and $l.StartsWith("### stage $n - ")) { $skip = $true; continue }
    if (-not $skip) { $l }
  }
  WriteRun $out
}

# Append a line at the end of `## Rulings` (made at the end if missing).
function AddRuling($text) {
  $r = "- $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd', $INV)) - $text"
  $lines = @(Get-Content $Run); $on = $false; $last = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^## Rulings') { $on = $true; $last = $i; continue }
    if ($on -and $lines[$i] -match '^## ') { $on = $false }
    if ($on -and $lines[$i] -ne '') { $last = $i }
  }
  if ($last -lt 0) { WriteRun ($lines + @('', '## Rulings', $r)); return }
  $out = @($lines[0..$last]) + @($r)
  if ($last + 1 -lt $lines.Count) { $out += $lines[($last + 1)..($lines.Count - 1)] }
  WriteRun $out
}

# Put the lines $blk at the end of section `## $sec` (before its trailing
# blank lines). A missing section is made before `## Rulings`, or at the end,
# starting with line $first.
function PutInSection($sec, [string[]]$blk, $first) {
  $lines = @(Get-Content $Run); $h = "## $sec"
  $s = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -ceq $h) { $s = $i; break } }
  if ($s -ge 0) {
    $e = $lines.Count
    for ($i = $s + 1; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^## ') { $e = $i; break } }
    $k = $e - 1; while ($k -gt $s -and $lines[$k] -eq '') { $k-- }
    $out = @($lines[0..$k]) + $blk
    if ($e -lt $lines.Count) { $out += ''; $out += $lines[$e..($lines.Count - 1)] }
  } else {
    $new = @($h); if ($first) { $new += $first }; $new += $blk
    $r = -1; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^## Rulings') { $r = $i; break } }
    if ($r -gt 0) { $out = @($lines[0..($r - 1)]) + $new + @('') + @($lines[$r..($lines.Count - 1)]) }
    elseif ($r -eq 0) { $out = $new + @('') + $lines }
    else { $out = $lines + @('') + $new }
  }
  WriteRun $out
}

# W codes come from the F21 allocator, like RUN and S. Without it: the highest
# header in this directory + 1, said on stderr - another worktree can repeat it.
function AllocCode($dir) {
  $nid = FindNextId
  if ($nid) {
    # Exhaustion is a refusal (exit 2) on both paths. next-id.ps1 says it with
    # exit 1, the code it gives any failure, so its stderr tells them apart.
    $sw = New-Object IO.StringWriter; $olderr = [Console]::Error; [Console]::SetError($sw)
    try { $out = @(& $nid -Runs $dir W) } finally { [Console]::SetError($olderr); $err = $sw.ToString(); if ($err) { [Console]::Error.Write($err) } }
    if ($err -match 'kind W exhausted') { Refuse "kind W exhausted (next-id.ps1) - no workflow code is left to issue" }
    if ($out.Count -ne 1 -or "$($out[0])" -cnotmatch '^[A-Z0-9]{4}$') { Die "next-id.ps1 could not allocate a W code (see above)" }
    return "$($out[0])"
  }
  [Console]::Error.WriteLine("relay-morpheus.ps1: next-id.ps1 not found - coding from this directory only, which another worktree can repeat")
  $abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; $m = 0
  foreach ($f in @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'run-*.md' -or $_.Name -eq 'run.md' })) {
    foreach ($l in [IO.File]::ReadAllLines($f.FullName)) {
      if ($l -cmatch '^### ([A-Z0-9]{4}) [^ ]+ stage [0-9]') {
        $x = 0; foreach ($ch in $Matches[1].ToCharArray()) { $x = $x * 36 + $abc.IndexOf($ch) }
        if ($x -gt $m) { $m = $x }
      }
    }
  }
  # Past 9999 is refused, as next-id refuses it - wrapping to AAAA would
  # reissue the oldest code in the tree.
  $n = $m + 1; $c = ''
  if ($n -gt 1679615) { Refuse "kind W exhausted: $n > 1679615 (9999)" }
  for ($i = 0; $i -lt 4; $i++) { $c = $abc.Substring($n % 36, 1) + $c; $n = [math]::Floor($n / 36) }
  $c
}

function DoChainPlan($n) {
  if (-not $n) { Die 'usage: -Mode chain -Action plan -N <n> -PromptFile F [-Tickets T] [-Fix t -Verify t] [-Files F] [-ChainMode workflow|agents]' }
  if (-not $PromptFile -or -not (Test-Path -LiteralPath $PromptFile -PathType Leaf) -or (Get-Item -LiteralPath $PromptFile).Length -eq 0) {
    Die "chain plan: -PromptFile with the stage's exact prompt is required - the prompt is on disk before the agent exists"
  }
  if ($ChainMode -notin @('workflow', 'agents')) { Die "chain plan: -ChainMode is workflow or agents, not $ChainMode" }
  NeedRun
  $tk = $Tickets
  if ($Fix) {
    $vf = if ($Verify) { $Verify } else { 'build' }
    $tk = (@($Tickets -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) | ForEach-Object { "$_ $Fix/$vf" }) -join ' . '
  }
  $text = ([IO.File]::ReadAllText((Resolve-Path -LiteralPath $PromptFile).Path) -replace "`r", '') -replace "`n$", ''
  # The already-planned check, the allocation and the write are one lock hold:
  # two sessions planning one stage at once get one code, not two in a cell.
  Lock
  try {
    $name = RowCellN $n 2; if (-not $name) { Die "no stage $n in $Run" }
    $c = CodeOf $n; if ($c) { Die "stage $n is already planned as $c - a code is never reissued" }
    if ((RowCellN $n 3) -eq 'x') { Die "stage $n already landed" }
    $code = AllocCode (Split-Path -Parent $Run)
    $blk = @("### $code - stage $n - $name")
    if ($tk) { $blk += "tickets: $tk" }
    if ($Files) { $blk += "files: $Files" }
    $blk += 'prompt: |'; $blk += (Indent $text)
    # The code goes in front of the stage cell: the column count does not
    # change, so every positional reader still works.
    WriteRun (Get-Content $Run | ForEach-Object {
      if ((RowNum $_) -eq [int]$n) { $p = $_ -split '\|'; $p[2] = " $code $($p[2].TrimStart())"; $p -join '|' } else { $_ }
    })
    PutInSection 'Chain' $blk "driver: -${SEP}hold: -${SEP}mode: $ChainMode"
    StampUpdated
  } finally { Unlock }
  $code
}

# The usage reading is taken first (it runs another script); then every check
# on the file AND the claim - row `~`, In-flight block, driver stamp - happen
# in one lock hold, so two sessions dispatching one stage at once get exactly
# one winner and one exit 2.
function DoChainDispatch($n) {
  if (-not $n) { Die 'usage: -Mode chain -Action dispatch -N <n> -Driver @tag [-Owner O] [-Take] [-Override] [-Confirmed]' }
  $drv = if ($Driver) { $Driver } else { $env:RELAY_CHAIN_DRIVER }
  if (-not $drv) { Die "chain dispatch: name this session (-Driver @cc-xxxx or RELAY_CHAIN_DRIVER) - two sessions must not drive one chain" }
  if ($drv -match '[ |]') { Die "chain dispatch: driver tag has a space or a pipe: $drv" }
  NeedRun
  $d = ChainDecide (LevelLine)
  Lock
  try {
    $hp = HdrParts; $c = CodeOf $n
    if (-not $hp -or -not $c) { Die "stage $n has no chain block - chain plan $n first" }
    if ($hp[1] -ne '-') { Refuse "chain is held ($($hp[1])) - chain release first, or chain wait" }
    $st = RowCellN $n 3
    if ($st -notin @('', '!')) { Refuse "stage $n is '$st', not pending or failed - a stage is never dispatched twice" }
    $note = @()
    $od = $hp[0]; $otag = $od.Split(' ')[0]
    if ($od -ne '-' -and $otag -ne $drv) {
      $a = [int]((AsUtc (Now)) - (AsUtc $od.Split(' ')[1])).TotalMinutes
      if ($a -lt $DRIVER_STALE) {
        if (-not $Take) { Refuse "chain is driven by $otag (heartbeat ${a}m ago, stale at ${DRIVER_STALE}m) - -Take overrides, with a ruling" }
        $note += "${c}: driver taken over from $otag (heartbeat ${a}m ago) by $drv"
      }
    }
    # The reading gates the dispatch itself: never past the 7-day hard stop
    # without the user's explicit yes, never at or over the 5-hour hold
    # without the user's override.
    if ($d -match '^HOLD (\S+) 7d$') {
      if (-not $Confirmed) { Refuse "7-day window at $($Matches[1])% - the hard stop; dispatch only on the user's explicit yes (-Confirmed)" }
      $note += "${c}: override: user confirmed past 7d ${WEEKLY_PCT}% ($($Matches[1])%)"
    } elseif ($d -match '^HOLD (\S+)$') {
      if (-not $Override) { Refuse "5-hour reading $($Matches[1])% is at or over the ${HOLD_PCT}% hold - chain hold and chain wait, or -Override if the user asked" }
      $note += "${c}: override: user asked at $($Matches[1])%"
    } elseif ($d -eq 'UNOBSERVABLE') {
      [Console]::Error.WriteLine('note: usage unobservable on this host - dispatched with no usage check')
    }
    $name = RowCellN $n 2; $t = Now; $prompt = BlockPrompt $n
    $blk = @("### stage $n - $name  (dispatched $t, $drv)", 'run: -', 'prompt: |') + (Indent $prompt)
    DropInFlight $n
    PutInSection 'In flight' $blk $null
    SetHdr "$drv $t" '-' $hp[2]
    if ($note) { AddRuling ($note -join '; ') }
    if (-not (SetRow $n '~' $Owner '')) { Die "no stage $n in $Run" }
    StampUpdated
  } finally { Unlock }
  $c
  $prompt
}

function DoChainHold {
  $p = "$Pct".TrimEnd('%')
  if ($p -notmatch '^\d+(\.\d+)?$') { Die "chain hold: '$Pct' is not a percentage" }
  if ($Window -notin @('5h', '7d')) { Die "chain hold: -Window is 5h or 7d, not $Window" }
  NeedRun
  $hp = HdrParts; if (-not $hp) { Die "no ## Chain section in $Run - chain plan a stage first" }
  $nx = if ($Next) { $Next } else { FirstOpenRow }; if ($null -eq $nx -or "$nx" -eq '') { $nx = '-' }
  Lock
  try {
    $hp = HdrParts
    # Idempotent: a second hold keeps the first one's since, so a resumed
    # wait never restarts the clock.
    $since = if ($hp[1] -ne '-') { $hp[1].Split(' ')[0] } else { Now }
    SetHdr (OwnDriver) "$since $p% $Window next=$nx" $hp[2]
    StampUpdated
  } finally { Unlock }
  "hold: $since $p% $Window next=$nx"
}

function DoChainRelease {
  if ($Confirmed -and -not $Override) { Die "chain release: -Confirmed only goes with -Override" }
  NeedRun
  $hp = HdrParts; if (-not $hp) { Die "no ## Chain section in $Run" }
  if ($hp[1] -eq '-') { return 'not held' }
  $nx = ($hp[1] -split 'next=')[-1]; $c = CodeOf $nx; $note = ''
  $d = ChainDecide (LevelLine); $pc = ($d -split ' ')[1]
  if ($d -match ' 7d$') {
    if (-not ($Override -and $Confirmed)) { Refuse "7-day window at $pc% - the hard stop. Ask the user (AskUserQuestion); only their explicit yes releases: -Override -Confirmed" }
    $note = "override: user confirmed past 7d ${WEEKLY_PCT}% ($pc%)"
  } elseif ($d -like 'HOLD*') {
    if (-not $Override) { Refuse "5-hour reading $pc% is at or over the ${HOLD_PCT}% hold - keep waiting (chain wait), or -Override if the user asked" }
    $note = "override: user asked at $pc%"
  } elseif ($d -eq 'UNOBSERVABLE') {
    if ($Override) { $note = 'override: user asked, usage unobservable' }
  } elseif ($Override) { $note = "override: user asked at $pc% (already under ${HOLD_PCT}%)" }
  Lock
  try {
    $hp = HdrParts
    SetHdr (OwnDriver) '-' $hp[2]
    if ($note) { $who = if ($c) { $c } else { "stage $nx" }; AddRuling "${who}: $note" }
    StampUpdated
  } finally { Unlock }
  $msg = "released - next=$nx"; if ($c) { $msg += " ($c)" }; if ($note) { $msg += " - $note" }
  $msg
}

# The listener; see relay-morpheus.sh chain_wait. Returns @(exitcode, line)
# so the selftest can drive it in-process; the main switch exits with it.
#   0 RELEASE <pct> | 2 STOP <pct> 7d (the 7-day stop: nothing to wait for)
#   3 STUCK <pct> | 4 UNOBSERVABLE | 5 WAITING <pct> (re-arm)
function DoChainWait {
  foreach ($v in @($Interval, $Max, $For)) { if ($v -lt 0) { Die "chain wait: '$v' is not a number of seconds" } }
  $iv = [math]::Max(1, $Interval)
  NeedRun
  $hp = HdrParts
  $since = if ($hp -and $hp[1] -ne '-') { $hp[1].Split(' ')[0] } else { Now }
  $start = [DateTimeOffset]::UtcNow
  while ($true) {
    # Every poll by the driver is its activity: the stamp stays fresh through
    # a long hold, so no second session reads the waiting driver as dead.
    if (IsMe) { Lock; try { TouchDriver; StampUpdated } finally { Unlock } }
    $d = ChainDecide (LevelLine); $pc = ($d -split ' ')[1]
    if ($d -like 'RELEASE*') { return @(0, "RELEASE $pc") }
    if ($d -like '* 7d') { return @(2, "STOP $pc 7d") }
    if ($d -eq 'UNOBSERVABLE') { return @(4, 'UNOBSERVABLE') }
    $held = 60 * [int][math]::Floor(((AsUtc (Now)) - (AsUtc $since)).TotalMinutes)
    if ($held -ge $Max) { return @(3, "STUCK $pc (held since $since)") }
    $armed = [int][math]::Floor(([DateTimeOffset]::UtcNow - $start).TotalSeconds)
    if ($armed -ge $For) { return @(5, "WAITING $pc ($([math]::Floor(($Max - $held) / 60))m left of -Max)") }
    $s = [math]::Max(1, [math]::Min($iv, $For - $armed))
    Start-Sleep -Seconds $s
  }
}

function DoChainStatus {
  PickRun
  if (-not (Test-Path $Run)) { return }
  $on = $false
  foreach ($l in @(Get-Content $Run)) {
    if ($l -ceq '## Chain') { $on = $true; $l; continue }
    if ($on -and $l -match '^## ') { break }
    if ($on) { $l }
  }
}

# Each expected-failure check asserts on the message it expects. Catching
# everything and re-throwing only the "it did not fail" marker would swallow a
# regression that threw for the wrong reason and still print ok.
function ShouldFail($expect, $block) {
  try { & $block | Out-Null } catch {
    if ("$_" -notmatch $expect) { throw "selftest: wrong failure, wanted /$expect/, got: $_" }
    return
  }
  throw "selftest: expected a failure matching /$expect/ and got none"
}

# F31. The chain's whole value is that its state survives on disk and that
# its one decision - hold or go - is right, so both are pinned here, and the
# file is round-tripped through relay-morpheus.sh when sh is on PATH.
function ChainSelftest($d) {
  $gc = @('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=NUL')
  function G { $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git @gc @args 2>&1 | Out-Null; $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw "selftest: git $args failed" } }
  function SetLevel($l) { $env:RELAY_LEVEL_CMD = "echo '$l'" }
  function AgeDrv { WriteRun (Get-Content $Run | ForEach-Object { $_ -replace '^driver: (@\S+) \S+ ', 'driver: $1 2026-01-01T00:00Z ' }) }
  function DrvFresh { $l = ChainHdr; ($l -match '^driver: @') -and ($l -notmatch '^driver: @\S+ 2026-01-01T00:00Z ') }
  # A child powershell on this script, for the two-process races.
  function Spawn([string]$argline) {
    $psi = New-Object Diagnostics.ProcessStartInfo 'powershell'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $argline"
    $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    [Diagnostics.Process]::Start($psi)
  }
  function Reap($p) { $null = $p.StandardOutput.ReadToEnd(); $null = $p.StandardError.ReadToEnd(); $p.WaitForExit(); $p.ExitCode }

  # --- the decision table. Each row is a reading the listener will see.
  foreach ($row in @(
      @('RELEASE 79', 'src=claude-code 5h=79 7d=10 ctx=95 max=95'),
      @('HOLD 80', 'src=claude-code 5h=80 7d=10 ctx=5 max=80'),
      @('RELEASE 10', 'src=claude-code 5h=- 7d=10 ctx=- max=85'),
      @('HOLD 85 7d', 'src=claude-code 5h=- 7d=85 ctx=- max=85'),
      @('UNOBSERVABLE', 'src=claude-code 5h=- 7d=- ctx=85 max=85'),
      @('UNOBSERVABLE', 'src=codex 5h=- 7d=- ctx=90.0 max=90.0'),
      @('HOLD 84', 'src=claude-code 5h=84% 7d=n/a ctx=- max=84'),
      @('HOLD 91 7d', 'src=codex 5h=n/a 7d=91% ctx=- max=91'),
      @('UNOBSERVABLE', 'src=claude-code 5h=n/a 7d= ctx=99 max=99'),
      @('RELEASE 12.0', 'src=codex 5h=12.0 7d=45.0 ctx=90.0 max=90.0'),
      @('HOLD 90 7d', 'src=codex 5h=10 7d=90 ctx=- max=90'),
      @('RELEASE 10', 'src=codex 5h=10 7d=89.9 ctx=- max=89.9'),
      @('UNOBSERVABLE', 'src=claude-code 5h=- 7d=- ctx=- max=-'),
      @('UNOBSERVABLE', 'src=none 5h=- 7d=- ctx=- max=-'),
      @('UNOBSERVABLE', ''))) {
    $got = ChainDecide $row[1]
    if ($got -ne $row[0]) { Die "ChainDecide '$($row[1])': want '$($row[0])', got '$got'" }
  }
  $saved = $script:HOLD_PCT; $script:HOLD_PCT = 70
  try { if ((ChainDecide 'src=codex 5h=75 7d=1 ctx=- max=75') -ne 'HOLD 75') { Die "ChainDecide: RELAY_CHAIN_HOLD_PCT ignored" } }
  finally { $script:HOLD_PCT = $saved }
  # Garbage from the level command reads as unobservable, never as 0%.
  $env:RELAY_LEVEL_CMD = "throw 'oops'"
  if ((LevelLine) -ne 'src=none 5h=- 7d=- ctx=- max=-') { Die "LevelLine: an error did not read as src=none" }

  $d4 = Join-Path $d 'chain'; New-Item -ItemType Directory -Force $d4 | Out-Null; G init -q $d4
  $script:Dir = Join-Path $d4 '.skillator'; $script:Run = ''
  $script:Plan = 'TICKETS.md'; $script:Title = 'chain test'; $script:Stages = 'B2+B3 books,F2 report,F3 cli,verify review bump commit push'
  DoInit | Out-Null
  $s1 = $null; foreach ($l in @(Get-Content $Run)) { if ($l -match '^\| (\d+) \| B2\+B3 books \|') { $s1 = [int]$Matches[1] } }
  $s2 = $s1 + 1; $s3 = $s1 + 2
  $p1 = Join-Path $d4 'p1'; [IO.File]::WriteAllText($p1, "item B2+B3: fix both in shelf/books.py.`n`n  keep this indent | and this pipe`nlast line`n")
  $p2 = Join-Path $d4 'p2'; [IO.File]::WriteAllText($p2, "item F2: by_author`n")
  $p3 = Join-Path $d4 'p3'; [IO.File]::WriteAllText($p3, "item F3: --version`r`n")
  $want1 = "item B2+B3: fix both in shelf/books.py.`n`n  keep this indent | and this pipe`nlast line"

  # plan: a code per stage, never twice, and the row keeps its six cells.
  $script:PromptFile = $p1; $script:Tickets = 'B2, B3'; $script:Fix = 'build'; $script:Verify = 'build'; $script:Files = 'shelf/books.py'
  $c1 = DoChainPlan $s1
  $script:Tickets = ''; $script:Fix = ''; $script:Verify = ''; $script:Files = ''
  $script:PromptFile = $p2; $c2 = DoChainPlan $s2
  $script:PromptFile = $p3; $c3 = DoChainPlan $s3
  if ("$c1" -cnotmatch '^[A-Z0-9]{4}$') { Die "chain plan: '$c1' is not a 4-char code" }
  if ($c1 -eq $c2 -or $c2 -eq $c3 -or $c1 -eq $c3) { Die "chain plan: codes repeat: $c1 $c2 $c3" }
  $script:PromptFile = $p2; ShouldFail 'already planned as' { DoChainPlan $s2 }
  if (-not (Select-String -Path $Run -Pattern "^\| $s2 \| $c2 F2 report \|" -Quiet)) { Die "chain plan: a refused second plan touched the cell" }
  $script:PromptFile = ''; ShouldFail 'PromptFile with the stage' { DoChainPlan $s1 }
  $txt = [IO.File]::ReadAllText($Run)
  if ($txt -notmatch "(?m)^\| $s1 \| $c1 B2\+B3 books \|   \| - \| - \| - \|$") { Die "chain plan: cell not prefixed with the code" }
  foreach ($l in @(Get-Content $Run)) { if ((RowNum $l) -eq $s1 -and ($l -split '\|').Count -ne 8) { Die "chain plan: the row's column count changed" } }
  if ($txt -notmatch "(?m)^### $c1 - stage $s1 - B2\+B3 books$") { Die "chain plan: no block header" }
  if ($txt -notmatch '(?m)^tickets: B2 build/build \. B3 build/build$') { Die "chain plan: tickets line wrong" }
  if ($txt -notmatch '(?m)^driver: -     hold: -     mode: workflow$') { Die "chain plan: no Chain header" }
  if (([regex]::Matches($txt, '(?m)^## Chain$')).Count -ne 1) { Die "chain plan: more than one ## Chain section" }
  if ($txt.IndexOf("`n## Chain`n") -gt $txt.IndexOf("`n## Rulings")) { Die "chain plan: ## Chain not before ## Rulings" }
  if ((BlockPrompt $s1) -cne $want1) { Die "chain plan: the stored prompt is not verbatim" }
  if ((BlockPrompt $s3) -cne 'item F3: --version') { Die "chain plan: a CRLF prompt kept its CR" }
  if ($txt -match "`r") { Die "chain plan: wrote CR into the run file" }
  if (Test-Path "$Run.lock") { Die "chain plan: left the lock behind" }

  # dispatch: never without a driver, a block, or past a hold; prompt verbatim.
  SetLevel 'src=claude-code 5h=40 7d=10 ctx=5 max=40'
  $script:Driver = ''; $savedDrv = $env:RELAY_CHAIN_DRIVER; $env:RELAY_CHAIN_DRIVER = ''
  ShouldFail 'name this session' { DoChainDispatch $s1 }
  $script:Driver = '@cc-a'; $script:Owner = 'build:opus'
  $out = @(DoChainDispatch $s1)
  $script:Owner = ''
  if ($out[0] -ne $c1) { Die "chain dispatch: did not print the code first" }
  if ($out[1] -cne $want1) { Die "chain dispatch: printed prompt not verbatim" }
  $on = $false; $p = $false; $buf = @()
  foreach ($l in @(Get-Content $Run)) {
    if ($l.StartsWith("### stage $s1 - ")) { $on = $true; continue }
    if ($on -and $l -match '^## ') { break }
    if ($on -and $l -eq 'prompt: |') { $p = $true; continue }
    if ($on -and $p) { $buf += ($l -replace '^  ', '') }
  }
  while ($buf.Count -and $buf[-1] -eq '') { $buf = @($buf[0..($buf.Count - 2)]) }
  if (($buf -join "`n") -cne $want1) { Die "chain dispatch: In-flight prompt is not the planned prompt verbatim" }
  $txt = [IO.File]::ReadAllText($Run)
  if ($txt -notmatch "(?m)^\| $s1 \| $c1 B2\+B3 books \| ~ \| build:opus \|") { Die "chain dispatch: row not in flight" }
  if ($txt -notmatch '(?m)^driver: @cc-a 20[0-9-]+T[0-9:]+Z     hold: -     mode: workflow$') { Die "chain dispatch: driver not stamped" }
  DoHeartbeat $s1
  if (-not ((DoOrphans 0) -match [regex]::Escape("stage $s1 ($c1 B2+B3 books)"))) { Die "orphans: lost the coded row" }
  ShouldFail 'REFUSED: stage .* not pending or failed' { DoChainDispatch $s1 }
  $script:Driver = '@cc-b'
  ShouldFail 'REFUSED: chain is driven by @cc-a' { DoChainDispatch $s2 }
  DoStage $s1 'x' 'build:opus' 'abc1234'
  $script:Take = $true; DoChainDispatch $s2 | Out-Null; $script:Take = $false
  if (-not (Select-String -Path $Run -SimpleMatch "${c2}: driver taken over from @cc-a" -Quiet)) { Die "chain dispatch -Take: no ruling" }
  DoStage $s2 '!' 'build:opus' ''
  ShouldFail 'REFUSED: stage .* not pending or failed' { DoChainDispatch $s1 }

  # F31 review: the driver's own activity keeps its stamp fresh. Age it past
  # stale; a heartbeat brings it back, and a second driver is refused again.
  AgeDrv; if (DrvFresh) { Die "selftest: AgeDrv did not age the stamp" }
  $script:Driver = ''; DoHeartbeat $s1; if (DrvFresh) { Die "chain: a heartbeat with no driver tag refreshed the driver stamp" }
  $script:Driver = '@cc-b'
  DoHeartbeat $s1; if (-not (DrvFresh)) { Die "chain: a heartbeat did not refresh the driver stamp" }
  $script:Driver = '@cc-z'
  ShouldFail 'REFUSED: chain is driven by @cc-b' { DoChainDispatch $s2 }
  $script:Driver = '@cc-b'
  AgeDrv

  # hold: idempotent, keeps its since, names the next open stage; locked.
  $script:Pct = '84'; $script:Next = ''; $script:Window = '5h'
  $h1 = DoChainHold
  if (-not (DrvFresh)) { Die "chain hold: did not refresh the driver stamp" }
  if ($h1 -notmatch " 84% 5h next=$s2$") { Die "chain hold: next is not the first open stage ($s2): $h1" }
  WriteRun (Get-Content $Run | ForEach-Object { $_ -replace 'hold: \S+ ', 'hold: 2026-01-01T00:00Z ' })
  $script:Pct = '86'; $h2 = DoChainHold
  if ($h2 -ne "hold: 2026-01-01T00:00Z 86% 5h next=$s2") { Die "chain hold: a second hold restarted the clock: $h2" }
  if (Test-Path "$Run.lock") { Die "chain hold: left the lock behind" }
  ShouldFail 'REFUSED: chain is held' { DoChainDispatch $s2 }

  # wait: wall-clock, measured from the hold's own since.
  $script:Interval = 1; $script:Max = 19800; $script:For = 5
  $r = DoChainWait; if ($r[0] -ne 0 -or $r[1] -ne 'RELEASE 40') { Die "chain wait: want RELEASE 40 / 0, got '$($r[1])' / $($r[0])" }
  SetLevel 'src=claude-code 5h=84 7d=10 ctx=5 max=84'
  $r = DoChainWait; if ($r[0] -ne 3 -or $r[1] -notlike 'STUCK 84 *') { Die "chain wait: a hold since 2026-01-01 is past -Max, want STUCK/3, got '$($r[1])' / $($r[0])" }
  SetLevel 'src=none 5h=- 7d=- ctx=- max=-'
  $r = DoChainWait; if ($r[0] -ne 4 -or $r[1] -ne 'UNOBSERVABLE') { Die "chain wait: want UNOBSERVABLE/4, got '$($r[1])' / $($r[0])" }
  # F31 review 3: a 7-day hold - and a 7-day-only reading is one - is the
  # 7-day stop. That window refills in days: the listener stops (2) instead of
  # polling 5.5h into STUCK.
  SetLevel 'src=claude-code 5h=- 7d=85 ctx=- max=85'
  $r = DoChainWait; if ($r[0] -ne 2 -or $r[1] -ne 'STOP 85 7d') { Die "chain wait: a 7-day-only 85% wants STOP 85 7d / 2, got '$($r[1])' / $($r[0])" }
  SetLevel 'src=codex 5h=10 7d=91 ctx=- max=91'
  $r = DoChainWait; if ($r[0] -ne 2 -or $r[1] -ne 'STOP 91 7d') { Die "chain wait: 7d 91% wants STOP 91 7d / 2, got '$($r[1])' / $($r[0])" }
  WriteRun (Get-Content $Run | ForEach-Object { $_ -replace 'hold: 2026-01-01T00:00Z ', "hold: $(Now) " })
  SetLevel 'src=claude-code 5h=84 7d=10 ctx=5 max=84'; $script:For = 1
  AgeDrv
  $r = DoChainWait; if ($r[0] -ne 5 -or $r[1] -notlike 'WAITING 84 *') { Die "chain wait: -For spent, want WAITING/5, got '$($r[1])' / $($r[0])" }
  if (-not (DrvFresh)) { Die "chain wait: a poll did not refresh the driver stamp" }
  $polls = Join-Path $d4 'polls'; [IO.File]::WriteAllText($polls, '0')
  $env:RELAY_LEVEL_CMD = "`$n = [int]([IO.File]::ReadAllText('$polls')); [IO.File]::WriteAllText('$polls', [string](`$n + 1)); if (`$n -ge 1) { 'src=claude-code 5h=60 7d=10 ctx=5 max=60' } else { 'src=claude-code 5h=84 7d=10 ctx=5 max=84' }"
  $script:For = 30
  $r = DoChainWait
  if ($r[0] -ne 0 -or $r[1] -ne 'RELEASE 60' -or [IO.File]::ReadAllText($polls) -ne '2') { Die "chain wait: did not release on the poll after usage fell: '$($r[1])' / $($r[0])" }

  # release: the reading decides; an override is a ruling; 7d needs -Confirmed.
  SetLevel 'src=claude-code 5h=83 7d=10 ctx=5 max=83'
  ShouldFail 'REFUSED: 5-hour reading 83%' { DoChainRelease }
  SetLevel 'src=claude-code 5h=10 7d=91 ctx=5 max=91'; $script:Override = $true
  ShouldFail 'REFUSED: 7-day window at 91%' { DoChainRelease }
  if (-not (Select-String -Path $Run -Pattern '^driver: .*     hold: 20' -Quiet)) { Die "chain release: a refused release cleared the hold" }
  $script:Confirmed = $true; DoChainRelease | Out-Null
  if (-not (Select-String -Path $Run -SimpleMatch "${c2}: override: user confirmed past 7d 90% (91%)" -Quiet)) { Die "chain release: no ruling for the 7-day override" }
  if (-not (Select-String -Path $Run -Pattern '^driver: @cc-b \S+     hold: -     mode: workflow$' -Quiet)) { Die "chain release: hold not cleared" }
  $script:Override = $false; $script:Confirmed = $false
  if ((DoChainRelease) -ne 'not held') { Die "chain release: not idempotent" }
  $script:Pct = '83'; DoChainHold | Out-Null
  AgeDrv
  SetLevel 'src=claude-code 5h=83 7d=10 ctx=5 max=83'; $script:Override = $true
  DoChainRelease | Out-Null; $script:Override = $false
  if (-not (Select-String -Path $Run -SimpleMatch "${c2}: override: user asked at 83%" -Quiet)) { Die "chain release -Override: no ruling" }
  if (-not (DrvFresh)) { Die "chain release: did not refresh the driver stamp" }
  # F31 review 2: another session's hold, wait, release and heartbeat leave a
  # dead driver's stamp as it was, so the resumer can take the chain over.
  AgeDrv
  $script:Driver = ''; $env:RELAY_CHAIN_DRIVER = '@cc-r'; $script:Pct = '83'
  DoChainHold | Out-Null; if (DrvFresh) { Die "chain hold: refreshed another session's driver stamp" }
  $env:RELAY_CHAIN_DRIVER = ''; $script:Driver = '@cc-r'; $script:For = 1
  $r = DoChainWait; if (DrvFresh) { Die "chain wait: refreshed another session's driver stamp" }
  DoHeartbeat $s1; if (DrvFresh) { Die "heartbeat: refreshed another session's driver stamp" }
  SetLevel 'src=claude-code 5h=10 7d=10 ctx=5 max=10'
  DoChainRelease | Out-Null; if (DrvFresh) { Die "chain release: refreshed another session's driver stamp" }
  if (-not (Select-String -Path $Run -Pattern '^driver: @cc-b 2026-01-01T00:00Z     hold: -     mode: workflow$' -Quiet)) { Die "chain release by another session: header wrong" }
  $script:Driver = '@cc-b'
  # F31 review: dispatch reads usage itself. 5h at the hold -> refused unless
  # -Override (a ruling); unobservable -> dispatches, with a note.
  SetLevel 'src=claude-code 5h=85 7d=10 ctx=5 max=85'
  ShouldFail 'REFUSED: 5-hour reading 85%' { DoChainDispatch $s2 }
  SetLevel 'src=claude-code 5h=- 7d=85 ctx=- max=85'; $script:Override = $true
  try { ShouldFail '^REFUSED: 7-day window at 85%' { DoChainDispatch $s2 } } finally { $script:Override = $false }
  SetLevel 'src=claude-code 5h=- 7d=- ctx=85 max=85'
  $sw = New-Object IO.StringWriter; $olderr = [Console]::Error; [Console]::SetError($sw)
  try { DoChainDispatch $s2 | Out-Null } finally { [Console]::SetError($olderr) }
  if ($sw.ToString() -notmatch '(?m)^note: usage unobservable') { Die "chain dispatch: no note for an unobservable reading" }
  if (-not (Select-String -Path $Run -Pattern "^\| $s2 \| $c2 F2 report \| ~ \|" -Quiet)) { Die "chain dispatch: unobservable dispatch did not claim the row" }
  DoStage $s2 '!' 'build:opus' ''
  SetLevel 'src=claude-code 5h=85 7d=10 ctx=5 max=85'; $script:Override = $true
  DoChainDispatch $s2 | Out-Null; $script:Override = $false
  if (-not (Select-String -Path $Run -SimpleMatch "${c2}: override: user asked at 85%" -Quiet)) { Die "chain dispatch -Override: no ruling" }
  DoStage $s2 '!' 'build:opus' ''
  SetLevel 'src=claude-code 5h=10 7d=92 ctx=5 max=92'
  ShouldFail 'REFUSED: 7-day window at 92%' { DoChainDispatch $s2 }
  # F31 review 3: a redispatch of a failed stage replaces its In-flight block -
  # one block per stage, the new one, not the old block with its dead run id.
  $inb = $false
  WriteRun (Get-Content $Run | ForEach-Object {
    if ($_.StartsWith("### stage $s2 - ")) { $inb = $true; $_ } elseif ($_ -match '^#') { $inb = $false; $_ }
    elseif ($inb -and $_ -match '^run: ') { 'run: dead-run-1' } else { $_ } })
  if (-not (Select-String -Path $Run -Pattern '^run: dead-run-1$' -Quiet)) { Die "selftest: did not mark the old In-flight block" }
  $script:Confirmed = $true; DoChainDispatch $s2 | Out-Null; $script:Confirmed = $false
  $nb = @(Select-String -Path $Run -SimpleMatch "### stage $s2 - " | Where-Object { $_.Line.StartsWith("### stage $s2 - ") }).Count
  if ($nb -ne 1) { Die "chain dispatch: redispatching a failed stage left $nb In-flight blocks for it" }
  if (Select-String -Path $Run -Pattern '^run: dead-run-1$' -Quiet) { Die "chain dispatch: redispatching a failed stage kept the old In-flight block" }
  if (@(Select-String -Path $Run -Pattern "^### stage $s1 - ").Count -ne 1) { Die "chain dispatch: replacing stage $s2's block touched stage $s1's" }
  $txt = [IO.File]::ReadAllText($Run)
  if ($txt.IndexOf("`n## In flight`n") -lt 0 -or $txt.IndexOf("`n## In flight`n") -gt $txt.IndexOf("`n## Rulings")) { Die "chain dispatch: the In-flight section lost its place" }
  if (-not (Select-String -Path $Run -SimpleMatch "${c2}: override: user confirmed past 7d 90% (92%)" -Quiet)) { Die "chain dispatch -Confirmed: no ruling" }
  if (-not ((DoChainStatus) -ceq "### $c3 - stage $s3 - F3 cli")) { Die "chain status: did not print the chain" }
  if (Test-Path "$Run.lock") { Die "chain: left the lock behind" }

  # Through -File, as a hook or a session calls it: wait's exit code, and a
  # refusal's exit 2.
  SetLevel 'src=claude-code 5h=40 7d=10 ctx=5 max=40'
  $o = & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode chain -Action wait -Interval 1 -For 3 -Run $Run
  if ($LASTEXITCODE -ne 0 -or "$o".Trim() -ne 'RELEASE 40') { Die "-File: chain wait gave '$o' / $LASTEXITCODE" }
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode chain -Action dispatch -N $s2 -Driver '@cc-b' -Run $Run 2>$null | Out-Null }
  finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 2) { Die "-File: a refused dispatch exited $LASTEXITCODE, not 2" }

  # F31 review: the checks and the claim are one lock hold. Two processes
  # dispatching one stage at once -> exactly one 0 and one 2, one block.
  $pa = Spawn "-Mode chain -Action dispatch -N $s3 -Driver @cc-b -Run `"$Run`""
  $pb = Spawn "-Mode chain -Action dispatch -N $s3 -Driver @cc-b -Run `"$Run`""
  $ra = Reap $pa; $rb = Reap $pb
  if ((@($ra, $rb) | Sort-Object) -join ',' -ne '0,2') { Die "chain dispatch: two parallel dispatches of one stage exited $ra and $rb, not 0 and 2" }
  if (@(Select-String -Path $Run -Pattern "^### stage $s3 - ").Count -ne 1) { Die "chain dispatch: two parallel dispatches wrote two In-flight blocks" }
  # Same for plan: two processes planning one stage -> one code in the cell.
  $s5 = [int](DoAdd 'F9 race')
  $pa = Spawn "-Mode chain -Action plan -N $s5 -PromptFile `"$p3`" -Run `"$Run`""
  $pb = Spawn "-Mode chain -Action plan -N $s5 -PromptFile `"$p3`" -Run `"$Run`""
  $ra = Reap $pa; $rb = Reap $pb
  if (-not (($ra -eq 0) -xor ($rb -eq 0))) { Die "chain plan: two parallel plans of one stage exited $ra and $rb" }
  if (-not (Select-String -Path $Run -Pattern "^\| $s5 \| [A-Z0-9]{4} F9 race \|" -CaseSensitive -Quiet)) { Die "chain plan: two parallel plans put two codes in the cell" }
  if (@(Select-String -Path $Run -SimpleMatch " - stage $s5 - ").Count -ne 1) { Die "chain plan: two parallel plans wrote two blocks" }
  if (Test-Path "$Run.lock") { Die "chain: parallel calls left the lock behind" }
  # F31 review 2: a hand-mangled Chain header (4-space separators) is left
  # alone by the driver's heartbeat - row stamped, no throw, header unchanged.
  $good = [IO.File]::ReadAllBytes($Run)
  WriteRun (Get-Content $Run | ForEach-Object { $_ -replace '^(driver: @\S+ \S+)     hold: (.*)     mode: ', '$1    hold: $2    mode: ' })
  $bad = ChainHdr; if ($bad -match '     ') { Die "selftest: did not mangle the Chain header: $bad" }
  $script:Driver = ($bad -replace '^driver: ', '').Split(' ')[0]
  DoHeartbeat $s1
  if ((ChainHdr) -cne $bad) { Die "heartbeat: rewrote a hand-mangled Chain header: $(ChainHdr)" }
  if (Test-Path "$Run.lock") { Die "heartbeat: left the lock behind on a mangled header" }
  # Every other command that reads the header for a rewrite refuses it -
  # "unreadable Chain header", exit 1 as relay-morpheus.sh does - and leaves the
  # file byte-identical, instead of nesting the old line into a new one.
  $mangled = [IO.File]::ReadAllBytes($Run)
  $want = '^' + [regex]::Escape("FAIL: unreadable Chain header in ${Run}: $bad") + '$'
  $script:Pct = '84'; $script:Window = '5h'; $script:Next = ''; $script:Interval = 1; $script:For = 1
  foreach ($c in @(@('hold', { DoChainHold }), @('release', { DoChainRelease }), @('wait', { DoChainWait }), @('dispatch', { DoChainDispatch $s5 }))) {
    ShouldFail $want $c[1]
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Run)) -cne [Convert]::ToBase64String($mangled)) { Die "chain $($c[0]): rewrote a hand-mangled Chain header: $(ChainHdr)" }
    if (Test-Path "$Run.lock") { Die "chain $($c[0]): left the lock behind on a mangled header" }
  }
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode chain -Action hold -Pct 84 -Driver $Driver -Run $Run 2>$null | Out-Null }
  finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 1) { Die "-File: chain hold on a hand-mangled Chain header exited $LASTEXITCODE, not 1" }
  if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Run)) -cne [Convert]::ToBase64String($mangled)) { Die "-File: chain hold rewrote a hand-mangled Chain header" }
  # F31 review 3: a driver cell with no stamp is unreadable the same way - it
  # has no age, so another session's dispatch must not read it as stale and
  # take the chain over with no -Take and no ruling.
  [IO.File]::WriteAllBytes($Run, $good)
  WriteRun (Get-Content $Run | ForEach-Object { $_ -replace '^driver: (@\S+) \S+     hold: ', 'driver: $1     hold: ' })
  $bad = ChainHdr; if (-not $bad.StartsWith("driver: $Driver     hold: ")) { Die "selftest: did not strip the driver stamp: $bad" }
  DoHeartbeat $s1
  if ((ChainHdr) -cne $bad) { Die "heartbeat: rewrote a stampless driver cell: $(ChainHdr)" }
  $mangled = [IO.File]::ReadAllBytes($Run)
  $want = '^' + [regex]::Escape("FAIL: unreadable Chain header in ${Run}: $bad") + '$'
  $tagD = $Driver
  foreach ($c in @(@('hold', { DoChainHold }), @('release', { DoChainRelease }), @('wait', { DoChainWait }), @('dispatch', { DoChainDispatch $s5 }),
                   @('dispatch by another', { $script:Driver = '@cc-other'; try { DoChainDispatch $s5 } finally { $script:Driver = $tagD } }))) {
    ShouldFail $want $c[1]
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Run)) -cne [Convert]::ToBase64String($mangled)) { Die "chain $($c[0]): rewrote a stampless driver cell: $(ChainHdr)" }
    if (Test-Path "$Run.lock") { Die "chain $($c[0]): left the lock behind on a stampless driver cell" }
  }

  # The fallback coder (no next-id) refuses past 9999 instead of wrapping.
  $d5 = Join-Path $d4 'nonid'; New-Item -ItemType Directory -Force $d5 | Out-Null
  $rf = Join-Path $d5 'run-1-a.md'; [IO.File]::WriteAllText($rf, "### AAAB - stage 1 - x`n")
  $savedNid = $env:RELAY_NEXT_ID; $env:RELAY_NEXT_ID = Join-Path $d5 'nope.ps1'
  $olderr = [Console]::Error; [Console]::SetError([IO.TextWriter]::Null)
  try {
    if ((AllocCode $d5) -cne 'AAAC') { Die "AllocCode fallback: AAAB + 1 is not AAAC" }
    [IO.File]::AppendAllText($rf, "### 9999 - stage 2 - y`n")
    ShouldFail 'REFUSED: kind W exhausted' { AllocCode $d5 }
  } finally {
    [Console]::SetError($olderr)
    if ($null -eq $savedNid) { Remove-Item Env:RELAY_NEXT_ID -ErrorAction SilentlyContinue } else { $env:RELAY_NEXT_ID = $savedNid }
  }
  # F31 review 3: the same refusal through next-id.ps1 - exit 2 on both paths,
  # though next-id itself exits 1 for it.
  if (FindNextId) {
    $olderr = [Console]::Error; [Console]::SetError([IO.TextWriter]::Null)
    try { ShouldFail '^REFUSED: kind W exhausted' { AllocCode $d5 } } finally { [Console]::SetError($olderr) }
  }

  # The run file the relay-chain-resume fixture ships (stage 61) parses.
  $script:Run = Join-Path $d4 'fixture.md'
  [IO.File]::WriteAllText($Run, "## Chain`ndriver: @cc-a1b2c3 2026-09-01T09:45Z     hold: 2026-09-01T09:45Z 84% 5h next=2     mode: workflow`n### AAAC - stage 2 - F2+F5 report.py, F3 cli`nprompt: |`n  item F2+F5`n")
  $hp = HdrParts
  if ($hp[0] -ne '@cc-a1b2c3 2026-09-01T09:45Z' -or $hp[1] -ne '2026-09-01T09:45Z 84% 5h next=2' -or $hp[2] -ne 'workflow' -or
      (CodeOf 2) -ne 'AAAC' -or (BlockPrompt 2) -ne 'item F2+F5') { Die "chain: the stage-61 fixture's run file does not parse" }

  # Cross-mirror: relay-morpheus.sh plans, this side dispatches and holds,
  # the sh side waits on that hold and releases it. One file, two writers.
  $shExe = Get-Command sh -ErrorAction SilentlyContinue
  $shScript = Join-Path $PSScriptRoot 'relay-morpheus.sh'
  if ($shExe -and (Test-Path $shScript)) {
    $x = Join-Path $d 'cross'; New-Item -ItemType Directory -Force $x | Out-Null; G init -q $x
    $script:Dir = Join-Path $x '.skillator'; $script:Run = ''; $script:Title = 'cross'; $script:Stages = 'one,two'
    DoInit | Out-Null
    $xs = $null; foreach ($l in @(Get-Content $Run)) { if ($l -match '^\| (\d+) \| one \|') { $xs = [int]$Matches[1] } }
    $oldRun = $env:RELAY_RUN; $env:RELAY_RUN = $Run.Replace('\', '/')
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
      $xc = (& $shExe.Source $shScript chain plan $xs --prompt-file $p1.Replace('\', '/') 2>$null | Select-Object -Last 1)
      if ("$xc" -cnotmatch '^[A-Z0-9]{4}$') { Die "cross: sh chain plan gave '$xc'" }
      SetLevel 'src=claude-code 5h=40 7d=10 ctx=5 max=40'; $script:Driver = '@cc-x'
      $out = @(DoChainDispatch $xs)
      if ($out[0] -ne $xc -or $out[1] -cne $want1) { Die "cross: ps did not read the sh-planned block verbatim" }
      $script:Pct = '84'; $script:Next = ''; DoChainHold | Out-Null
      WriteRun (Get-Content $Run | ForEach-Object { $_ -replace 'hold: \S+ ', 'hold: 2026-01-01T00:00Z ' })
      $env:RELAY_LEVEL_CMD = "echo 'src=claude-code 5h=84 7d=10 ctx=5 max=84'"
      $o = (& $shExe.Source $shScript chain wait --interval 1 2>$null) -join ' '; $rc = $LASTEXITCODE
      if ($rc -ne 3 -or $o -notlike 'STUCK 84 *2026-01-01T00:00Z*') { Die "cross: sh did not read the ps hold's since: '$o' / $rc" }
      $env:RELAY_LEVEL_CMD = "echo 'src=claude-code 5h=60 7d=10 ctx=5 max=60'"
      $o = (& $shExe.Source $shScript chain release 2>$null) -join ' '
      if ($LASTEXITCODE -ne 0 -or $o -notlike "released - next=$($xs + 1)*") { Die "cross: sh release of a ps hold gave '$o'" }
      if ((HdrParts)[1] -ne '-') { Die "cross: ps does not see the sh release" }
      $b = [IO.File]::ReadAllBytes($Run)
      if ($b[0] -eq 0xEF -or [Text.Encoding]::UTF8.GetString($b) -match "`r") { Die "cross: the shared run file gained a BOM or CR" }
    } finally { $ErrorActionPreference = $prev; $env:RELAY_RUN = $oldRun }
  } else {
    [Console]::Error.WriteLine("note: sh not on PATH - chain cross-mirror round trip skipped")
  }
  $env:RELAY_CHAIN_DRIVER = $savedDrv
  Remove-Item Env:RELAY_LEVEL_CMD -ErrorAction SilentlyContinue
}

function DoSelftest {
  $d = Join-Path ([IO.Path]::GetTempPath()) ("relay-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Force $d | Out-Null
  # Each scratch dir is its own git repo, so the allocator keeps its counter
  # there and not in whatever repo the selftest was started from.
  $gc = @('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=NUL')
  function G { $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git @gc @args 2>&1 | Out-Null; $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw "selftest: git $args failed" } }
  G init -q $d
  try {
    $script:Run = Join-Path $d "run.md"
    $script:Plan = "plan.md"; $script:Title = "selftest"; $script:Stages = "alpha,beta"

    DoInit | Out-Null
    if (-not (Select-String -Path $Run -Pattern '^\| 2 \| beta \|' -Quiet)) { Die "init: no row for stage 2" }
    # -Stages arrives as one literal string under -File; splitting is this
    # script's job, and collapsing it to a single row would silently erase
    # every stage boundary - the precise loss relay exists to prevent.
    if (-not (Select-String -Path $Run -Pattern '^\| 1 \| alpha \|' -Quiet)) { Die "init: -Stages was not split" }

    # No BOM, LF endings - a file both mirrors edit must not flip encoding.
    $raw = [IO.File]::ReadAllBytes($Run)
    if ($raw[0] -eq 0xEF) { Die "init: wrote a UTF-8 BOM" }
    if ([Text.Encoding]::UTF8.GetString($raw) -match "`r`n") { Die "init: wrote CRLF" }

    ShouldFail 'run file already exists' { DoInit }

    DoStage 1 '~' 'build:sonnet' ''
    if (-not (Select-String -Path $Run -Pattern '^\| 1 \| alpha \| ~ \| build:sonnet \|' -Quiet)) { Die "stage: row 1 not in flight" }

    ShouldFail 'marked landed with no sha' { DoStage 1 'x' '' '' }
    DoStage 1 'x' 'build:sonnet' '3f1a2c9'
    if (-not (Select-String -Path $Run -Pattern '3f1a2c9' -Quiet)) { Die "stage: sha not recorded" }

    DoStage 1 'x' 'build:sonnet' '3f1a2c9'
    if ((Select-String -Path $Run -Pattern '^\| 1 \|').Count -ne 1) { Die "stage: duplicated row 1" }

    ShouldFail 'no stage 9' { DoStage 9 '~' '' '' }

    # A pipe in a stage name must be refused at init, not corrupt the ledger.
    $saved = $script:Run; $script:Run = Join-Path $d "piped.md"
    $script:Stages = "list | pretty"
    ShouldFail "would shift every column" { DoInit }
    $script:Run = $saved; $script:Stages = "alpha,beta"

    # The lock must be released on the way out, or the next call spins for 30s.
    if (Test-Path "$Run.lock") { Die "stage: left the lock behind" }

    # A `|` in owner or landed shifts every column, exactly as one in a stage
    # name does - and `landed` takes a path, so it is reachable by accident.
    ShouldFail "would shift every column" { DoStage 2 '~' 'model:opus|5' '' }
    ShouldFail "would shift every column" { DoStage 2 'x' 'build:sonnet' 'a|b' }

    # A heartbeat on a stage that already landed must not trip the sha guard.
    DoHeartbeat 1
    if (-not (Select-String -Path $Run -Pattern '3f1a2c9' -Quiet)) { Die "heartbeat: dropped the landed sha" }

    # `pending` is the -File-safe spelling of the empty state; -State '' is
    # dropped by -File before the script ever sees it.
    DoStage 2 'pending' '' ''
    if ((DoOrphans 20) -notmatch 'no stages in flight') { Die "orphans: a pending row counted as in flight" }

    DoStage 2 '~' 'build:sonnet' ''
    if ((DoOrphans 20) -match 'no stages in flight') { Die "orphans: missed an in-flight row" }
    if (-not ((DoOrphans 0) -match 'stage 2')) { Die "orphans: did not flag a silent stage at limit 0" }
    if ((DoOrphans 9999) -match 'stage 2') { Die "orphans: flagged a fresh heartbeat" }
    if (-not (DoStatus | Select-String -Pattern '^\| 2 \|' -Quiet)) { Die "status: did not print the stage table" }

    # The same rollovers relay-morpheus.sh asserts on its own arithmetic. DoOrphans does
    # its date maths independently, so the pair can disagree without this.
    foreach ($p in @(@('2026-09-22T09:00Z', '2026-09-22T09:25Z', 25),
                     @('2026-09-22T23:50Z', '2026-09-23T00:10Z', 20),
                     @('2026-02-28T23:50Z', '2026-03-01T00:10Z', 20),
                     @('2024-02-28T23:50Z', '2024-02-29T00:10Z', 20),
                     @('2025-12-31T23:50Z', '2026-01-01T00:10Z', 20))) {
      $got = [int](((AsUtc $p[1]) - (AsUtc $p[0])).TotalMinutes)
      if ($got -ne $p[2]) { Die "age: $($p[0]) -> $($p[1]) gave $got, wanted $($p[2])" }
    }

    # Everything above runs in-process. This is the only check that goes
    # through `-File`, which is how the hooks actually invoke this script and
    # where the -Stages and -State argument bugs both lived.
    $f2 = Join-Path $d "viafile.md"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode init -Plan p -Title t -Stages "one,two" -Run $f2 | Out-Null
    if (-not (Select-String -Path $f2 -Pattern '^\| \d+ \| two \|' -Quiet)) { Die "-File: -Stages did not split" }
    # Stage numbers are serial now, so take this run's first one from the file.
    $n2 = @(Get-Content $f2 | ForEach-Object { RowNum $_ } | Where-Object { $null -ne $_ })[0]
    & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode stage -N $n2 -State pending -Run $f2 | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "-File: -State pending failed" }

    # --- F22: RUN ids and stage numbers are serial across the project. Before
    # the allocator, two worktrees both made RUN-4 and every run had a stage 1.
    if (FindNextId) {
      $d3 = Join-Path $d 'f22'; $main = Join-Path $d3 'main'; $sk = Join-Path $main '.skillator'
      New-Item -ItemType Directory -Force $sk | Out-Null
      G init -q -b main $main
      $old = Join-Path $sk 'run-3-old.md'
      $ol = @('# RUN-3 - old', '## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|-------|-------|-------|-----------|--------|')
      foreach ($i in 1..23) { $ol += "| $i | s$i |   | - | - | - |" }
      [IO.File]::WriteAllText($old, (($ol -join "`n") + "`n"))
      G -C $main add -A; G -C $main commit -q -m old
      $wt2 = Join-Path $d3 'wt2'; G -C $main worktree add -q -b wt2 $wt2
      $before = [IO.File]::ReadAllText($old)
      $script:Dir = $sk; $script:Run = ''; $script:Title = 'four'; $script:Stages = 'a,b'
      DoInit | Out-Null
      $f4 = Resolve-Run 4; if (-not $f4) { Die "F22: first new run is not RUN-4" }
      if (-not (Select-String -Path $f4 -Pattern '^\| 24 \| a \|' -Quiet) -or -not (Select-String -Path $f4 -Pattern '^\| 25 \| b \|' -Quiet)) { Die "F22: stages did not continue after 23" }
      $script:Dir = Join-Path $wt2 '.skillator'; $script:Run = ''; $script:Title = 'other tree'; $script:Stages = 'c'
      DoInit | Out-Null
      $f5 = Resolve-Run 5; if (-not $f5) { Die "F22: second worktree repeated RUN-4" }
      if (-not (Select-String -Path $f5 -Pattern '^\| 26 \| c \|' -Quiet)) { Die "F22: second worktree reused a stage number" }
      $script:Dir = $sk; $script:Run = $f4
      $got = DoAdd 'late one'; if ("$got" -ne '27') { Die "add: did not take the next serial number (got $got)" }
      $fl = @(Get-Content $f4); $p = [array]::FindIndex($fl, [Predicate[string]]{ $args[0] -match '^\| 25 \|' })
      if ($fl[$p + 1] -notmatch '^\| 27 \| late one \|') { Die "add: row not after the last stage" }
      ShouldFail 'would shift every column' { DoAdd 'a | b' }
      DoStage 27 '~' 'build:opus' ''
      if ([IO.File]::ReadAllText($old) -ne $before) { Die "F22: an existing run file was renumbered" }
      # Through -File, as the hooks call it: -Mode add -Title.
      $o = & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode add -Title 'via file' -Run $f4
      if ("$($o | Select-Object -Last 1)".Trim() -ne '28') { Die "-File: -Mode add did not print 28 (got $o)" }
      # No allocator: the old local rule, said on stderr, never silent.
      $env:RELAY_NEXT_ID = Join-Path $d3 'nope.ps1'
      try {
        $script:Dir = $sk; $script:Run = ''; $script:Title = 'fallback'; $script:Stages = 'z'
        $err = Join-Path $d3 'err.txt'
        # 5.1 turns a native stderr line into a terminating error under Stop.
        $ErrorActionPreference = 'Continue'
        try { & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode init -Plan p -Title fallback -Stages z -Dir $sk 2>$err | Out-Null }
        finally { $ErrorActionPreference = 'Stop' }
        if (-not (Select-String -Path $err -Pattern 'next-id.ps1 not found' -Quiet)) { Die "fallback: no stderr warning" }
        $ff = Get-ChildItem $sk -Filter 'run-*-fallback.md' | Select-Object -First 1
        if (-not $ff -or -not (Select-String -Path $ff.FullName -Pattern '^\| 29 \| z \|' -Quiet)) { Die "fallback: stage not local max + 1" }
      } finally { Remove-Item Env:RELAY_NEXT_ID }
    } else {
      [Console]::Error.WriteLine("note: next-id.ps1 not found beside the skills - F22 allocator checks skipped")
    }

    ChainSelftest $d
    "ok"
  } finally { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
}

try {
  # -Id names the run for every mode that touches one.
  if ($Id) {
    $f = Resolve-Run $Id
    if (-not $f -and $Mode -ne 'resume') { Die "no run matching '$Id' - see: -Mode list" }
    if ($f) { $Run = $f }
  }
  switch ($Mode) {
    'list'      { DoList }
    'resume'    { DoResume $Id }
    'init'      { DoInit }
    'add'       { DoAdd $Title }
    'stage'     { DoStage $N $State $Owner $Landed }
    'heartbeat' { DoHeartbeat $N }
    'status'    { DoStatus }
    'orphans'   { DoOrphans $Minutes }
    'chain'     {
      switch ($Action) {
        'plan'     { DoChainPlan $N }
        'dispatch' { DoChainDispatch $N }
        'hold'     { DoChainHold }
        'release'  { DoChainRelease }
        'wait'     { $r = DoChainWait; $r[1]; exit $r[0] }
        'status'   { DoChainStatus }
        'decide'   { ChainDecide (LevelLine) }
      }
    }
    'selftest'  { DoSelftest }
    default     { Die "unknown mode: $Mode (init|add|stage|heartbeat|status|orphans|chain|selftest)" }
  }
} catch {
  # Write-Error would itself throw under $ErrorActionPreference = 'Stop', making
  # the exit below unreachable and handing a -Command caller an exception.
  [Console]::Error.WriteLine("$_")
  # A refusal by a chain guard (held, 7-day stop, another driver) is exit 2,
  # same as relay-morpheus.sh, so a caller can tell "not now" from "broken".
  if ("$_" -like 'REFUSED:*') { exit 2 }
  exit 1
}
