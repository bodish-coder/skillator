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
  [Parameter(Mandatory = $true)][ValidateSet('init','add','stage','heartbeat','status','orphans','list','resume','selftest')][string]$Mode,
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
  $t = Now
  $found = $false
  $out = Get-Content $Run | ForEach-Object {
    if ((RowNum $_) -eq $n) {
      $found = $true
      $c = $_ -split '\|'
      $c[3] = " $(if ($state -eq '') { ' ' } else { $state }) "
      if ($owner)  { $c[4] = " $owner " }
      $c[5] = " $t "
      if ($landed) { $c[6] = " $landed " }
      ($c -join '|')
    } else { $_ }
  }
  if (-not $found) { Die "no stage $n in $Run" }
  WriteRun $out
  StampUpdated
  } finally { Unlock }
}

# A heartbeat carries the row's existing `landed` back in. Without it the
# "x with no sha" guard fires on a stage that already landed, turning a no-op
# bookkeeping call from a late-reporting agent into a hard error.
function DoHeartbeat($n) {
  if (-not $n) { Die "usage: -Mode heartbeat -N <n>" }
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
    'selftest'  { DoSelftest }
    default     { Die "unknown mode: $Mode (init|add|stage|heartbeat|status|orphans|selftest)" }
  }
} catch {
  # Write-Error would itself throw under $ErrorActionPreference = 'Stop', making
  # the exit below unreachable and handing a -Command caller an exception.
  [Console]::Error.WriteLine("$_")
  exit 1
}
