# relay - bookkeeping for `.skillator/run.md`, the staged-run ledger.
#
# The PowerShell mirror of r2d2-relay.sh. Same commands, same file format, same
# refusals - `PLATFORMS.md` requires the pair to move together, and `selftest`
# on each side is what proves they still agree.
#
#   r2d2-relay.ps1 -Mode init -Plan <p> -Title <t> -Stages "alpha,beta,gamma"
#   r2d2-relay.ps1 -Mode stage -N 2 -State '~' [-Owner build:sonnet] [-Landed sha]
#   r2d2-relay.ps1 -Mode heartbeat -N 2
#   r2d2-relay.ps1 -Mode status
#   r2d2-relay.ps1 -Mode orphans [-Minutes 20]
#   r2d2-relay.ps1 -Mode selftest
#
# States: pending | '~' in flight | 'x' landed | '!' failed
#
# Two `-File` facts shape this signature, because `-File` is how this repo
# invokes every PS hook: it passes each argument as ONE literal string, so
# -Stages takes a delimited string and splits it here rather than relying on
# PowerShell array binding; and it drops empty-string arguments, so the pending
# state is spelled `pending` rather than ''.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Mode,
  [string]$Plan,
  [string]$Title,
  [string]$Stages,
  [int]$N,
  [string]$State = 'pending',
  [string]$Owner = '',
  [string]$Landed = '',
  [int]$Minutes = 20,
  [string]$Run = ''
)

$ErrorActionPreference = 'Stop'
if (-not $Run) { $Run = if ($env:RELAY_RUN) { $env:RELAY_RUN } else { '.skillator/run.md' } }

# Every timestamp is UTC and invariant-culture. Without this, a machine whose
# default calendar is not Gregorian (th-TH Buddhist, ar-SA Hijri) writes 2569
# for `yyyy`, and a run file touched by both mirrors mixes eras - which makes
# r2d2-relay.sh's age arithmetic return nonsense rather than fail.
$INV = [cultureinfo]::InvariantCulture
$FMT = "yyyy-MM-ddTHH:mmZ"

function Die($m) { throw "FAIL: $m" }
function Now { (Get-Date).ToUniversalTime().ToString($FMT, $INV) }
function AsUtc($s) { [datetime]::ParseExact($s, $FMT, $INV) }
function NeedRun { if (-not (Test-Path $Run)) { Die "no run file at $Run (r2d2-relay.ps1 -Mode init ...)" } }

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

# LF, no BOM, written to a sibling temp then moved - matching r2d2-relay.sh's
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
  if (Test-Path $Run) { Die "run file already exists: $Run (a run file is never overwritten)" }
  $names = @($Stages -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if (-not $names) { Die "no stage names in -Stages" }
  # A `|` in a stage name adds a column, and every later read is positional -
  # the state would land in the name cell and the sha in heartbeat, silently.
  foreach ($nm in $names) { if ($nm -match '\|') { Die "stage name contains '|', which would shift every column: $nm" } }
  $dir = Split-Path -Parent $Run
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $t = Now
  $id = "r" + (Get-Date).ToUniversalTime().ToString("yyMMddHHmm", $INV)
  $lines = @("# RUN $id - $Title", "plan: $Plan", "started: $t   updated: $t", "",
             "## Stages", "| # | stage | state | owner | heartbeat | landed |",
             "|---|-------|-------|-------|-----------|--------|")
  for ($i = 0; $i -lt $names.Count; $i++) { $lines += "| $($i + 1) | $($names[$i]) |   | - | - | - |" }
  $lines += @("", "## In flight", "", "## Rulings")
  WriteRun $lines
  $Run
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

    # The same rollovers r2d2-relay.sh asserts on its own arithmetic. DoOrphans does
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
    if (-not (Select-String -Path $f2 -Pattern '^\| 2 \| two \|' -Quiet)) { Die "-File: -Stages did not split" }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode stage -N 1 -State pending -Run $f2 | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "-File: -State pending failed" }

    "ok"
  } finally { Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
}

try {
  switch ($Mode) {
    'init'      { DoInit }
    'stage'     { DoStage $N $State $Owner $Landed }
    'heartbeat' { DoHeartbeat $N }
    'status'    { DoStatus }
    'orphans'   { DoOrphans $Minutes }
    'selftest'  { DoSelftest }
    default     { Die "unknown mode: $Mode (init|stage|heartbeat|status|orphans|selftest)" }
  }
} catch {
  # Write-Error would itself throw under $ErrorActionPreference = 'Stop', making
  # the exit below unreachable and handing a -Command caller an exception.
  [Console]::Error.WriteLine("$_")
  exit 1
}
