# relay - bookkeeping for `.skillator/run.md`, the staged-run ledger.
#
# The PowerShell mirror of relay-morpheus.sh. Same commands, same file format, same
# refusals - `PLATFORMS.md` requires the pair to move together, and `selftest`
# on each side is what proves they still agree.
#
#   relay-morpheus.ps1 -Mode list                      every run + how to resume it
#   relay-morpheus.ps1 -Mode resume -Id 3              what a fresh session needs
#   relay-morpheus.ps1 -Mode init -Plan <p> -Title <t> -Stages "alpha,beta,gamma" [-RunOwner @h]
#   relay-morpheus.ps1 -Mode add -Title <stage>        append a row, print its number
#   relay-morpheus.ps1 -Mode stage -N 2 -State '~' [-Owner build:sonnet] [-Landed sha]
#   relay-morpheus.ps1 -Mode heartbeat -N 2
#   relay-morpheus.ps1 -Mode status
#   relay-morpheus.ps1 -Mode orphans [-Minutes 20]
#   relay-morpheus.ps1 -Mode owner [-Id 12] -Text @handle | -   F44: the run's owner, an @handle
#                                                      from .skillator/team.md (`-` clears it)
#   relay-morpheus.ps1 -Mode selftest
#
# Chain (F31) - stages that are ticket workflows, each started by the last:
#   -Mode chain -Action plan -N <n> -PromptFile F [-Tickets T] [-Fix t -Verify t] [-Files F] [-After "66,67"] [-ChainMode workflow|agents]
#   -Mode chain -Action dispatch -N <n> -Driver @tag [-Owner O] [-Take] [-Override] [-Confirmed]
#   -Mode chain -Action hold -Pct 84 [-Window 5h|7d] [-Next n]
#   -Mode chain -Action release [-Override [-Confirmed]]
#   -Mode chain -Action wait [-Interval 600] [-Max 19800] [-For 1500]
#   -Mode chain -Action status | decide [-Text "<level line>"]   F49: -Text decides on that line
#   -Mode chain -Action next                           NEXT n CODE | HOLD | ASK k | UNBLOCK Qk | WAIT n | BLOCKED n | FINAL, then IDLE lines
#   -Mode chain -Action next -Holds                    A118: only the IDLE <n> Qk <why> lines; read-only, no lease beat
#        (F80: a stage whose ticket someone else owns is IDLE <n> owned <ID> <owner> and its dispatch is
#        refused; plan and dispatch claim the stage's tickets - ticket-meta.ps1 pick / claim,
#        RELAY_TICKET_META overrides, a missing file = off)
#   -Mode chain -Action edge -N <n> -After "66,67" | -IndependentOf Qk -Why "<ruling>"
#
# Watchdog (F48) - one file, <main checkout>/.skillator/watchdog.hold = "<since> <reason>":
#   -Mode watchdog -Action hold -Reason "<reason>" | -Action release | -Action status
#        a hold refuses every new chain dispatch (and a GREEN baseline-harness `run`), exit 2,
#        until released; a second hold keeps its since. status: HELD <since> <reason> | CLEAR
#        (a hold file that exists holds: an empty one is HELD ? -). RELAY_DIR overrides the
#        place (-Dir does not); a git dir kept elsewhere uses the toplevel; outside git
#        ./.skillator of the location
#
# Marathon (F33, chain runs only) - questions only the user can answer are
# parked in `## Decisions` and asked together at the end (references/marathon.md):
#   -Mode park -N <stage> -Ticket T -Reason taste|fact|conflict -Question "...?" -Header H
#        -Option1 "label | does | hurts" -Option2 ... [-Option3 -Option4] -Default L [-Recommended L]
#        -Files "a, b" [-Blocks "F2b, F5"] [-Gated "..."] [-Done "..."] -Stop none   (-N 0: planning)
#   -Mode answer -Q Qk -Text "<answer>" | -Ruled | -Replanned <n> | -Moot "<why>" | -SameAs Qj
#   -Mode queue [-MarkAsked] [-Asks live|end]
# Exit 2 = refused by a usage/driver/state guard; wait: 0 RELEASE, 2 STOP (the
# 7-day stop - nothing to wait for), 3 STUCK, 4 UNOBSERVABLE, 5 WAITING
# (re-arm). $env:RELAY_CHAIN_HOLD_PCT (80),
# RELAY_CHAIN_WEEKLY_PCT (90), RELAY_CHAIN_DRIVER_STALE (20 min),
# RELAY_LEVEL_CMD (replaces `usage-watch.ps1 -Mode level`, for tests).
#
# Any mode takes an optional -Id: `-Mode status -Id 3`.
#
# States: pending | '~' in flight | 'x' landed | '!' failed | '?' parked (no
# item passed, at least one waits on a decision) | '>' re-planned (landed
# names the new stage: `stage 71`)
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
  [Parameter(Mandatory = $true)][ValidateSet('init','add','stage','heartbeat','status','orphans','list','resume','chain','park','answer','queue','board','queue-run','land','away','owner','watchdog','selftest')][string]$Mode,
  [ValidateSet('plan','dispatch','hold','release','wait','status','decide','next','merge','edge')][string]$Action = 'status',
  [string]$Ticket = '',
  [string]$Reason = '',
  [string]$Question = '',
  [string]$Header = '',
  [string]$Option1 = '',
  [string]$Option2 = '',
  [string]$Option3 = '',
  [string]$Option4 = '',
  [string]$Default = '',
  [string]$Recommended = '',
  [string]$Blocks = '',
  [string]$Stop = '',
  [string]$Done = '',
  [string]$Gated = '',
  [string]$After = '',
  [string]$IndependentOf = '',
  [string]$Why = '',
  [string]$Q = '',
  [string]$Text = '',
  [switch]$Ruled,
  [string]$Replanned = '',
  [string]$Moot = '',
  [string]$SameAs = '',
  [switch]$MarkAsked,
  [string]$Asks = '',
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
  [switch]$Here,
  [switch]$All,
  [switch]$Holds,
  [string]$Sub = '',
  [string]$Mark = $null,
  [int]$N,
  [string]$State = 'pending',
  [string]$Owner = '',
  [string]$RunOwner = '',
  [string]$Landed = '',
  [int]$Minutes = 20,
  [string]$Run = '',
  [string]$Id = '',
  [string]$Dir = ''
)

$ErrorActionPreference = 'Stop'
if (-not $Dir) { $Dir = if ($env:RELAY_DIR) { $env:RELAY_DIR } else { '.skillator' } }
# git, never throwing: $true when it exited 0. Output discarded.
function GitOk([string[]]$a) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & git @a 2>&1 | Out-Null; return ($LASTEXITCODE -eq 0) } catch { return $false } finally { $ErrorActionPreference = $prev }
}
function GitOut([string[]]$a) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $o = @(& git @a 2>$null); if ($LASTEXITCODE -ne 0) { return @() }; return $o } catch { return @() } finally { $ErrorActionPreference = $prev }
}
# The main checkout's root, from any worktree of it; $null outside git.
# $mainFrom, if given, is where to ask git from (git -C).
function MainOf([string]$mainFrom = '') {
  $ga = @('rev-parse', '--path-format=absolute', '--git-common-dir')
  if ($mainFrom) { $ga = @('-C', $mainFrom) + $ga }
  $c = @(GitOut $ga)
  if ($c.Count -and $c[0] -match '/\.git$') { return ($c[0] -replace '/\.git$', '') }
  return $null
}
# F35 (D1): one ledger view for every session - from a linked worktree (a run's
# own, say) the run files are the MAIN checkout's .skillator, never a copy on
# the run branch. One git call; RELAY_DIR or -Dir overrides.
if (-not $env:RELAY_DIR -and -not $PSBoundParameters.ContainsKey('Dir')) {
  $rp = @(GitOut @('rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'))
  if ($rp.Count -ge 2) {
    if ($rp[0] -match '/\.git$' -and ($rp[0] -replace '/\.git$', '') -ne $rp[1]) { $Dir = ($rp[0] -replace '/\.git$', '') + '/.skillator' }
  } elseif (GitOk @('rev-parse', '--git-dir')) {
    [Console]::Error.WriteLine("relay-morpheus.ps1: git older than 2.31 (no --path-format) - one ledger per worktree and no run worktrees")
  }
}
if (-not $Run -and $env:RELAY_RUN) { $Run = $env:RELAY_RUN }

# A run id is a short number a human can say out loud to another session -
# "continue RUN-3". The timestamp ids this replaces were unsayable, which made
# handing a run over a copy-paste of a path instead of a sentence.
function RunFiles {
  if (-not (Test-Path $Dir)) { return @() }
  # F44: in run-number order (run-0012 after run-2), a bare run.md last.
  @(Get-ChildItem $Dir -Filter 'run*.md' -File -ErrorAction SilentlyContinue |
    Sort-Object @{ Expression = { $k = RunNum (([IO.Path]::GetFileNameWithoutExtension($_.Name) -creplace '^run-', '') -replace '-.*$', ''); if ($null -eq $k) { [int64]::MaxValue } else { $k } } }, Name)
}
# F44: a run is named RUN-0012 - the serial number zero-padded to four digits
# (more past 9999, never cut), in its file, header, branch, worktree and queue
# row. Runs named before that (run-12-*.md, `# RUN-12`) keep working: every
# spelling reads to its bare number, and every id printed is padded.
# 12 | RUN-12 | run-0012 | Run-0012 (the prefix in any case) -> 12; $null on
# anything else, or past 9 digits.
function RunNum($v) {
  $s = "$v" -replace '^RUN-', ''
  if ($s -notmatch '\A[0-9]+\z') { return $null }
  $s = $s.TrimStart('0'); if (-not $s) { $s = '0' }
  if ($s.Length -gt 9) { return $null }
  [int64]$s
}
# Two spellings of one run (RUN-7, RUN-0007), by number.
function SameRun($a, $b) { if ("$a" -ceq "$b") { return $true }; $x = RunNum $a; $y = RunNum $b; ($null -ne $x) -and ($x -eq $y) }
function PadId($v) { $k = RunNum $v; if ($null -eq $k) { return '' }; $k.ToString('0000', [cultureinfo]::InvariantCulture) }
# RUN-12 -> RUN-0012; anything else as it is.
function CanonTag($v) { $p = PadId $v; if ($p) { "RUN-$p" } else { "$v" } }
# The id out of a filename, with no regex to get wrong - printed padded (F44).
function IdOf($path) {
  $b = [IO.Path]::GetFileNameWithoutExtension($path)
  if (-not $b.StartsWith('run-')) { return '' }
  $b = $b.Substring(4).Split('-')[0]
  if ($b -match '^\d+$') { return (PadId $b) }
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

# RUN-3, run-3, 3, RUN-0003 and a path all resolve to the same file, because
# whoever types it next is working from memory of a conversation. A run named
# before F44 (run-3-*.md) is found by the padded spelling too.
function Resolve-Run($spec) {
  if ($spec -match '[\/]' -and (Test-Path $spec)) { return (Resolve-Path $spec).Path }
  $p = PadId ($spec -replace '\D', '')
  if (-not $p) { return $null }
  foreach ($f in RunFiles) { if ((IdOf $f.Name) -ceq $p) { return $f.FullName } }
  $null
}
# F44: a run's owner is an @handle from tickets-zordon's team file, found as
# ticket-meta.ps1's Get-TeamFile finds it: <worktree top>/.skillator/team.md,
# then <main checkout>/.skillator/team.md; lines `- @asha: asha@x.com`.
# Without one, any well-formed handle.
function TeamFile {
  $top = @(GitOut @('rev-parse', '--show-toplevel'))
  if (-not $top.Count) { return $null }
  $mr = MainOf; if (-not $mr) { $mr = $top[0] }
  foreach ($r in @($top[0], $mr)) { $f = "$r/.skillator/team.md"; if (Test-Path -LiteralPath $f -PathType Leaf) { return $f } }
  $null
}
function OwnerCheck($h) {
  if ("$h" -match "[`r`n]") { Die "owner: '$h' is more than one line - give one @handle" }
  if ("$h" -cnotmatch '^@[A-Za-z0-9_.-]+$') { Die "owner: '$h' is not an @handle (@name)" }
  $tf = TeamFile
  if ($tf) {
    $known = @(Get-Content -Encoding UTF8 -LiteralPath $tf | ForEach-Object { if ($_ -match '^[ \t]*[-*][ \t]*(@[A-Za-z0-9_.-]+)[ \t]*:') { $Matches[1] } })
    if ($known -cnotcontains $h) { Die "owner: $h is not in $tf - add them there first" }
  } else { [Console]::Error.WriteLine("note: no .skillator/team.md - owner $h taken as written, not checked against a team") }
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
# The lock is a FILE made by an exclusive create (CreateNew) that holds its
# holder, `<pid> ps1`, written through the same handle - taking it and naming
# the holder are one step. ponytail: a spin with a stale timeout, not a lock
# manager.
$script:Lock = $null
$LockMe = "$PID ps1"
# A115: the lock was a dir with its pid written after, and every race review
# found lived in that gap or in a check-then-delete. Now there is no pidless
# window, and breakers take turns: a break holds "$Lock.break" (same exclusive
# create), re-judges the lock under it, renames it away and deletes it.
# A124: the A115 version also broke a LIVE holder (the 30s force path) and gave
# back by rename whatever it took by mistake - and a give-back that lost to a
# fresh creator deleted a live lock: two holders. A `.break` left by a crashed
# breaker of the other port was never judged dead, so every waiter spun
# forever. So a live holder is never broken - the same rules as
# relay-morpheus.sh:
# - stale = older than $LockStaleS and either empty (it died between the create
#   and the write) or `<pid> ps1` whose process is gone;
# - any holder at all - a sh holder's MSYS pid, which Get-Process cannot see, a
#   reused pid - once its file is older than $LockDeadS. One hold is a single
#   read-modify-write, milliseconds; a holder alive past a minute is not.
# `.break` is judged by the same rules, and released only while it still holds
# our id. A broken lock was judged dead under the break turn, and a dead holder
# cannot release it, so what the rename takes is what was judged. ponytail:
# everything that can still double-hold needs a holder suspended past
# $LockDeadS inside its milliseconds: it can be broken live, its unlock can
# then remove a newer lock, and a give-back that loses to a fresh creator
# leaves two holders. A lock DIR left by a version before A115 is stale once
# older than $LockStaleS. ponytail: drop the dir case one release after A115.
$LockStaleS = 10
$LockDeadS = 60
# Every read shares Delete, so a reading waiter never fails the holder's
# release or a breaker's rename. $null: unreadable; '': empty.
function LockRead($p) {
  if (Test-Path -LiteralPath $p -PathType Container) {
    $p = Join-Path $p 'pid'; if (-not (Test-Path -LiteralPath $p)) { return '' } }
  try { $s = [IO.File]::Open($p, 'Open', 'Read', 'ReadWrite, Delete') } catch { return $null }
  try { (New-Object IO.StreamReader($s)).ReadToEnd().Trim() } catch { $null } finally { $s.Dispose() }
}
# $true when $p is still the stale lock judged as holding $judged.
function LockDead($p, $judged) {
  $f = $p; $dir = Test-Path -LiteralPath $p -PathType Container
  if ($dir -and (Test-Path -LiteralPath (Join-Path $p 'pid'))) { $f = Join-Path $p 'pid' }
  try { $age = ((Get-Date) - (Get-Item -LiteralPath $f -Force -ErrorAction Stop).LastWriteTime).TotalSeconds } catch { return $false }
  if ($age -le $LockStaleS) { return $false }
  if ($dir) { return $true }
  $now = LockRead $p
  if ($null -eq $now -or $now -cne $judged) { return $false }
  if ($judged -eq '' -or $age -gt $LockDeadS) { return $true }
  if ($judged -notmatch '^(\d{1,9}) ps1$') { return $false }
  return -not (Get-Process -Id ([int]$Matches[1]) -ErrorAction SilentlyContinue)
}
function LockCreate($p) {
  try { $s = [IO.File]::Open($p, 'CreateNew', 'Write', 'None') } catch { return $false }
  try { $b = [Text.Encoding]::ASCII.GetBytes("$LockMe`n"); $s.Write($b, 0, $b.Length); $s.Dispose() }
  catch { $s.Dispose(); try { [IO.File]::Delete($p) } catch {}; throw }
  return $true
}
# Rename $p away, then delete it. Re-judged once renamed; a lock that is not
# the one judged (only possible when a holder suspended past $LockDeadS
# released inside this break) is moved back.
function LockSteal($p, $judged) {
  $b = "$p.broken.$PID"
  if (Test-Path -LiteralPath $b) { Remove-Item -LiteralPath $b -Recurse -Force -ErrorAction SilentlyContinue }
  try { [IO.Directory]::Move($p, $b) } catch { return }   # gone: released, or broken already
  if (-not (Test-Path -LiteralPath $b -PathType Container)) {
    $now = LockRead $b
    if ($null -ne $now -and $now -cne $judged) {
      try { [IO.File]::Move($b, $p); return } catch {}
    }
  }
  Remove-Item -LiteralPath $b -Recurse -Force -ErrorAction SilentlyContinue
}
function LockBreak($judged) {
  $g = "$($script:Lock).break"
  if (-not (LockCreate $g)) {
    $c = LockRead $g; if ($null -ne $c -and (LockDead $g $c)) { LockSteal $g $c }
    return
  }
  try { if (LockDead $script:Lock $judged) { LockSteal $script:Lock $judged } }
  finally { for ($k = 0; $k -lt 20 -and (LockRead $g) -ceq $LockMe; $k++) { try { [IO.File]::Delete($g) } catch { Start-Sleep -Milliseconds 20 } } }
}
function Lock([string]$path = '') {
  if (-not $path) { $path = "$Run.lock" }
  $script:Lock = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($path)
  $i = 0
  while (-not (LockCreate $script:Lock)) {
    $i++
    if ($i % 10 -eq 1) {
      $cur = LockRead $script:Lock
      if ($null -ne $cur -and (LockDead $script:Lock $cur)) { LockBreak $cur }
    }
    Start-Sleep -Milliseconds 100
  }
}
# Ours (it reads as $LockMe) is deleted; someone else's is left; a failed read
# or a sharing violation is retried. Only a hold past $LockDeadS can be
# broken, so ours cannot turn over between that read and the delete otherwise.
function Unlock {
  if ($script:Lock) {
    for ($k = 0; $k -lt 40 -and (Test-Path -LiteralPath $script:Lock); $k++) {
      $cur = LockRead $script:Lock
      if ($null -ne $cur -and $cur -cne $LockMe) { break }
      if ($cur -ceq $LockMe) { try { [IO.File]::Delete($script:Lock); break } catch {} }
      Start-Sleep -Milliseconds 50
    }
  }
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
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object {
    if ($_ -match '^started: ') { $_ -replace 'updated: .*', "updated: $t" } else { $_ }
  })
}

function RowNum($line) {
  if ($line -match '^\|\s*(\d+)\s*\|') { return [int]$Matches[1] }
  return $null
}

function Cell($line, $i) { ($line -split '\|')[$i].Trim() }

# A129: a run or stage worktree sits under <repo>/.skillator/worktrees/, and
# its files' paths can pass Windows' 260-character limit ("Filename too
# long"), so every worktree is created with core.longpaths on, and keeps it
# in its config.
function WtAdd($at, [string[]]$a) { GitOk (@('-c', 'core.longpaths=true', '-C', $at, 'worktree', 'add') + $a) }
function WtLongPaths($wt) { $null = GitOk @('-C', $wt, 'config', 'core.longpaths', 'true') }
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
  if ($RunOwner) { OwnerCheck $RunOwner }
  if (-not $script:Run) {
    if (-not (Test-Path $Dir)) { New-Item -ItemType Directory -Force $Dir | Out-Null }
    $script:id = PadId ((Alloc 'RUN' 1 $Dir)[0])   # F44: RUN-0012, in every name made below
    $script:Run = Join-Path $Dir ("run-{0}-{1}.md" -f $script:id, (Slug $Title))
  } else {
    $script:id = IdOf $script:Run; if (-not $script:id) { $script:id = '0001' }
  }
  if (Test-Path $Run) { Die "run file already exists: $Run (a run file is never overwritten)" }
  $dir = Split-Path -Parent $Run
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  # Stage numbers continue after the highest any run has used, so "stage 24"
  # names one stage in the whole project, not one per run.
  if (-not $dir) { $dir = '.' }
  $nums = Alloc 'S' $names.Count $dir
  $id = $script:id
  # F35: the run's own worktree and branch, so its stages commit there and
  # never in an index another run shares. Off with -Here, outside git, before
  # the first commit, or RELAY_WORKTREE=off.
  $wt = ''; $br = ''
  # It branches from the caller's HEAD - the branch the user is on - and an
  # uncommitted plan file is copied in, so the stages can read what they build.
  if (-not $Here -and $env:RELAY_WORKTREE -cne 'off') {
    $mr = MainOf
    $hd = @(GitOut @('rev-parse', '-q', '--verify', 'HEAD'))
    if ($mr -and $hd.Count) {
      $sl = Slug $Title
      # A126: inside the repo, where the session's allowed folders reach - a
      # sibling <repo>.runs/ left every dispatched agent's shell refused. The
      # `*` .gitignore keeps the checkouts out of git, grep and codegraph.
      $wd = "$mr/.skillator/worktrees"; if (-not (Test-Path -LiteralPath $wd)) { New-Item -ItemType Directory -Force $wd | Out-Null }
      if (-not (Test-Path -LiteralPath "$wd/.gitignore")) { [IO.File]::WriteAllText("$wd/.gitignore", "*`n", (New-Object Text.UTF8Encoding($false))) }
      $br = "run/RUN-$id-$sl"; $wt = "$wd/RUN-$id-$sl"
      if (-not (WtAdd $mr @('-q', '-b', $br, $wt, $hd[0]))) { Die "could not create the run worktree $wt on branch $br (use -Here to run in this checkout)" }
      WtLongPaths $wt
      if ((Test-Path -LiteralPath $Plan -PathType Leaf) -and @(GitOut @('status', '--porcelain', '--', $Plan)).Count) {
        $pr = @(GitOut @('ls-files', '--full-name', '--others', '--cached', '--', $Plan))
        $rel = if ($pr.Count) { $pr[0] } else { (@(GitOut @('rev-parse', '--show-prefix')) + @(''))[0] + ($Plan -replace '\\', '/') }
        $dst = "$wt/$rel"; New-Item -ItemType Directory -Force (Split-Path -Parent $dst) | Out-Null
        Copy-Item -LiteralPath $Plan -Destination $dst
        [Console]::Error.WriteLine("note: $Plan is not committed - copied into the run worktree")
      }
    }
  }
  $t = Now
  $lines = @("# RUN-$id - $Title", "plan: $Plan", "started: $t   updated: $t")
  if ($wt) { $lines += @("worktree: $wt", "branch: $br") }
  if ($RunOwner) { $lines += "owner: $RunOwner" }
  $lines += @("",
             "## Stages", "| # | stage | state | owner | heartbeat | landed |",
             "|---|-------|-------|-------|-----------|--------|")
  for ($i = 0; $i -lt $names.Count; $i++) { $lines += "| $($nums[$i]) | $($names[$i]) |   | - | - | - |" }
  $lines += @("", "## In flight", "", "## Rulings")
  WriteRun $lines
  $Run
  # The whole point of the id: this line is what gets pasted into another
  # session, or said out loud. A path is not a sentence.
  "hand this to any session:  continue RUN-$id"
  if ($wt) { "stages work and commit in:  $wt  (branch $br)" }
}

# F35: a run's worktree, recreated from its branch when the directory is gone
# (deleted, another machine). '' for a -Here run.
# <run file> <key>: a header field - the lines before the first `## `.
function HdrField($f, $k) {
  foreach ($l in (Get-Content -Encoding UTF8 $f)) { if ($l -like '## *') { break }; if ($l -like "${k}: *") { return $l.Substring($k.Length + 2) } }
  ''
}
function WorktreeOf($f) {
  $w = HdrField $f 'worktree'; $b = HdrField $f 'branch'
  if (-not $w) { return '' }
  # Recreated only while the run has open work: a finished run's branch is
  # merged, and a fresh checkout of it helps nobody. The prune drops the
  # missing worktree's registration, which `worktree add` would refuse.
  $open = @(Get-Content -Encoding UTF8 $f | Where-Object { $null -ne (RowNum $_) -and (Cell $_ 3) -ne 'x' -and (Cell $_ 3) -ne '>' }).Count
  if (-not (Test-Path -LiteralPath $w) -and $b -and $open) {
    $mr = MainOf
    if ($mr) {
      $null = GitOk @('-C', $mr, 'worktree', 'prune')
      if (WtAdd $mr @('-q', $w, $b)) { WtLongPaths $w; [Console]::Error.WriteLine("# worktree recreated from $b") }
      else { return "$w  (branch $b) - MISSING: git could not recreate it" }
    }
  }
  if (-not (Test-Path -LiteralPath $w)) { return "$w  (branch $b) - MISSING" }
  "$w  (branch $b)"
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
    $lines = @(Get-Content -Encoding UTF8 $Run)
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
    $lines = Get-Content -Encoding UTF8 $f.FullName
    $title = ($lines[0] -replace '^# RUN[-a-zA-Z0-9]* *- *', '')
    $plan  = ($lines[1] -replace '^plan: *', '')
    $tot = 0; $dn = 0; $open = @()
    foreach ($l in $lines) {
      $n = RowNum $l
      if ($null -ne $n) {
        $tot++
        $st = Cell $l 3
        # A `>` row is closed - its work moved to the stage it names.
        if ($st -eq 'x' -or $st -eq '>') { $dn++ }
        if ($st -eq '~' -or $st -eq '!' -or $st -eq '?') { $open += $n }
      }
    }
    $row = "RUN-{0}  {1,-42}  {2}/{3} done" -f $id, $title, $dn, $tot
    if ($open) { $row += "  (stage $($open -join ',') open)" }
    $row
    "          plan: $plan"
    $ow = HdrField $f.FullName 'owner'
    if ($ow) { "          owner: $ow" }
    $wl = HdrField $f.FullName 'worktree'
    if ($wl) { "          worktree: $wl" }
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
  $w = WorktreeOf $f
  if ($w) { "# Stages work and commit in: $w" }
  $ow = HdrField $f 'owner'
  if ($ow) { "# Run owner: $ow" }
  ""
  Get-Content -Encoding UTF8 $f
}

# Keyed by stage number, so a redispatch rewrites its row instead of appending
# a second one - that is what makes a resume idempotent.
function DoStage($n, $state, $owner, $landed) {
  if (-not $n) { Die "usage: -Mode stage -N <n> -State <s> [-Owner o] [-Landed l]" }
  if ($state -eq 'pending') { $state = '' }
  if ($state -notin @('', '~', 'x', '!', '?', '>')) { Die "unknown state: $state (one of pending ~ x ! ? >)" }
  # Same reason `init` refuses it in a stage name: a `|` adds a column, and the
  # next positional read writes state into the wrong cell. `landed` takes a
  # path, so this is reachable without an exotic owner string.
  foreach ($v in @($owner, $landed)) { if ($v -match '\|') { Die "'|' in owner/landed would shift every column: $v" } }
  if ($state -eq 'x' -and -not $landed) {
    Die "stage $n marked landed with no sha or path - that is the lie the next session believes"
  }
  # F33: a re-planned row is closed, so it names where its work went.
  if ($state -eq '>' -and -not $landed) {
    Die "stage $n marked re-planned with no 'stage <new>' - a closed row names where its work went"
  }
  NeedRun
  Lock
  try {
    if (-not (SetRow $n $state $owner $landed)) { Die "no stage $n in $Run" }
    # A153: a landed or re-planned stage is no longer in flight; a failed one keeps its block.
    if ($state -ceq 'x' -or $state -ceq '>') { DropInFlight $n }
    StampUpdated
  } finally { Unlock }
  # F36: any state but in flight frees the stage's files (landed, failed,
  # re-planned, parked, reset). Chain runs only; never fails the landed write.
  if ($state -cne '~' -and (HasChain)) { try { LeaseRelease $n } catch { [Console]::Error.WriteLine("note: lease release failed: $_") } }
}

# Rewrite row <n>'s state/owner/heartbeat/landed ('' state = pending). The
# caller holds the lock; $false when there is no such row.
function SetRow($n, $state, $owner, $landed) {
  $t = Now
  $found = $false
  $out = foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
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
  Get-Content -Encoding UTF8 $Run | ForEach-Object {
    if ((RowNum $_) -eq $n) {
      $st = Cell $_ 3
      $la = Cell $_ 6
      if ($la -eq '-') { $la = '' }
    }
  }
  if ($null -eq $st) { Die "no stage $n in $Run" }
  if ($st -eq '') { $st = 'pending' }
  DoStage $n $st '' $la
  if ($st -ceq '~' -and (HasChain) -and @(StageFiles $n).Count) {
    $k = try { LeaseBeat $n } catch { $null }
    if ($k -eq 0) { [Console]::Error.WriteLine("WARNING: stage $n holds no lease on its files any more - another run took it as stale and may be editing them; tell the user before landing") }
  }
  # F31: the driver's own heartbeat keeps its stamp fresh - a live driver in a
  # 40-minute stage is not stale. Anyone else's leaves the stamp alone.
  if (IsMe) { Lock; try { TouchDriver; StampUpdated } finally { Unlock } }
}

function DoStatus {
  PickRun
  if (-not (Test-Path $Run)) { return }
  $ow = HdrField $Run 'owner'
  if ($ow) { "owner: $ow" }
  $on = $false
  Get-Content -Encoding UTF8 $Run | ForEach-Object {
    if ($_ -match '^## Stages')        { $on = $true }
    elseif ($_ -match '^## In flight') { $on = $false }
    if ($on) { $_ }
  }
}

# F44: -Text @handle writes (or replaces) the run's `owner:` header line,
# -Text - removes it - under the run lock, header only (before the first `## `).
function DoOwner {
  $v = $Text
  if (-not $v) { Die "usage: -Mode owner [-Id n] -Text @handle | -" }
  NeedRun
  if ($v -ceq '-') { $v = '' } else { OwnerCheck $v }
  Lock
  try {
    $lines = @(Get-Content -Encoding UTF8 $Run)
    $hd = $lines.Count; for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i].StartsWith('## ')) { $hd = $i; break } }
    $o = -1; $last = -1
    for ($i = 0; $i -lt $hd; $i++) { if ($o -lt 0 -and $lines[$i].StartsWith('owner: ')) { $o = $i }; if ($lines[$i] -ne '') { $last = $i } }
    $out = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($i -eq $o) { if ($v) { $out.Add("owner: $v") }; continue }
      $out.Add($lines[$i])
      if ($o -lt 0 -and $i -eq $last -and $v) { $out.Add("owner: $v") }
    }
    WriteRun $out
    StampUpdated
  } finally { Unlock }
  $rt = "RUN-$(IdOf (Split-Path -Leaf $Run))"
  if ($v) { "$rt owner: $v" } else { "$rt owner cleared" }
}

# The network-loss list: in-flight rows nobody has heard from. A dropped agent
# sends no error, it just stops reporting, so silence is the only signal.
function DoOrphans($limit) {
  PickRun
  if (-not (Test-Path $Run)) { return }
  $t = AsUtc (Now)
  $any = $false
  Get-Content -Encoding UTF8 $Run | ForEach-Object {
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

# F49: -Text decides on a reading the caller already has (the ops-board
# mod's, from the host) - the same table, never re-made.
function DoChainDecide { if ($Text) { ChainDecide $Text } else { ChainDecide (LevelLine) } }

function ChainHdr {
  $on = $false
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
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
  $out = foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if ($l -ceq '## Chain') { $on = $true }
    if ($on -and -not $done -and $l -match '^driver: ') { $done = $true; "driver: $drv${SEP}hold: $hold${SEP}mode: $mode" } else { $l }
  }
  WriteRun $out
}

function RowCellN($n, $i) {
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ((RowNum $l) -eq [int]$n) { return (Cell $l $i) } }
  $null
}
function CodeOf($n) {
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -cmatch "^### ([A-Z0-9]{4}) - stage $n - ") { return $Matches[1] } }
  $null
}
# The prompt of stage <n>'s chain block, verbatim: the lines under
# `prompt: |` up to the next heading, two-space indent removed, trailing
# blanks dropped. One string, lines joined by LF.
function BlockPrompt($n) {
  $inb = $false; $inp = $false; $buf = New-Object System.Collections.Generic.List[string]
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if (-not $inb) { if ($l -cmatch "^### [A-Z0-9]{4} - stage $n - ") { $inb = $true }; continue }
    if ($l -match '^#') { break }
    if (-not $inp) { if ($l -ceq 'prompt: |') { $inp = $true }; continue }
    $buf.Add(($l -replace '^  ', ''))
  }
  while ($buf.Count -gt 0 -and $buf[$buf.Count - 1] -eq '') { $buf.RemoveAt($buf.Count - 1) }
  $buf -join "`n"
}
function Indent($text) { @("$text" -split "`n" | ForEach-Object { if ($_ -eq '') { '' } else { "  $_" } }) }

# Remove stage <n>'s block from `## In flight`: its `### stage <n> - ` line up
# to the next heading. A redispatch of a failed stage replaces its block - a
# second block beside the first left two prompts and a dead `run:` id, and a
# resume read the first one.
function DropInFlight($n) {
  $sec = $false; $skip = $false
  $out = foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
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
  $lines = @(Get-Content -Encoding UTF8 $Run); $on = $false; $last = -1
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
  $lines = @(Get-Content -Encoding UTF8 $Run); $h = "## $sec"
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

# F80: tickets-zordon's ticket-meta.ps1 - who may take a chain's tickets (pick) and
# the claim a plan or dispatch makes (claim). RELAY_TICKET_META overrides (a missing
# file = off: no skips, no claims). A child process, in the run file's directory.
function TMeta([string[]]$a) {
  $tm = $env:RELAY_TICKET_META
  if (-not $tm) { $tm = Join-Path $PSScriptRoot '..\..\tickets-zordon\scripts\ticket-meta.ps1' }
  if (-not (Test-Path -LiteralPath $tm -PathType Leaf)) { return $null }
  $psi = New-Object Diagnostics.ProcessStartInfo 'powershell'
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$tm`" " + (@($a | ForEach-Object { "`"$_`"" }) -join ' ')
  $psi.WorkingDirectory = Split-Path -Parent (Resolve-Path -LiteralPath $Run).Path
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
  # no host to start = a failed call (OwnedMap fails closed on it); stderr read
  # beside stdout, so a full stderr pipe cannot stall the child
  try { $p = [Diagnostics.Process]::Start($psi) } catch { return [pscustomobject]@{ out = @(); err = "cannot start powershell: $($_.Exception.Message)"; code = -1 } }
  $et = $p.StandardError.ReadToEndAsync()
  $o = $p.StandardOutput.ReadToEnd(); $p.WaitForExit(); $e = $et.Result
  [pscustomobject]@{ out = @($o -split "`r?`n" | Where-Object { $_ }); err = $e.Trim(); code = $p.ExitCode }
}
function ChainTickets($n) {   # stage n's chain-block ticket ids (every stage's when none)
  $sec = ''; $b = $false; $seen = @{}; $ids = New-Object System.Collections.Generic.List[string]
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if ($l.StartsWith('## ')) { $sec = $l; $b = $false; continue }
    if ($sec -cne '## Chain') { continue }
    if ($l.StartsWith('### ')) { $b = (-not $n) -or ($l -cmatch "^### [A-Z0-9]+ - stage $n - "); continue }
    if ($b -and $l.StartsWith('tickets: ')) { foreach ($t in @(IdsOf $l.Substring(9))) { if ($t -cmatch '^[A-Z]{1,3}[0-9]+[a-z]?$' -and -not $seen.ContainsKey($t)) { $seen[$t] = 1; $ids.Add($t) } } }
  }
  $ids.ToArray()
}
function OwnedMap($n) {   # ID -> owner, per ticket (stage n's, else the chain's) someone else owns
  $m = @{}
  $ids = @(ChainTickets $n)
  if (-not $ids.Count) { return $m }
  $r = TMeta (@('pick') + $ids)
  if ($r -and $r.code -eq 0) { foreach ($l in $r.out) { if ($l -cmatch '^skip (\S+) (\S+)$') { $m[$Matches[1]] = $Matches[2] } } }
  elseif ($r) {
    # who owns them is unknown and there is a team: none of them starts (fail closed)
    Push-Location -LiteralPath (Split-Path -Parent (Resolve-Path -LiteralPath $Run).Path)
    try { $tf = TeamFile } finally { Pop-Location }
    if ($tf) {
      [Console]::Error.WriteLine("note: ticket-meta pick failed ($(($r.err -split "`r?`n") -join ' ')) - stages with tickets wait")
      foreach ($t in $ids) { $m[$t] = '?' }
    }
  }
  $m
}
function ClaimStage($n) {   # claim stage n's tickets for this session's person; a refusal is a note
  $ids = @(ChainTickets $n)
  if (-not $ids.Count) { return }
  $r = TMeta (@('claim') + $ids)
  if ($r -and $r.code -ne 0) { foreach ($l in @($r.err -split "`r?`n" | Where-Object { $_ })) { [Console]::Error.WriteLine("note: claim refused - $l") } }
}

function DoChainPlan($n) {
  if (-not $n) { Die 'usage: -Mode chain -Action plan -N <n> -PromptFile F [-Tickets T] [-Fix t -Verify t] [-Files F] [-ChainMode workflow|agents]' }
  if (-not $PromptFile -or -not (Test-Path -LiteralPath $PromptFile -PathType Leaf) -or (Get-Item -LiteralPath $PromptFile).Length -eq 0) {
    Die "chain plan: -PromptFile with the stage's exact prompt is required - the prompt is on disk before the agent exists"
  }
  if ($ChainMode -notin @('workflow', 'agents')) { Die "chain plan: -ChainMode is workflow or agents, not $ChainMode" }
  NeedRun
  $af = if ($After) { AfterList $n $After } else { '' }
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
    if ($af) { $blk += "after: $af" }
    $blk += 'prompt: |'; $blk += (Indent $text)
    # The code goes in front of the stage cell: the column count does not
    # change, so every positional reader still works.
    WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object {
      if ((RowNum $_) -eq [int]$n) { $p = $_ -split '\|'; $p[2] = " $code $($p[2].TrimStart())"; $p -join '|' } else { $_ }
    })
    PutInSection 'Chain' $blk "driver: -${SEP}hold: -${SEP}mode: $ChainMode"
    StampUpdated
  } finally { Unlock }
  ClaimStage $n   # F80: planning a ticket claims it
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
  # F48: a watchdog hold (disk or memory red) refuses every new stage, before
  # any lease or lock is taken.
  $wdHold = WdRead (Split-Path -Parent $Run)
  if ($wdHold) { Refuse "watchdog hold ($($wdHold.why)) - clear the cause, then /ops resume or relay-morpheus watchdog release" }
  $d = ChainDecide (LevelLine)
  # F36: the stage's files are leased BEFORE the run lock - the registry wait
  # must never stretch a run-lock hold - and given back if the dispatch is then
  # refused or dies. A stage with no files: line could touch anything, so it
  # waits while another run holds any live lease.
  $leased = $false; $took = @()
  if ((RowCellN $n 3) -cin @('', '!') -and (HasChain) -and (CodeOf $n)) {
    $files = @(StageFiles $n)
    if ($files.Count) {
      $r = RunTag; $stl = LeaseStale; $tn = Now
      $res = LeaseLocked { param($reg)
        $keep = @(); $hit = ''; $tk = @()
        foreach ($z in @(LeaseRead $reg)) {
          if ((SameRun $z.r $r) -and $z.s -ceq "$n") { continue }
          if (-not (SameRun $z.r $r) -and @($files | Where-Object { PathsMeet $z.p $_ }).Count) {
            $a = LeaseAge $z.h
            if ($a -lt $stl) { $hit = "LEASED $($z.p) $($z.r) stage $($z.s)"; break }
            $tk += "lease on $($z.p) from $($z.r) stage $($z.s) was ${a}m stale (limit ${stl}m), taken"; continue
          }
          $keep += $z
        }
        if (-not $hit) {
          foreach ($f in $files) { $keep += [pscustomobject]@{ p = $f; r = $r; s = "$n"; d = $drv; h = $tn } }
          LeaseWrite $reg $keep
        }
        [pscustomobject]@{ hit = $hit; took = $tk }
      }
      if ($res -and $res.hit) { Refuse "$($res.hit) - another run's live stage holds it; chain next names what can run" }
      if ($res) { $leased = $true; $took = @($res.took) }
    } else {
      $fz = @(LeaseForeign)
      if ($fz.Count) { Refuse "stage $n names no files: line, and $($fz[0].r) holds live leases - plan it with -Files, or wait for that run to land" }
    }
  }
  try {
  Lock
  try {
    $hp = HdrParts; $c = CodeOf $n
    if (-not $hp -or -not $c) { Die "stage $n has no chain block - chain plan $n first" }
    if ($hp[1] -ne '-') { Refuse "chain is held ($($hp[1])) - chain release first, or chain wait" }
    $st = RowCellN $n 3
    if ($st -notin @('', '!')) { Refuse "stage $n is '$st', not pending or failed - a stage is never dispatched twice" }
    # F33: a stage a holding decision waits on runs only on a prompt written
    # after the answer - re-planned as a new stage, or ruled independent.
    $w = @(ChainScan | Where-Object { $_.StartsWith("IDLE $n Q") }) | Select-Object -First 1
    if ($w) { Refuse "stage $n waits on $($w.Substring(("IDLE $n ").Length)) - its prompt predates the answer; re-plan it (references/marathon.md, Unblock) or chain edge $n --independent-of with a ruling" }
    # An after: stage that has not landed is refused the same way.
    $w = @(ChainScan | Where-Object { $_.StartsWith("IDLE $n - after ") }) | Select-Object -First 1
    if ($w) { Refuse "stage $n waits on stage $($w.Substring(("IDLE $n - after ").Length)) (after:) - not landed yet; chain next names what can run" }
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
    # F37: never beside an in-flight stage whose files it shares (or with unknown files).
    $w = @(ChainScan | Where-Object { $_.StartsWith("IDLE $n inflight-files ") }) | Select-Object -First 1
    if ($w) { Refuse "stage $n shares files with stage $($w.Substring(("IDLE $n inflight-files ").Length)), in flight - chain next -All names what can run beside it" }
    if ($took.Count) { $note += "${c}: $($took -join '; ')" }
    $name = RowCellN $n 2; $t = Now; $prompt = BlockPrompt $n
    # F37: with another stage of this run in flight, this one works in its own
    # worktree off the run branch, merged back by `chain merge <n>` on landing.
    $nfl = @(ChainScan | Where-Object { $_ -match '^IDLE \d+ inflight$' }).Count
    # F37: the cap is a gate here, not only a hint in chain next -All.
    $cap = ParallelCap $d
    if ($nfl -ge $cap) { Refuse "$nfl stage(s) in flight, the cap is $cap - wait for one to land; chain next -All says when" }
    # F80: the claim is the gate, before the row flips - a ticket someone else owns, or
    # claimed first, never starts here. A refused claim is only a note when no one else
    # owns the tickets (not on the team, a ticket not on the board).
    $ids = @(ChainTickets $n)
    $r = $null; if ($ids.Count) { $r = TMeta (@('claim') + $ids) }
    if ($r -and $r.code -ne 0) {
      $om = OwnedMap $n
      foreach ($t in $ids) { if ($om.ContainsKey($t)) { Refuse "stage ${n}: $t is owned by $($om[$t]) - a run takes only unassigned tickets and yours (ticket-meta pick); its owner or the lead reassigns it" } }
      foreach ($l in @($r.err -split "`r?`n" | Where-Object { $_ })) { [Console]::Error.WriteLine("note: claim refused - $l") }
    }
    $swt = ''; $sbr = ''; $rwt = HdrField $Run 'worktree'
    if ($rwt -and (Test-Path -LiteralPath $rwt) -and $nfl -gt 0) {
      $swt = "$rwt.s$n"; $sbr = "$(HdrField $Run 'branch')-s$n"
      # A retry reuses what a failed attempt left: its worktree, or its branch.
      if (Test-Path -LiteralPath $swt) { }
      elseif (GitOk @('-C', $rwt, 'rev-parse', '-q', '--verify', "refs/heads/$sbr")) {
        if (-not (WtAdd $rwt @('-q', $swt, $sbr))) { Die "could not recreate stage $n's worktree $swt from $sbr" }
        WtLongPaths $swt
      } elseif (-not (WtAdd $rwt @('-q', '-b', $sbr, $swt, 'HEAD'))) { Die "could not create stage $n's worktree $swt on $sbr" }
      else { WtLongPaths $swt }
      [Console]::Error.WriteLine("stage $n works and commits in: $swt (branch $sbr) - chain merge $n when it lands")
    }
    $blk = @("### stage $n - $name  (dispatched $t, $drv)", 'run: -')
    if ($swt) { $blk += @("worktree: $swt", "branch: $sbr") }
    $blk += @('prompt: |') + (Indent $prompt)
    DropInFlight $n
    PutInSection 'In flight' $blk $null
    SetHdr "$drv $t" '-' $hp[2]
    if ($note) { AddRuling ($note -join '; ') }
    if (-not (SetRow $n '~' $Owner '')) { Die "no stage $n in $Run" }
    StampUpdated
  } finally { Unlock }
  } catch { if ($leased) { try { LeaseRelease $n } catch {} }; throw }
  $c
  $prompt
}

# F36: a stage's files are leased across runs at dispatch, in one registry per
# clone - <git-common-dir>/skillator/leases, which every worktree shares - one
# tab-separated line per path: path RUN-n stage driver heartbeat. Same rules as
# relay-morpheus.sh: another run's live lease (younger than RELAY_LEASE_STALE,
# 20 min) refuses; a stale one is taken with a ruling; landing, failing or
# re-planning releases; a heartbeat refreshes. Outside git: no registry.
# F44: a run's lease tag is its id as its FILE spells it - RUN-0012 for a run
# named since F44, RUN-7 for one named before - so a pre-F44 relay-morpheus
# sharing the registry still matches its own rows. Every read here compares
# by number (SameRun), so both spellings are one run.
function RunTag {
  $b = [IO.Path]::GetFileNameWithoutExtension((Split-Path -Leaf $Run)); $k = ''
  if ($b.StartsWith('run-')) { $k = $b.Substring(4).Split('-')[0]; if ($k -notmatch '\A[0-9]+\z') { $k = '' } }
  "RUN-$k"
}
function LeaseStale { if ($env:RELAY_LEASE_STALE) { [int]$env:RELAY_LEASE_STALE } else { 20 } }
function StageFiles($n) {
  $sec = ''; $cs = $false; $inp = $false
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if ($l.StartsWith('## ')) { $sec = $l; $cs = $false; continue }
    if ($sec -cne '## Chain') { continue }
    if ($l.StartsWith('### ')) { $cs = $l -cmatch "^### [A-Z0-9]{4} - stage $n - "; $inp = $false; continue }
    if ($cs -and -not $inp) { if ($l -ceq 'prompt: |') { $inp = $true } elseif ($l.StartsWith('files: ')) { PathsOf $l.Substring(7) } }
  }
}
function LeaseRead($reg) {
  if (-not (Test-Path -LiteralPath $reg)) { return @() }
  @(Get-Content -Encoding UTF8 $reg | Where-Object { $_ } | ForEach-Object { $z = $_ -split "`t"; [pscustomobject]@{ p = $z[0]; r = $z[1]; s = $z[2]; d = $z[3]; h = $z[4] } })
}
function LeaseWrite($reg, $ls) {
  $txt = (@($ls | ForEach-Object { "$($_.p)`t$($_.r)`t$($_.s)`t$($_.d)`t$($_.h)" }) -join "`n")
  if ($txt) { $txt += "`n" }
  [IO.File]::WriteAllText("$reg.new.$PID", $txt, (New-Object Text.UTF8Encoding($false)))
  Move-Item -Force -LiteralPath "$reg.new.$PID" -Destination $reg
}
function LeaseAge($h) { try { [int]((AsUtc (Now)) - (AsUtc $h)).TotalMinutes } catch { 99999 } }
# Runs $body with the registry path, under the registry's own lock; a run lock
# the caller holds is kept. Nothing outside git.
function LeaseLocked([scriptblock]$body) {
  $rd = Split-Path -Parent ($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Run))
  $gd = @(GitOut @('-C', $rd, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
  if (-not $gd.Count) { return }
  $dir = "$($gd[0])/skillator"; if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $sv = $script:Lock; $script:Lock = $null
  Lock "$dir/leases.lock"
  try { & $body "$dir/leases" } finally { Unlock; $script:Lock = $sv }
}
function LeaseRelease($n) { $r = RunTag; LeaseLocked { param($reg) if (Test-Path -LiteralPath $reg) { LeaseWrite $reg @(LeaseRead $reg | Where-Object { -not ((SameRun $_.r $r) -and $_.s -ceq "$n") }) } } }
# Prints how many leases it refreshed.
function LeaseBeat($n) { $r = RunTag; $t = Now; LeaseLocked { param($reg) $k = 0
  if (Test-Path -LiteralPath $reg) { LeaseWrite $reg @(LeaseRead $reg | ForEach-Object { if ((SameRun $_.r $r) -and $_.s -ceq "$n") { $_.h = $t; $k++ }; $_ }) }; $k } }
function LeaseForeign { $r = RunTag; $st = LeaseStale; LeaseLocked { param($reg) @(LeaseRead $reg | Where-Object { -not (SameRun $_.r $r) -and (LeaseAge $_.h) -lt $st }) } }

# F38: runs wait their turn in <main>/.skillator/queue.md and land on main one
# at a time. The file is written only under its own lock. Same file and rules
# as relay-morpheus.sh: -Mode queue-run -Sub add|list|next|start|pause|done -Id n,
# -Mode land -Id n -Sub start|finish|abort, -Mode away -Sub on|off|status.
function QFile { $m = MainOf; if (-not $m) { $m = (Get-Location).Path }; $d = "$m/.skillator"; if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force $d | Out-Null }; "$d/queue.md" }
function QLocked([scriptblock]$body) {
  $f = QFile
  $sv = $script:Lock; $script:Lock = $null
  Lock "$f.lock"
  try {
    # Created under the lock: two first callers, one header.
    if (-not (Test-Path -LiteralPath $f)) { [IO.File]::WriteAllText($f, "# Run queue`naway: -`nlanding: -`n`n| # | run | state | since |`n|---|-----|-------|-------|`n", (New-Object Text.UTF8Encoding($false))) }
    QNorm $f
    & $body $f
  } finally { Unlock; $script:Lock = $sv }
}
function QLines($f) { @(Get-Content -Encoding UTF8 $f) }
# F44: rows and the landing header written before F44 (RUN-12) are rewritten
# padded (RUN-0012) under the lock, so every reader sees one form.
function QNorm($f) {
  $ch = $false
  $out = @(foreach ($l in (QLines $f)) {
    if ($null -ne (RowNum $l)) {
      $c = $l -split '\|'; $w = $c[2].Trim(); $t = CanonTag $w
      if ($t -cne $w) { $c[2] = " $t "; $l = $c -join '|'; $ch = $true }
    } elseif ($l.StartsWith('landing: ')) {
      $w = $l.Substring(9).Split(' ')[0]; $t = CanonTag $w
      if ($t -cne $w) { $l = 'landing: ' + $t + $l.Substring(9 + $w.Length); $ch = $true }
    }
    $l })
  if ($ch) { QSave $f $out }
}
function QSave($f, $lines) { [IO.File]::WriteAllText("$f.tmp.$PID", (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false))); Move-Item -Force -LiteralPath "$f.tmp.$PID" -Destination $f }
function QHdr($f, $k) { foreach ($l in (QLines $f)) { if ($l.StartsWith("${k}: ")) { return $l.Substring($k.Length + 2) } }; '' }
function QSetHdr($f, $k, $v) { QSave $f @(QLines $f | ForEach-Object { if ($_.StartsWith("${k}: ")) { "${k}: $v" } else { $_ } }) }
# F44: rows match by number - a row queued as RUN-12 is RUN-0012's.
function QState($f, $r) { foreach ($l in (QLines $f)) { if ($null -ne (RowNum $l) -and (CanonTag (Cell $l 2)) -ceq (CanonTag $r)) { return (Cell $l 3) } }; '' }
function QSet($f, $r, $st) { $t = Now; QSave $f @(QLines $f | ForEach-Object { if ($null -ne (RowNum $_) -and (CanonTag (Cell $_ 2)) -ceq (CanonTag $r)) { $c = $_ -split '\|'; $c[3] = " $st "; $c[4] = " $t "; $c -join '|' } else { $_ } }) }
function RunIdArg($v) { $p = PadId $v; if (-not $p) { Die "'$v' is not a run id (RUN-0012)" }; "RUN-$p" }   # 12 | RUN-12 | RUN-0012 -> RUN-0012
function DoQueueRun {
  $sub = if ($Sub) { $Sub } else { 'list' }
  switch ($sub) {
    'add' { $r = RunIdArg $Id; if (-not (Resolve-Run ($r -replace '^RUN-', ''))) { Die "no run file for $r - see: -Mode list" }
            QLocked { param($f) if (QState $f $r) { "$r is already queued ($(QState $f $r))"; return }
              $n = 1; foreach ($l in (QLines $f)) { $k = RowNum $l; if ($null -ne $k) { $n = $k + 1 } }
              QSave $f (@(QLines $f) + "| $n | $r | queued | $(Now) |"); "$r queued (#$n)" } }
    'list' { $f = QFile; QLocked { param($f) } | Out-Null
             # F44: ids printed padded, and each run's owner in a last column.
             foreach ($l in (QLines $f)) {
               if ($l -like 'away: *' -or $l -like 'landing: *') { $l }
               elseif ($l -like '| # |*') { "$l owner |" }
               elseif ($l -like '|---|*') { "$l-------|" }
               elseif ($l -like '| *') { $c = $l -split '\|'; $rr = $c[2].Trim(); $ow = ''; $rf = Resolve-Run $rr
                 if ($rf) { $ow = HdrField $rf 'owner' }; if (-not $ow) { $ow = '-' }
                 $c[2] = " $(CanonTag $rr) "; ($c -join '|') + " $ow |" } } }
    'next' { QLocked { param($f) $busy = ''; $first = ''
               foreach ($l in (QLines $f)) { if ($null -eq (RowNum $l)) { continue }; $r = CanonTag (Cell $l 2); $st = Cell $l 3
                 if ($st -cin @('running', 'landing')) { if (-not $busy) { $busy = "$r $st" } } elseif ($st -ceq 'queued' -and -not $first) { $first = $r } }
               if ($busy) { "BUSY $busy" } elseif ($first) { "START $first" } else { 'DONE' } } }
    { $_ -cin @('start', 'pause', 'done') } {
      $r = RunIdArg $Id; $st = @{ 'start' = 'running'; 'pause' = 'paused'; 'done' = 'landed' }[$sub]
      # A hard stop pauses only its own run; the 7-day stop halts everything.
      QLocked { param($f) if (-not (QState $f $r)) { Die "queue-run: $r is not queued - queue-run add first" }
        # One run at a time: starting refuses while another runs or lands.
        if ($st -ceq 'running') { foreach ($l in (QLines $f)) { if ($null -ne (RowNum $l) -and (CanonTag (Cell $l 2)) -cne $r -and (Cell $l 3) -cin @('running', 'landing')) { Refuse "BUSY $(CanonTag (Cell $l 2)) $(Cell $l 3) - one run at a time; pause it first, or wait" } } }
        # A paused or finished run gives up a landing it held.
        if ($st -cne 'running' -and (CanonTag (QHdr $f 'landing').Split(' ')[0]) -ceq $r) { QSetHdr $f 'landing' '-' }
        QSet $f $r $st; "$r $st" } }
    default { Die "usage: -Mode queue-run -Sub add|list|next|start|pause|done [-Id n]" }
  }
}
function DoAway {
  $sub = if ($Sub) { $Sub } else { 'status' }
  if ($sub -cnotin @('on', 'off', 'status')) { Die "usage: -Mode away -Sub on|off|status" }
  QLocked { param($f)
    if ($sub -ceq 'on') { QSetHdr $f 'away' (Now); "away since $(QHdr $f 'away')" }
    elseif ($sub -ceq 'off') { $was = QHdr $f 'away'; QSetHdr $f 'away' '-'; "back (away was: $was)" }
    else { "away: $(QHdr $f 'away')" } }
}
# F48: the ops-board mod holds this clone when the machine is red (disk or
# memory below 1 GB): one file (where: R2b below),
# "<since> <reason>", written under its own lock. While it exists every new
# `chain dispatch` and every GREEN baseline-harness `run` is refused, exit 2.
# Released only on purpose (-Action release, the mod's /ops resume) - never by
# a reading that looks better. Same file and words as relay-morpheus.sh.
# R2b: one file per clone, by one rule shared with baseline-harness
# watchdog_refuse and pending: RELAY_DIR if set; else in git
# <main>/.skillator/watchdog.hold, main = the common dir's parent when it ends
# in /.git, else the toplevel (a git dir kept elsewhere, --separate-git-dir);
# outside git ./.skillator of the location. -Dir never moves it. $wdFrom, if
# given, is where to ask git from (the dispatch guard asks from the run file).
function WdPath([string]$wdFrom = '') {
  if ($env:RELAY_DIR) { return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath((Join-Path $env:RELAY_DIR 'watchdog.hold')) }
  $wdC = @('rev-parse', '--path-format=absolute', '--git-common-dir'); $wdT = @('rev-parse', '--show-toplevel')
  if ($wdFrom) { $wdC = @('-C', $wdFrom) + $wdC; $wdT = @('-C', $wdFrom) + $wdT }
  $wdCommon = @(GitOut $wdC); $wdMain = ''
  if ($wdCommon.Count -and $wdCommon[0] -match '/\.git$') { $wdMain = $wdCommon[0] -replace '/\.git$', '' }
  elseif ($wdCommon.Count) { $wdTop = @(GitOut $wdT); if ($wdTop.Count) { $wdMain = [string]$wdTop[0] } }
  if ($wdMain) { return "$wdMain/.skillator/watchdog.hold" }
  "$((Get-Location).ProviderPath)/.skillator/watchdog.hold"
}
# R6: a hold file that exists holds whatever its content - a missing since
# reads ?, a missing reason - (an empty or blank file: HELD ? -).
function WdRead([string]$wdFrom = '') {
  $f = WdPath $wdFrom
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return $null }
  try { $l = [string](([IO.File]::ReadAllText($f) -split "`n")[0]) } catch { $l = '' }
  $l = $l.Replace("`r", '').Trim(" `t".ToCharArray())
  $i = $l.IndexOf(' ')
  if ($i -lt 0) { $wdS = $l; $wdW = '' } else { $wdS = $l.Substring(0, $i); $wdW = $l.Substring($i + 1) }
  if ($wdS -eq '') { $wdS = '?' }
  if ($wdW -eq '') { $wdW = '-' }
  [pscustomobject]@{ since = $wdS; why = $wdW }
}
function DoWatchdog {
  if ($Action -cnotin @('hold', 'release', 'status')) { Die 'usage: -Mode watchdog -Action hold -Reason "<reason>" | -Action release | -Action status' }
  if ($Action -ceq 'status') {
    $wdCur = WdRead
    if ($wdCur) { return "HELD $($wdCur.since) $($wdCur.why)" }
    return 'CLEAR'
  }
  $wdWhy = "$Reason".Trim()
  if ($Action -ceq 'hold') {
    if (-not $wdWhy) { Die 'watchdog hold: say why - the reason is what the band and every refusal show' }
    if ($wdWhy -match "[`r`n]") { Die 'watchdog hold: the reason is one line' }
  }
  $f = WdPath
  # only a hold makes the folder - status and release never create one
  if ($Action -ceq 'release' -and -not (Test-Path -LiteralPath $f -PathType Leaf)) { return 'watchdog: not held' }
  $dd = Split-Path -Parent $f
  if (-not (Test-Path -LiteralPath $dd)) { New-Item -ItemType Directory -Force $dd | Out-Null }
  $sv = $script:Lock; $script:Lock = $null
  Lock "$f.lock"
  try {
    if ($Action -ceq 'hold') {
      $wdCur = WdRead; $wdAt = if ($wdCur -and $wdCur.since -cne '?') { $wdCur.since } else { Now }
      [IO.File]::WriteAllText("$f.tmp.$PID", "$wdAt $wdWhy`n", (New-Object Text.UTF8Encoding($false)))
      Move-Item -Force -LiteralPath "$f.tmp.$PID" -Destination $f
      $wdMsg = "watchdog: held $wdAt $wdWhy"
    } elseif (Test-Path -LiteralPath $f -PathType Leaf) {
      Remove-Item -LiteralPath $f -Force; $wdMsg = 'watchdog: released'
    } else { $wdMsg = 'watchdog: not held' }
  } finally { Unlock; $script:Lock = $sv }
  $wdMsg
}

function DoLand {
  $r = RunIdArg $Id
  if ($Sub -cnotin @('start', 'finish', 'abort')) { Die "usage: -Mode land -Id <n> -Sub start|finish|abort" }
  $rf = Resolve-Run ($r -replace '^RUN-', ''); if (-not $rf) { Die "no run matching $r - see: -Mode list" }
  $lw = HdrField $rf 'worktree'; $lb = HdrField $rf 'branch'
  if (-not $lw -or -not $lb) { Die "$r has no run worktree/branch (a -Here run) - it landed with its stages" }
  $mr = MainOf; if (-not $mr) { Die "land: not in a git repo" }
  $mb = @(GitOut @('-C', $mr, 'symbolic-ref', '-q', '--short', 'HEAD')); if (-not $mb.Count) { Die "land: the main checkout is on a detached HEAD" }; $mb = $mb[0]
  $rc = 0
  $msg = QLocked { param($f)
    $cur = CanonTag (QHdr $f 'landing').Split(' ')[0]
    if ($Sub -ceq 'start') {
      if ($cur -cne '-' -and $cur -cne $r) { Refuse "LANDING $cur - one run lands at a time; land $r after it finishes" }
      if (-not (Test-Path -LiteralPath $lw)) { Die "run worktree $lw is missing - resume recreates it" }
      if (@(GitOut @('-C', $lw, 'status', '--porcelain')).Count) { Refuse "the run worktree $lw has uncommitted changes - commit them on $lb first" }
      # The rebase rewrites the run branch: nothing may still be built on it.
      # The last row is the landing stage itself - in flight while it lands (A127).
      $rws = @(Get-Content -Encoding UTF8 $rf | Where-Object { $null -ne (RowNum $_) })
      if (@($rws | Select-Object -First ([Math]::Max(0, $rws.Count - 1)) | Where-Object { (Cell $_ 3) -ceq '~' }).Count) { Refuse "$r has stages in flight - they branch from $lb; land once they have landed" }
      $prev = QState $f $r; if (-not $prev) { $prev = '-' }
      # A129: a failed rebase is a CONFLICT only when it stopped mid-rebase -
      # git's rebase-merge or rebase-apply dir exists. Anything else (a ref
      # that does not resolve, "Filename too long", a locked index) is git's
      # own error, said as such: exit 1, not 3.
      $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { $rbo = @(& git -C $lw rebase -q $mb 2>&1 | ForEach-Object { "$_" }); $rbc = $LASTEXITCODE } finally { $ErrorActionPreference = $eap }
      if ($rbc -ne 0) {
        # Plain --git-path (any git): a relative answer is relative to the worktree.
        $rbin = 0
        foreach ($rk in @('rebase-merge', 'rebase-apply')) {
          $rx = @(GitOut @('-C', $lw, 'rev-parse', '--git-path', $rk))
          if (-not $rx.Count) { continue }
          $rp = $rx[0]; if (-not [IO.Path]::IsPathRooted($rp)) { $rp = Join-Path $lw $rp }
          if (Test-Path -LiteralPath $rp) { $rbin++ }
        }
        $null = GitOk @('-C', $lw, 'rebase', '--abort')
        if ($rbin) { [Console]::Error.WriteLine("CONFLICT: $lb does not rebase onto $mb - resolve it on the run branch (a fix stage), then land $r -Sub start again"); return 3 }
        Die "land: git rebase failed before any conflict: $(@($rbo | Where-Object { "$_".Trim() })[0])"
      }
      QSetHdr $f 'landing' "$r $(Now) was=$prev"; if (QState $f $r) { QSet $f $r 'landing' }
      "landing ${r}: $lb rebased onto $mb - now the regression sweep and /code-review on $mb..$lb, the version bump, all committed on $lb; then land $r -Sub finish"
    } elseif ($Sub -ceq 'finish') {
      if ($cur -cne $r) { Refuse "$r is not landing (landing: $cur) - land $r -Sub start first" }
      if (@(GitOut @('-C', $lw, 'status', '--porcelain')).Count) { Refuse "the run worktree $lw has uncommitted changes - commit them first" }
      if (-not (GitOk @('-C', $mr, 'merge', '-q', '--ff-only', $lb))) { [Console]::Error.WriteLine("main ($mb) does not fast-forward to $lb (moved since start?) - land $r -Sub start again"); return 3 }
      $left = @()
      if (-not (GitOk @('-C', $mr, 'worktree', 'remove', $lw))) { $left += "git worktree remove `"$lw`"" }
      if (-not (GitOk @('-C', $mr, 'branch', '-d', $lb))) { $left += "git branch -d $lb" }
      if ($left) { [Console]::Error.WriteLine("LEFT BEHIND: $($left -join '; ') (in use? run it from the main checkout)") }
      QSetHdr $f 'landing' '-'; if (QState $f $r) { QSet $f $r 'landed' }
      "landed $r on $mb at $(@(GitOut @('-C', $mr, 'rev-parse', '--short', 'HEAD'))[0]) - nothing pushed; one push per marathon, asked alone"
    } else {
      if ($cur -cne $r) { Refuse "$r is not landing" }
      $prev = ((QHdr $f 'landing') -split ' was=')[-1]; if (-not $prev -or $prev -eq '-' -or $prev -match ' ') { $prev = 'running' }
      QSetHdr $f 'landing' '-'; if (QState $f $r) { QSet $f $r $prev }
      "landing of $r abandoned - back to $prev; its branch stays rebased onto $mb (nothing on main moved)"
    } }
  if ($msg -is [int]) { exit $msg }
  $msg
}

# F36 (D1): TICKETS.md is written in the main checkout only, under its own
# lock - one board, however many run worktrees there are.
function DoBoard {
  if (-not $Ticket -or $null -eq $Mark) { Die "usage: -Mode board -Ticket <ID> -Mark <' '|~|x|!|?|>|->" }
  if ($Ticket -cnotmatch '^[A-Z]{1,3}[0-9]+[a-z]?$') { Die "board: '$Ticket' is not a ticket id" }
  # F45: '?' is pending decision (tickets-zordon), an open state like '!'.
  # F62: '%' is testing (tickets-zordon), open too.
  if ($Mark -cnotin @(' ', '~', 'x', '!', '?', '%', '>', '-')) { Die "board: mark is one of ' ' ~ x ! ? % > -" }
  $m = MainOf; if (-not $m) { $m = (Get-Location).Path }
  $f = "$m/TICKETS.md"; if (-not (Test-Path -LiteralPath $f)) { Die "board: no $f" }
  $sv = $script:Lock; $script:Lock = $null
  Lock "$f.lock"
  try {
    $raw = [IO.File]::ReadAllText($f); $nl = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }
    $lines = $raw -split "`r?`n"; $hit = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
      $l = $lines[$i]
      if (-not $hit -and $l.Length -ge 7 -and $l.StartsWith('- [') -and $l.Substring(4, 2) -ceq '] ' -and $l.Substring(6).StartsWith("$Ticket ", [StringComparison]::Ordinal)) { $lines[$i] = '- [' + $Mark + $l.Substring(4); $hit = $true }
    }
    if (-not $hit) { Die "board: no ticket $Ticket in $f" }
    [IO.File]::WriteAllText("$f.tmp.$PID", ($lines -join $nl), (New-Object Text.UTF8Encoding($false)))
    Move-Item -Force -LiteralPath "$f.tmp.$PID" -Destination $f
  } finally { Unlock; $script:Lock = $sv }
  "$Ticket [$Mark]"
}

# A field of stage n's In-flight block, before its prompt.
function InflightField($n, $k) {
  $sec = ''; $b = $false
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if ($l.StartsWith('## ')) { $sec = $l; $b = $false; continue }
    if ($sec -cne '## In flight') { continue }
    if ($l.StartsWith('### stage ')) { $b = $l.StartsWith("### stage $n - "); continue }
    if ($b -and $l.StartsWith('prompt:')) { $b = $false }
    if ($b -and $l.StartsWith("${k}: ")) { return $l.Substring($k.Length + 2) }
  }
  ''
}
# F37: a parallel stage's branch goes back onto the run branch, in the run's
# worktree, as a merge commit; its worktree and branch are then removed. A
# conflict aborts the merge and exits 3 - the stage fails, a retry is planned.
function DoChainMerge($n) {
  if (-not $n) { Die 'usage: -Mode chain -Action merge -N <n>' }
  NeedRun
  $swt = InflightField $n 'worktree'; $sbr = InflightField $n 'branch'
  if (-not $swt -and -not $sbr) { "stage $n has no stage worktree - it committed on the run branch; nothing to merge"; return }
  $rwt = HdrField $Run 'worktree'
  if (-not $rwt -or -not (Test-Path -LiteralPath $rwt)) { Die "run worktree $rwt is missing - -Mode resume recreates it" }
  if (-not $sbr -or -not (GitOk @('-C', $rwt, 'rev-parse', '-q', '--verify', "refs/heads/$sbr"))) { Die "stage $n's In-flight block names no usable branch ('$sbr') - fix the block; this is bookkeeping, not a conflict" }
  # Merges land one at a time, and only onto a clean run worktree: the stage
  # that runs there may still be writing - wait for it to commit, then merge.
  $conflict = $false; $sha = $null
  Lock "$Run.merge.lock"
  try {
    if (@(GitOut @('-C', $rwt, 'status', '--porcelain')).Count) { Refuse "the run worktree $rwt has uncommitted changes (a stage working there?) - merge once it has committed" }
    if (GitOk @('-C', $rwt, 'merge', '--no-ff', '--no-edit', '-m', "merge stage $n ($sbr)", $sbr)) {
      if (-not (GitOk @('-C', $rwt, 'worktree', 'remove', $swt))) { [Console]::Error.WriteLine("note: could not remove $swt (uncommitted files?) - remove it by hand") }
      $null = GitOk @('-C', $rwt, 'branch', '-d', $sbr)
      $sha = @(GitOut @('-C', $rwt, 'rev-parse', 'HEAD'))[0]
    } elseif (GitOk @('-C', $rwt, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')) {
      $null = GitOk @('-C', $rwt, 'merge', '--abort'); $conflict = $true
    } else { Die "git merge of $sbr into $rwt failed before merging (index.lock? a broken ref?) - not a conflict; retry chain merge $n" }
  } finally { Unlock }
  if ($conflict) {
    [Console]::Error.WriteLine("CONFLICT: stage $n ($sbr) does not merge onto $(HdrField $Run 'branch') - the stage fails: stage $n '!' and plan a retry stage on the merged branch")
    exit 3
  }
  $sha
}

function DoChainHold {
  $p = "$Pct".TrimEnd('%')
  if ($p -notmatch '^\d+(\.\d+)?$') { Die "chain hold: '$Pct' is not a percentage" }
  if ($Window -notin @('5h', '7d')) { Die "chain hold: -Window is 5h or 7d, not $Window" }
  NeedRun
  $hp = HdrParts; if (-not $hp) { Die "no ## Chain section in $Run - chain plan a stage first" }
  # next= is what `chain next` would dispatch, read with the hold ignored.
  $nx = if ($Next) { $Next } else { $script:Leases = @(LeaseForeign); try { ChainScan -NextOnly } finally { $script:Leases = $null } }
  if ($null -eq $nx -or "$nx" -eq '') { $nx = '-' }
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

# The Chain section, then (F33) the Decisions section when there is one.
function DoChainStatus {
  PickRun
  if (-not (Test-Path $Run)) { return }
  $on = $false
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if ($l.StartsWith('## ')) { $on = ($l -ceq '## Chain' -or $l -ceq '## Decisions') }
    if ($on) { $l }
  }
}

# --------------------------------------------------------------- marathon ----
# F33: a chain that never waits on the user for a question it could postpone.
# Same `## Decisions` section, same refusals, same exit codes as
# relay-morpheus.sh, which carries the full reasoning. A Q header never holds
# the word `stage`: the W allocator would read `### Q100 x stage 7` as a code.
# Common key and token shapes (R6: a heuristic). A full 40-hex sha matches too.
$SECRET_RE = '(^|[^A-Za-z0-9])(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})|[0-9a-fA-F]{40,}|-----BEGIN [A-Z ]*PRIVATE KEY'

# The run file is line-based, git-tracked, and its question text comes from
# agents that read untrusted repo content.
function FieldOk($cmd, $name, $v) {
  $v = "$v"
  if ($v.Contains("`n") -or $v.Contains("`r")) { Refuse "${cmd}: $name has a line break - the run file is line-based, one line per field" }
  if ($v.Trim().StartsWith('#')) { Refuse "${cmd}: $name starts with '#' - it would read as a heading in the run file" }
  if ($v -cmatch $SECRET_RE) { Refuse "${cmd}: $name has a key or token shape - a fact question asks where a secret lives (an env var name), never its value" }
}
function HasChain { foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -ceq '## Chain') { return $true } }; $false }
# `Q2`, `q2`, `2` and `RUN-11 Q2` all name Q2; $null otherwise.
function QNum($s) { $k = "$s" -replace '.*[Qq]', ''; if ($k -match '^[1-9][0-9]*$') { return $k }; $null }
# One value out of Q<k>'s block ('state' = the header's second word).
function QGet($k, $f) {
  $sec = ''; $inq = $false
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if ($l.StartsWith('## ')) { $sec = $l; $inq = $false; continue }
    if ($sec -cne '## Decisions') { continue }
    if ($l.StartsWith('### ')) {
      $inq = $false; $h = @($l.Trim() -split '\s+')
      if ($h.Count -gt 1 -and $h[1] -ceq "Q$k") { if ($f -eq 'state') { if ($h.Count -gt 2) { return $h[2] }; return '' }; $inq = $true }
      continue
    }
    if ($inq -and $l.StartsWith("${f}: ")) { return $l.Substring($f.Length + 2) }
  }
  $null
}
# "66, 67" out of "66,67": each a stage of this run and not <n>.
function AfterList($n, $s) {
  $o = @()
  foreach ($a in @("$s" -split '[ ,]+' | Where-Object { $_ })) {
    if ($a -notmatch '^[0-9]+$') { Die "after: '$a' is not a stage number" }
    if ([int]$a -eq [int]$n) { Die "after: stage $n cannot wait on itself" }
    if (-not (RowCellN $a 2)) { Die "after: no stage $a in $Run" }
    $o += $a
  }
  if (-not $o) { Die "after: no stage numbers in '$s'" }
  $o -join ', '
}

# Keyed on (stage, ticket, question) among the decisions that still hold: a
# repeat prints the existing Q and writes nothing; a second question, or one
# asked again after a moot or a re-plan, is new.
function DoPark([string[]]$opts) {
  $opts = @($opts | Where-Object { $null -ne $_ -and "$_" -ne '' })
  foreach ($o in $opts) { FieldOk 'park' 'option' $o }
  NeedRun
  if (-not (HasChain)) { Refuse "park: $Run has no ## Chain section - decisions are parked in chain runs only (F33); ask or rule as before" }
  # A stop is never parked: it is asked now, alone (references/marathon.md, Stops).
  if ($Stop -ceq 'none') { }
  elseif (-not $Stop) { Refuse "park: --stop is required - none, or the stop this is (destructive|security|outside|scope|repro)" }
  elseif ($Stop -cin @('destructive', 'security', 'outside', 'scope', 'repro')) { Refuse "park: a stop ($Stop) is never parked - halt the chain and ask it now, alone, before the queue" }
  else { Refuse "park: --stop is none|destructive|security|outside|scope|repro, not '$Stop'" }
  foreach ($f in @(@('ticket', $Ticket), @('reason', $Reason), @('question', $Question), @('header', $Header), @('default', $Default), @('files', $Files))) {
    if (-not "$($f[1])".Trim()) { Refuse "park: --$($f[0]) is required" }
  }
  if ($Reason -cnotin @('taste', 'fact', 'conflict')) { Refuse "park: --reason is taste|fact|conflict, not '$Reason' - anything else is a ruling" }
  # Counted on the trimmed value, in characters (code points, as the sh twin).
  $hl = @($Header.Trim().ToCharArray() | Where-Object { -not [char]::IsLowSurrogate($_) }).Count
  if ($hl -gt 8) { Refuse "park: --header '$($Header.Trim())' is $hl characters - the question chip takes 8" }
  if (-not $Question.EndsWith('?')) { Refuse "park: --question must be a question (end with '?')" }
  if ($opts.Count -lt 2 -or $opts.Count -gt 4) { Refuse "park: $($opts.Count) option(s) - a decision has 2 to 4 (one sensible answer is a ruling; 'Other' is added by the tool)" }
  foreach ($f in @(@('ticket', $Ticket), @('question', $Question), @('header', $Header), @('default', $Default), @('recommended', $Recommended),
                   @('blocks', $Blocks), @('files', $Files), @('gated', $Gated), @('done', $Done))) { FieldOk 'park' $f[0] $f[1] }
  $df = $Default.Trim(); $rc = $Recommended.Trim(); $olines = @(); $labels = @(); $hit = $false
  foreach ($o in $opts) {
    if (@($o.ToCharArray() | Where-Object { $_ -eq '|' }).Count -ne 2) { Refuse "park: an option is 'label | does | hurts' - exactly two '|', and none inside a field: $o" }
    $p = $o -split '\|'; $l = $p[0].Trim(); $dd = $p[1].Trim(); $hh = $p[2].Trim()
    if (-not $l -or -not $dd -or -not $hh) { Refuse "park: an option needs a label, what it does and where it hurts: $o" }
    $b = $l -replace ' *\(Recommended\)$', ''
    if ($rc -and $b -ceq $rc -and $b -ceq $l) { $l = "$l (Recommended)" }
    if ($b -ceq $df) { $hit = $true }
    $labels += $b
    $olines += "  - $l | $dd | $hh"
  }
  if (-not $hit) { Refuse "park: --default '$df' is not one of the option labels" }
  if ($rc -and $labels -cnotcontains $rc) { Refuse "park: --recommended '$rc' is not one of the option labels" }
  $bl = if ($Blocks.Trim()) { $Blocks.Trim() } else { $Ticket.Trim() }
  $pk = 'planning'
  if ($N) {
    if (-not (RowCellN $N 2)) { Die "park: no stage $N in $Run" }
    $pk = "stage $N"
  }
  $t1 = @($Ticket.Trim() -split '\s+')[0]
  Lock
  try {
    $sec = ''; $qq = ''; $pp = ''; $tt = ''; $qt = ''; $got = $null; $m = 0
    foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
      if ($l.StartsWith('## ')) { $sec = $l; continue }
      if ($sec -cne '## Decisions') { continue }
      if ($l -cmatch '^### Q([0-9]+) ') {
        $qq = "Q$($Matches[1])"; $pp = ''; $tt = ''; $qt = ''; if ([int]$Matches[1] -gt $m) { $m = [int]$Matches[1] }
        $h = @($l.Trim() -split '\s+'); if ($h.Count -lt 3 -or $h[2] -cnotin @('open', 'asked', 'answered', 'ruled')) { $qq = '' }
        continue
      }
      if ($l.StartsWith('### ')) { $qq = ''; continue }
      if (-not $qq) { continue }
      if ($l.StartsWith('parked: ')) { $pp = $l.Substring(8) -replace ' \(.*', '' }
      if ($l.StartsWith('ticket: ')) { $tt = @($l.Substring(8).Trim() -split '\s+')[0] }
      if ($l.StartsWith('question: ')) { $qt = $l.Substring(10) }
      if (-not $got -and $pp -ceq $pk -and $tt -ceq $t1 -and $qt -ceq $Question.Trim()) { $got = $qq }
    }
    if ($got) { return $got }
    $k = $m + 1
    $c = if ($pk -ne 'planning') { CodeOf $N } else { $null }
    $pl = if ($c) { "$pk ($c)" } else { $pk }
    $blk = @("### Q$k open $(Now)", "parked: $pl", "ticket: $($Ticket.Trim())", "reason: $Reason",
             "question: $($Question.Trim())", "header: $($Header.Trim())", 'options:') + $olines +
           @("default: $df", "blocks: $bl", "files: $($Files.Trim())")
    if ($Gated.Trim()) { $blk += "gated: $($Gated.Trim())" }
    if ($Done.Trim()) { $blk += "done: $($Done.Trim())" }
    $blk += 'answer: -'
    PutInSection 'Decisions' $blk 'asks: end'
    StampUpdated
  } finally { Unlock }
  "Q$k"
}

# Written once, under the lock: a Q that is not open or asked is refused (exit
# 2). "you decide" / "your call" is -Ruled: the default, as a ruling. The
# closing moves -Replanned <n>, -Moot "<why>" and -SameAs Qj stop it holding.
function DoAnswer {
  $k = QNum $Q; if (-not $k) { Die 'usage: -Mode answer -Q Q<k> -Text "<answer>" | -Ruled | -Replanned <n> | -Moot "<why>" | -SameAs Qj' }
  $moves = @()
  if ($Replanned) { $moves += , @('replanned', $Replanned) }
  if ($Moot) { $moves += , @('moot', $Moot) }
  if ($SameAs) { $moves += , @('same-as', $SameAs) }
  if ($moves.Count -gt 1) { Die "answer: one move per call" }
  if ($moves.Count -eq 1) {
    if ($Ruled -or $Text) { Die "answer: --$($moves[0][0]) goes alone" }
    return (QMove $k $moves[0][0] $moves[0][1])
  }
  $ruled = [bool]$Ruled; $txt = $Text
  if ($ruled -and $txt) { Die "answer: an answer or --ruled, not both" }
  if (-not $ruled -and -not "$txt".Trim()) { Die "answer: no answer given - an unanswered question stays as it is" }
  FieldOk 'answer' 'answer' $txt
  if ("$txt".Trim().ToLowerInvariant().TrimEnd('.', '!') -in @('you decide', 'your call', 'you choose', 'up to you')) { $ruled = $true }
  NeedRun
  if (-not (HasChain)) { Refuse "answer: $Run has no ## Chain section - decisions live in chain runs only (F33)" }
  Lock
  try {
    $s = QGet $k 'state'; if ($null -eq $s) { Die "no Q$k in $Run" }
    if ($s -cnotin @('open', 'asked')) { Refuse "Q$k is '$s' - an answer is written once; a change of mind after it is a new ticket" }
    if ($ruled) { $ns = 'ruled'; $txt = QGet $k 'default' } else { $ns = 'answered'; $txt = "$txt".Trim() }
    $t = Now; $sec = ''; $inq = $false
    $out = foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
      if ($l.StartsWith('## ')) { $sec = $l; $inq = $false }
      if ($sec -ceq '## Decisions' -and $l.StartsWith('### ')) {
        $inq = $false; $h = @($l.Trim() -split '\s+')
        if ($h.Count -gt 1 -and $h[1] -ceq "Q$k") { $inq = $true; if ($h.Count -gt 3) { "### Q$k $ns $($h[3])" } else { "### Q$k $ns" }; continue }
      }
      if ($inq -and $l.StartsWith('answer: ')) { "answer: $txt"; "${ns}: $t"; continue }
      $l
    }
    WriteRun $out
    StampUpdated
  } finally { Unlock }
  "Q$k ${ns}: $txt"
}

function QMove($k, $mv, $mval) {
  $j = $null; $mb = ''; $mf = ''
  if ($mv -eq 'replanned') { if ("$mval" -notmatch '^[0-9]+$') { Die "answer --replanned: '$mval' is not a stage number" } }
  elseif ($mv -eq 'moot') { if (-not "$mval".Trim()) { Die "answer --moot: say why - it is the ruling" }; FieldOk 'answer' 'moot' $mval }
  else {
    $j = QNum $mval; if (-not $j) { Die "answer --same-as: '$mval' is not a decision id (Q2)" }
    if ($j -eq $k) { Die "answer --same-as: Q$k cannot be its own duplicate" }
  }
  NeedRun
  if (-not (HasChain)) { Refuse "answer: $Run has no ## Chain section - decisions live in chain runs only (F33)" }
  Lock
  try {
    $s = QGet $k 'state'; if ($null -eq $s) { Die "no Q$k in $Run" }
    if ($mv -eq 'replanned') {
      if ($s -cnotin @('answered', 'ruled')) { Refuse "Q$k is '$s' - only an answered or ruled decision is re-planned" }
      $c = CodeOf $mval; if (-not $c) { Die "stage $mval has no chain block - chain plan the new stage first" }
      $ns = 'replanned'; $body = "replanned: stage $mval ($c)"; $note = "Q$k replanned as stage $mval ($c)"
    } elseif ($mv -eq 'moot') {
      if ($s -cnotin @('open', 'asked', 'answered', 'ruled')) { Refuse "Q$k is '$s' - already closed" }
      $ns = 'moot'; $body = "moot: $("$mval".Trim())"; $note = "Q$k moot - $("$mval".Trim())"
    } else {
      if ($s -cnotin @('open', 'asked')) { Refuse "Q$k is '$s' - only an unanswered decision folds into another" }
      $sj = QGet $j 'state'
      if ($sj -cnotin @('open', 'asked')) { $shown = if ($sj) { $sj } else { 'missing' }; Refuse "Q$j is '$shown' - a duplicate folds into an unanswered decision" }
      $ns = "same-as-Q$j"; $body = "same-as: Q$j"; $note = "Q$k is the same question as Q$j - its blocks and files joined Q$j"
      $mb = QGet $k 'blocks'; $mf = QGet $k 'files'
    }
    $sec = ''; $inq = $false; $inj = $false
    $out = foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
      if ($l.StartsWith('## ')) { $sec = $l; $inq = $false; $inj = $false }
      if ($sec -ceq '## Decisions' -and $l.StartsWith('### ')) {
        $inq = $false; $inj = $false; $h = @($l.Trim() -split '\s+')
        if ($h.Count -gt 1 -and $h[1] -ceq "Q$k") { $inq = $true; if ($h.Count -gt 3) { "### Q$k $ns $($h[3])" } else { "### Q$k $ns" }; continue }
        if ($j -and $h.Count -gt 1 -and $h[1] -ceq "Q$j") { $inj = $true }
      }
      if ($inq -and $l.StartsWith('answer: ')) { $l; $body; continue }
      if ($inj -and $mb -and $l.StartsWith('blocks: ')) { "$l, $mb"; continue }
      if ($inj -and $mf -and $l.StartsWith('files: ')) { "$l, $mf"; continue }
      $l
    }
    WriteRun $out
    AddRuling $note
    StampUpdated
  } finally { Unlock }
  "Q$k $ns"
}

function NormPath($p) {
  $p = ("$p" -replace '\\', '/').Trim()
  while ($p.StartsWith('./')) { $p = $p.Substring(2) }
  while ($p.Length -gt 1 -and $p.EndsWith('/')) { $p = $p.Substring(0, $p.Length - 1) }
  $p
}
function PathsOf($s) { @("$s" -split ',' | ForEach-Object { NormPath $_ } | Where-Object { $_ -ne '' }) }
function PathsMeet($a, $b) { ($a -ceq $b) -or $b.StartsWith("$a/", [StringComparison]::Ordinal) -or $a.StartsWith("$b/", [StringComparison]::Ordinal) }
function IdsOf($s) { @("$s" -split '[^A-Za-z0-9]+' | Where-Object { $_ -cmatch '^[A-Z]+[0-9]+[a-z]*$' }) }
function SrefsOf($s) {
  $w = @("$s" -split '[^A-Za-z0-9]+')
  for ($i = 0; $i -lt $w.Count - 1; $i++) { if ($w[$i] -ceq 'stage' -and $w[$i + 1] -match '^[0-9]+$') { [int]$w[$i + 1] } }
}
# F2 and F2b meet (the whole holds its part); F2a and F2b do not.
function TMatch($a, $b) {
  if ($a -cnotmatch '^([A-Z]+[0-9]+)(.*)$') { return $false }; $ba = $Matches[1]; $sa = $Matches[2]
  if ($b -cnotmatch '^([A-Z]+[0-9]+)(.*)$') { return $false }; $bb = $Matches[1]; $sb = $Matches[2]
  ($ba -ceq $bb) -and ($sa -eq '' -or $sb -eq '' -or $sa -ceq $sb)
}

# The verdict, then one IDLE line per reason a stage waits; see chain_scan in
# relay-morpheus.sh. A decision holds while open, asked, answered or ruled.
# A `>` row has landed only once the stage its landed cell names has.
# -NextOnly: only the stage NEXT would name, the hold and ask order ignored.
function ChainScan([switch]$NextOnly) {
  $rep = @{}
  $st = @{}; $rows = New-Object System.Collections.Generic.List[int]; $code = @{}
  $tk = @{}; $fl = @{}; $hasf = @{}; $af = @{}; $ind = @{}
  $qs = @{}; $ql = New-Object System.Collections.Generic.List[int]; $qp = @{}; $qb = @{}; $qbs = @{}; $qf = @{}
  $sec = ''; $cs = 0; $inp = $false; $qk = 0; $hold = ''; $asks = ''
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
    if ($l.StartsWith('## ')) { $sec = $l; $cs = 0; $qk = 0; continue }
    if ($sec -ceq '## Stages') { $n = RowNum $l; if ($null -ne $n) { $st[$n] = Cell $l 3; $rows.Add($n); if ((Cell $l 6) -cmatch 'stage ([0-9]+)') { $rep[$n] = [int]$Matches[1] } }; continue }
    if ($sec -ceq '## Chain') {
      if ($l.StartsWith('driver: ')) { $i = $l.IndexOf('     hold: '); $j = $l.IndexOf('     mode: '); if ($i -ge 0 -and $j -gt $i) { $hold = $l.Substring($i + 11, $j - $i - 11) }; continue }
      if ($l.StartsWith('### ')) { $cs = 0; if ($l -cmatch '^### ([A-Z0-9]{4}) - stage ([0-9]+) - ') { $cs = [int]$Matches[2]; $code[$cs] = $Matches[1]; $inp = $false }; continue }
      if ($cs -and -not $inp) {
        if ($l -ceq 'prompt: |') { $inp = $true }
        elseif ($l.StartsWith('tickets: ')) { $tk[$cs] = @($tk[$cs]) + @(IdsOf $l.Substring(9)) }
        elseif ($l.StartsWith('files: ')) { $hasf[$cs] = $true; $fl[$cs] = @($fl[$cs]) + @(PathsOf $l.Substring(7)) }
        elseif ($l.StartsWith('after: ')) { $af[$cs] = @($af[$cs]) + @($l.Substring(7) -split '[^0-9]+' | Where-Object { $_ } | ForEach-Object { [int]$_ }) }
        elseif ($l.StartsWith('independent-of: ')) { foreach ($w in @($l.Substring(16) -split '[^Q0-9]+')) { if ($w -cmatch '^Q([0-9]+)$') { $ind["$cs,$([int]$Matches[1])"] = $true } } }
      }
      continue
    }
    if ($sec -ceq '## Decisions') {
      if ($l.StartsWith('asks: ')) { $asks = $l.Substring(6).Trim(); continue }
      if ($l -cmatch '^### Q([0-9]+) ') {
        $qk = [int]$Matches[1]; $h = @($l.Trim() -split '\s+')
        if (-not $qs.ContainsKey($qk)) { $qs[$qk] = if ($h.Count -gt 2) { $h[2] } else { '' }; $ql.Add($qk) } else { $qk = 0 }
        continue
      }
      if ($l.StartsWith('### ')) { $qk = 0; continue }
      if ($qk) {
        if ($l.StartsWith('parked: ')) { if ($l -cmatch 'stage ([0-9]+)') { $qp[$qk] = [int]$Matches[1] } }
        elseif ($l.StartsWith('blocks: ')) { $qb[$qk] = @(IdsOf $l.Substring(8)); $qbs[$qk] = @(SrefsOf $l.Substring(8)) }
        elseif ($l.StartsWith('files: ')) { $qf[$qk] = @(PathsOf $l.Substring(7)) }
      }
    }
  }
  $holding = { param($k) $qs[$k] -cin @('open', 'asked', 'answered', 'ruled') }
  $landed = $null
  $landed = { param($s, $d) if ($st[$s] -ceq 'x') { return $true }
    if ($st[$s] -ceq '>' -and $rep.ContainsKey($s) -and [int]$d -lt 64) { return (& $landed $rep[$s] ([int]$d + 1)) }; $false }
  # $true when an unlanded after: stage behind d (transitively) is a failed one.
  $failBehind = $null
  $failBehind = { param($d, $depth)
    if ($depth -gt 64) { return $false }
    foreach ($a in @($af[$d] | Where-Object { $null -ne $_ })) {
      if (& $landed $a 0) { continue }
      if ($st[$a] -ceq '!' -or (& $failBehind $a ($depth + 1))) { return $true }
    }
    $false }
  $rs = @{}; $seen = @{}
  $rank = @{ 'blocks' = 1; 'files' = 2; 'nofiles' = 3; 'after' = 4 }
  $why = { param($n, $k, $w) $key = "$n,$k"; if (-not $rs.ContainsKey($key) -or $rank[$w] -lt $rank[$rs[$key]]) { $rs[$key] = $w } }
  # Walk after: edges back from d; a ? stage on the way holds n on its Qs.
  $behind = $null
  $behind = { param($n, $d, $depth)
    if ($depth -gt 64 -or $seen.ContainsKey("$n,$d")) { return }
    $seen["$n,$d"] = $true
    foreach ($a in @($af[$d] | Where-Object { $null -ne $_ })) {
      if (& $landed $a 0) { continue }
      if ($st[$a] -ceq '?') { foreach ($k in $ql) { if ((& $holding $k) -and $qp[$k] -eq $a) { & $why $n $k 'after' } } }
      & $behind $n $a ($depth + 1)
    }
  }
  $openk = 0; $unb = @(); $askd = @()
  foreach ($k in $ql) { if ($qs[$k] -ceq 'open') { $openk++ }; if ($qs[$k] -cin @('answered', 'ruled')) { $unb += "Q$k" }; if ($qs[$k] -ceq 'asked') { $askd += "Q$k" } }
  $nx = $null; $out = New-Object System.Collections.Generic.List[string]; $nf = 0; $nbk = 0; $osk = @()
  # F37: what the stages in flight touch. One with no files: could touch
  # anything, so nothing runs beside it.
  $infall = $null; $ifp = New-Object System.Collections.Generic.List[object]; $cand = New-Object System.Collections.Generic.List[int]
  foreach ($n in $rows) { if ($code.ContainsKey($n) -and $st[$n] -ceq '~') {
    if (-not $hasf[$n]) { $infall = $n } else { foreach ($t in @($fl[$n] | Where-Object { $_ })) { $ifp.Add(@($t, $n)) } } } }
  foreach ($n in $rows) {
    if (-not $code.ContainsKey($n)) { continue }
    $s = $st[$n]
    if ($s -ceq '~') { $out.Add("IDLE $n inflight"); $nf++; continue }
    if ($s -ceq '?') { $out.Add("IDLE $n parked"); continue }
    if ($s -cne '' -and $s -cne '!') { continue }
    if ($s -ceq '!') { $out.Add("IDLE $n failed") }
    foreach ($k in $ql) {
      if (-not (& $holding $k)) { continue }
      foreach ($b in @($qb[$k] | Where-Object { $_ })) { foreach ($t in @($tk[$n] | Where-Object { $_ })) { if (TMatch $b $t) { & $why $n $k 'blocks' } } }
      foreach ($b in @($qbs[$k] | Where-Object { $null -ne $_ })) { if ($b -eq $n) { & $why $n $k 'blocks' } }
      if (-not $ind.ContainsKey("$n,$k")) {
        if (-not $hasf[$n]) { & $why $n $k 'nofiles' }
        else { foreach ($b in @($qf[$k] | Where-Object { $_ })) { foreach ($t in @($fl[$n] | Where-Object { $_ })) { if (PathsMeet $b $t) { & $why $n $k 'files' } } } }
      }
    }
    & $behind $n $n 0
    $waits = $false
    foreach ($k in $ql) { if ($rs.ContainsKey("$n,$k")) { $out.Add("IDLE $n Q$k $($rs["$n,$k"])"); $waits = $true } }
    foreach ($a in @($af[$n] | Where-Object { $null -ne $_ })) { if (-not (& $landed $a 0)) { $out.Add("IDLE $n - after $a"); $waits = $true } }
    # F80: tickets someone else owns (ticket-meta pick) - their stages never start here
    if ($script:Owned) { foreach ($t in @($tk[$n] | Where-Object { $_ })) { if ($script:Owned.ContainsKey($t)) { $out.Add("IDLE $n owned $t $($script:Owned[$t])"); $osk += "stage $n $t $($script:Owned[$t])"; $waits = $true; break } } }
    if ($hasf[$n] -and $script:Leases) {
      $hit = $false
      foreach ($t in @($fl[$n] | Where-Object { $_ })) { if ($hit) { break }
        foreach ($lz in $script:Leases) { if (PathsMeet (NormPath $lz.p) $t) { $out.Add("IDLE $n leased $t $($lz.r) stage $($lz.s)"); $waits = $true; $hit = $true; break } } }
    }
    if (($s -ceq '' -or $s -ceq '!') -and -not $waits -and ($null -ne $infall -or $ifp.Count)) {
      if ($null -ne $infall) { $out.Add("IDLE $n inflight-files $infall"); $waits = $true }
      elseif (-not $hasf[$n]) { $out.Add("IDLE $n inflight-files $($ifp[0][1])"); $waits = $true }
      else { $hit = $false
        foreach ($t in @($fl[$n] | Where-Object { $_ })) { if ($hit) { break }; foreach ($q in $ifp) { if (PathsMeet $q[0] $t) { $out.Add("IDLE $n inflight-files $($q[1])"); $waits = $true; $hit = $true; break } } } }
    }
    if ($s -ceq '' -and -not $waits) { $cand.Add($n) }
    if ($s -ceq '' -and -not $waits -and ($null -eq $nx -or $n -lt $nx)) { $nx = $n }
    if ($s -ceq '' -and (& $failBehind $n 0)) { $nbk++ }
  }
  if ($NextOnly) { if ($null -ne $nx) { "$nx" }; return }
  # F37 -All: every candidate that fits - files disjoint from the ones already
  # picked, and no more than the cap in flight in all.
  $pk = New-Object System.Collections.Generic.List[int]
  if ($script:ScanAll -and $cand.Count) {
    $free = $script:ScanCap - $nf; $anyf = $false; $pp = New-Object System.Collections.Generic.List[object]
    foreach ($n in $cand) {
      if ($free -le 0) { $out.Add("IDLE $n slots"); continue }
      if ($anyf -or (-not $hasf[$n] -and $pk.Count)) { $out.Add("IDLE $n parallel-files $($pk[0])"); continue }
      $hit = $false
      foreach ($t in @($fl[$n] | Where-Object { $_ })) { if ($hit) { break }; foreach ($q in $pp) { if (PathsMeet $q[0] $t) { $out.Add("IDLE $n parallel-files $($q[1])"); $hit = $true; break } } }
      if ($hit) { continue }
      $pk.Add($n); $free--; if (-not $hasf[$n]) { $anyf = $true }
      foreach ($t in @($fl[$n] | Where-Object { $_ })) { $pp.Add(@($t, $n)) }
    }
    if (-not $pk.Count) { $nx = $null }
  }
  if ($asks -ceq 'live' -and $openk) { $v = 'ASK' } elseif ($null -ne $nx) { $v = 'NEXT' } elseif ($unb) { $v = 'UNBLOCK' }
  elseif ($openk) { $v = 'ASK' } elseif ($nf) { $v = 'WAIT' } elseif ($nbk) { $v = 'BLOCKED' } else { $v = 'FINAL' }
  # The hold gates dispatch, not questions: ASK and UNBLOCK go on under it.
  if ($hold -and $hold -ne '-' -and $v -ne 'ASK' -and $v -ne 'UNBLOCK') { "HOLD $hold" }
  elseif ($v -eq 'NEXT' -and $pk.Count) { foreach ($k in $pk) { "NEXT $k $($code[$k])" } }
  elseif ($v -eq 'NEXT') { "NEXT $nx $($code[$nx])" }
  elseif ($v -eq 'ASK') { "ASK $openk - open decisions to ask in one batch: read references/marathon.md, The end batch" }
  elseif ($v -eq 'UNBLOCK') { foreach ($u in $unb) { "UNBLOCK $u - answered, not yet re-planned: references/marathon.md, Unblock" } }
  elseif ($v -eq 'WAIT') { "WAIT $nf - in flight, nothing else can start: wait for a stage to land, then chain next" }
  elseif ($v -eq 'BLOCKED') { "BLOCKED $nbk - pending behind a failed stage: retry it as a new stage and close the failed row (stage <n> > - `"stage <new>`"), or report it: references/marathon.md, The loop" }
  else { $fv = 'FINAL'
    if ($askd) { $fv += " - unanswered, name them in the summary: $($askd -join ' ')" }
    if ($osk.Count) { $fv += " - skipped, someone else owns them, name them in the summary: $($osk -join ', ')" }
    $fv }
  $out
}

# F37: how many stages may be in flight at once - 2 below 50% of the 5-hour
# window, 1 at or above it or when usage cannot be read; RELAY_CHAIN_PARALLEL
# overrides.
function ParallelCap($d = $null) {
  if ($env:RELAY_CHAIN_PARALLEL) {
    if ($env:RELAY_CHAIN_PARALLEL -notmatch '^\d+$' -or [int]$env:RELAY_CHAIN_PARALLEL -lt 1) { Die "RELAY_CHAIN_PARALLEL='$($env:RELAY_CHAIN_PARALLEL)' is not a whole number of at least 1" }
    return [int]$env:RELAY_CHAIN_PARALLEL
  }
  if (-not $d) { $d = ChainDecide (LevelLine) }
  if ($d -match '^RELEASE (\S+)$') { if ([double]$Matches[1] -lt 50) { return 2 } }
  1
}
function DoChainNext {
  if ($All -and $Holds) { Die "usage: -Mode chain -Action next [-All | -Holds]" }
  $script:ScanAll = [bool]$All; $script:ScanCap = if ($All) { ParallelCap } else { 1 }
  NeedRun
  if (-not (HasChain)) { Die "no ## Chain section in $Run - chain next reads a chain" }
  $null = HdrParts
  # A118: -Holds is read-only (holo-r2d2 polls it) - only the decision-hold
  # lines, no verdict, no lease beat, no lease file, no lock.
  if ($Holds) { $script:Leases = $null; @(ChainScan) | Where-Object { $_ -cmatch '^IDLE \d+ Q\d+ [a-z]+$' }; return }
  # The driver's loop keeps its own in-flight stages' leases fresh: a stage
  # that runs long without reporting must not look abandoned to other runs.
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { $rn = RowNum $l; if ($null -ne $rn -and (Cell $l 3) -ceq '~') { try { $null = LeaseBeat $rn } catch {} } }
  $script:Leases = @(LeaseForeign)
  $script:Owned = OwnedMap
  try { ChainScan } finally { $script:Leases = $null; $script:Owned = $null }
}

# An edge found after planning: one line into the stage's existing block,
# ahead of its prompt, under the lock. The code and the prompt are untouched.
function DoChainEdge($n) {
  if (-not $n) { Die 'usage: -Mode chain -Action edge -N <n> -After "66,67" | -IndependentOf Qk -Why "<ruling>"' }
  if ($After -and $IndependentOf) { Die "chain edge: one edge per call - --after or --independent-of" }
  if (-not $After -and -not $IndependentOf) { Die "chain edge: --after or --independent-of is required" }
  NeedRun
  if ($After) { $line = "after: $(AfterList $n $After)"; $k = $null }
  else {
    $k = QNum $IndependentOf; if (-not $k) { Die "chain edge: '$IndependentOf' is not a decision id (Q2)" }
    if (-not "$Why".Trim()) { Die "chain edge: --independent-of needs --why - the ruling that says why stage $n's prompt does not depend on Q$k" }
    FieldOk 'chain edge' 'why' $Why
    $line = "independent-of: Q$k"
  }
  Lock
  try {
    $c = CodeOf $n; if (-not $c) { Die "stage $n has no chain block - chain plan $n first" }
    $sn = RowCellN $n 3; if ($sn -cin @('x', '>')) { Die "stage $n is closed ($sn) - an edge on it changes nothing" }
    if ($k -and $null -eq (QGet $k 'state')) { Die "no Q$k in $Run" }
    $inb = $false; $done = $false
    $out = foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
      if (-not $inb -and $l -cmatch "^### [A-Z0-9]{4} - stage $n - ") { $inb = $true; $l; continue }
      if ($inb -and -not $done -and ($l -ceq 'prompt: |' -or $l.StartsWith('#'))) { $line; $done = $true }
      if ($inb -and $l.StartsWith('#')) { $inb = $false }
      $l
    }
    WriteRun $out
    if ($k) { AddRuling "${c}: stage $n independent of Q$k - $("$Why".Trim())" }
    StampUpdated
  } finally { Unlock }
  $c
}

# The open (and asked) decisions in batch order - most blocked work first
# (tickets plus the stages idle on it), then the oldest - as the numbered list
# hosts without AskUserQuestion print. Chips are cut to 8.
function DoQueue {
  # F38: -All is the marathon's one end batch - every run with an open or
  # asked decision, each under its own heading.
  if ($All) {
    $any = $false; $sv = $script:Run
    try {
      foreach ($f in @(RunFiles | Where-Object { $_.Name -like 'run-*.md' })) {
        $ls = @(Get-Content -Encoding UTF8 $f.FullName)
        if (-not ($ls -ccontains '## Chain') -or -not @($ls | Where-Object { $_ -cmatch '^### Q\d+ (open|asked)( |$)' }).Count) { continue }
        $any = $true; "## RUN-$(IdOf $f.Name)"; $script:Run = $f.FullName
        $script:All = $false; try { DoQueue } finally { $script:All = $true }
      }
    } finally { $script:Run = $sv }
    if (-not $any) { 'no open decisions in any run' }
    return
  }
  if ($Asks -and $Asks -cnotin @('live', 'end')) { Die "queue: --asks is live or end, not $Asks" }
  NeedRun
  if (-not (HasChain)) { Refuse "queue: $Run has no ## Chain section - decisions live in chain runs only (F33)" }
  Lock
  try {
    if ($Asks) {
      $lines = @(Get-Content -Encoding UTF8 $Run)
      if ($lines -ccontains '## Decisions') {
        $sec = ''; $done = $false; $out = New-Object System.Collections.Generic.List[string]
        for ($i = 0; $i -lt $lines.Count; $i++) {
          $l = $lines[$i]
          if ($l.StartsWith('## ')) { $sec = $l }
          if ($sec -ceq '## Decisions' -and $l.StartsWith('asks: ')) { if (-not $done) { $out.Add("asks: $Asks") }; $done = $true; continue }
          $out.Add($l)
          if ($l -ceq '## Decisions' -and -not $done) {
            if ($i + 1 -lt $lines.Count -and $lines[$i + 1].StartsWith('asks: ')) { $i++ }
            $out.Add("asks: $Asks"); $done = $true
          }
        }
        WriteRun $out
      } else { PutInSection 'Decisions' @() "asks: $Asks" }
      AddRuling "decisions: asks $Asks (the user's word)"
    }
    $w = @{}; $hs = @{}; $seenI = @{}
    foreach ($l in @(ChainScan)) {
      if ($l -cmatch '^IDLE ([0-9]+) (Q[0-9]+) ' -and -not $seenI.ContainsKey("$($Matches[2]),$($Matches[1])")) {
        $seenI["$($Matches[2]),$($Matches[1])"] = $true; $w[$Matches[2]] = 1 + [int]$w[$Matches[2]]
        $hs[$Matches[2]] = if ($hs[$Matches[2]]) { "$($hs[$Matches[2]]), $($Matches[1])" } else { $Matches[1] }
      }
    }
    $sec = ''; $qq = ''; $qst = @{}; $ord = @(); $qn = @{}; $hd = @{}; $bl = @{}; $nb = @{}; $op = @{}
    foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
      if ($l.StartsWith('## ')) { $sec = $l; $qq = ''; continue }
      if ($sec -cne '## Decisions') { continue }
      if ($l -cmatch '^### (Q[0-9]+) ') {
        $qq = $Matches[1]; if ($qst.ContainsKey($qq)) { $qq = ''; continue }
        $h = @($l.Trim() -split '\s+'); $qst[$qq] = if ($h.Count -gt 2) { $h[2] } else { '' }; $ord += $qq; $op[$qq] = @(); continue
      }
      if ($l.StartsWith('### ')) { $qq = ''; continue }
      if (-not $qq) { continue }
      if ($l.StartsWith('question: ')) { $qn[$qq] = $l.Substring(10) }
      elseif ($l.StartsWith('header: ')) { $x = $l.Substring(8); if ($x.Length -gt 8) { $x = $x.Substring(0, 8) }; $hd[$qq] = $x }
      elseif ($l.StartsWith('blocks: ')) { $bl[$qq] = $l.Substring(8); $nb[$qq] = @(IdsOf $bl[$qq]).Count }
      elseif ($l.StartsWith('  - ')) { $op[$qq] += ($l.Substring(4) -replace ' \| ', ' - ') }
    }
    $c = @($ord | Where-Object { $qst[$_] -cin @('open', 'asked') })
    $wt = @{}; foreach ($x in $c) { $wt[$x] = [int]$w[$x] + [int]$nb[$x] }
    for ($i = 0; $i -lt $c.Count; $i++) { for ($j = $i + 1; $j -lt $c.Count; $j++) {
      if ($wt[$c[$j]] -gt $wt[$c[$i]] -or ($wt[$c[$j]] -eq $wt[$c[$i]] -and [int]$c[$j].Substring(1) -lt [int]$c[$i].Substring(1))) { $t1 = $c[$i]; $c[$i] = $c[$j]; $c[$j] = $t1 } } }
    $rid = IdOf $Run; if (-not $rid) { $rid = '?' }
    if (-not $c) { "no open decisions in RUN-$rid" }
    else {
      $hint = if ($c.Count -gt 1) { "$($c[0]) a, $($c[1]) you decide" } else { "$($c[0]) a" }
      "$($c.Count) decision$(if ($c.Count -gt 1) { 's' }) parked in RUN-$rid - answer as `"$hint`":"
      foreach ($x in $c) {
        $hold = if ($hs[$x]) { "; holds stage $($hs[$x])" } else { '' }
        $tag = if ($qst[$x] -ceq 'asked') { '  [asked]' } else { '' }
        "$x [$($hd[$x])] $($qn[$x])  (blocks $($bl[$x])$hold)$tag"
        $li = 0
        foreach ($o in @($op[$x] | Where-Object { $_ -match '\(Recommended\)' }) + @($op[$x] | Where-Object { $_ -notmatch '\(Recommended\)' })) { "   $('abcdefgh'[$li])) $o"; $li++ }
      }
    }
    if ($MarkAsked) {
      $t = Now; $sec = ''; $inq = $false
      $out = foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
        if ($l.StartsWith('## ')) { $sec = $l; $inq = $false }
        if ($sec -ceq '## Decisions' -and $l.StartsWith('### ')) {
          $inq = $false; $h = @($l.Trim() -split '\s+')
          if ($h.Count -gt 2 -and $h[1] -cmatch '^Q[0-9]+$' -and $h[2] -ceq 'open') { $inq = $true; if ($h.Count -gt 3) { "### $($h[1]) asked $($h[3])" } else { "### $($h[1]) asked" }; continue }
        }
        if ($inq -and $l.StartsWith('answer: ')) { "asked: $t" }
        $l
      }
      WriteRun $out
    }
    if ($MarkAsked -or $Asks) { StampUpdated }
  } finally { Unlock }
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
  function AgeDrv { WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $_ -replace '^driver: (@\S+) \S+ ', 'driver: $1 2026-01-01T00:00Z ' }) }
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
  # F49: `chain decide -Text` decides on the line it is given (the ops-board
  # mod's host reading), never on usage-watch's.
  $env:RELAY_LEVEL_CMD = "echo 'src=host 5h=99 7d=99 ctx=- max=-'"
  foreach ($row in @(@('HOLD 82', 'src=host 5h=82 7d=61 ctx=- max=-'), @('HOLD 91 7d', 'src=host 5h=41 7d=91 ctx=- max=-'),
      @('UNOBSERVABLE', 'src=none 5h=- 7d=- ctx=- max=-'), @('RELEASE 41', 'src=host 5h=41 7d=55 ctx=- max=-'))) {
    $script:Text = $row[1]
    try { $got = DoChainDecide } finally { $script:Text = '' }
    if ($got -ne $row[0]) { Die "F49: chain decide -Text '$($row[1])': want '$($row[0])', got '$got'" }
  }
  if ((DoChainDecide) -ne 'HOLD 99 7d') { Die "F49: chain decide with no -Text did not read the level command" }

  $d4 = Join-Path $d 'chain'; New-Item -ItemType Directory -Force $d4 | Out-Null; G init -q $d4
  $script:Dir = Join-Path $d4 '.skillator'; $script:Run = ''
  $script:Plan = 'TICKETS.md'; $script:Title = 'chain test'; $script:Stages = 'B2+B3 books,F2 report,F3 cli,verify review bump commit push'
  DoInit | Out-Null
  $s1 = $null; foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -match '^\| (\d+) \| B2\+B3 books \|') { $s1 = [int]$Matches[1] } }
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
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ((RowNum $l) -eq $s1 -and ($l -split '\|').Count -ne 8) { Die "chain plan: the row's column count changed" } }
  if ($txt -notmatch "(?m)^### $c1 - stage $s1 - B2\+B3 books$") { Die "chain plan: no block header" }
  if ($txt -notmatch '(?m)^tickets: B2 build/build \. B3 build/build$') { Die "chain plan: tickets line wrong" }
  if ($txt -notmatch '(?m)^driver: -     hold: -     mode: workflow$') { Die "chain plan: no Chain header" }
  if (([regex]::Matches($txt, '(?m)^## Chain$')).Count -ne 1) { Die "chain plan: more than one ## Chain section" }
  if ($txt.IndexOf("`n## Chain`n") -gt $txt.IndexOf("`n## Rulings")) { Die "chain plan: ## Chain not before ## Rulings" }
  if ((BlockPrompt $s1) -cne $want1) { Die "chain plan: the stored prompt is not verbatim" }
  if ((BlockPrompt $s3) -cne 'item F3: --version') { Die "chain plan: a CRLF prompt kept its CR" }
  if ($txt -match "`r") { Die "chain plan: wrote CR into the run file" }
  if (Test-Path "$Run.lock") { Die "chain plan: left the lock behind" }
  # F33: every F31 check below runs with a `## Decisions` section present -
  # Q1, Q100 and Q999 in states that hold nothing - and passes unchanged.
  PutInSection 'Decisions' @("### Q1 moot 2026-01-01T00:00Z", "parked: stage $s1 ($c1)", 'ticket: B2', 'blocks: B2, B3',
    'files: shelf/books.py', 'answer: -', 'moot: selftest', '### Q100 replanned 2026-01-01T00:00Z', 'parked: planning',
    'ticket: F2', 'blocks: F2', 'files: shelf/', 'answer: x', "replanned: stage $s2 ($c2)",
    '### Q999 same-as-Q1 2026-01-01T00:00Z', 'ticket: B3', 'answer: -') 'asks: end'
  $txt = [IO.File]::ReadAllText($Run)
  if (-not ($txt.IndexOf("`n## Chain`n") -lt $txt.IndexOf("`n## Decisions`n") -and $txt.IndexOf("`n## Decisions`n") -lt $txt.IndexOf("`n## Rulings"))) { Die "selftest: ## Decisions not between ## Chain and ## Rulings" }

  # dispatch: never without a driver, a block, or past a hold; prompt verbatim.
  SetLevel 'src=claude-code 5h=40 7d=10 ctx=5 max=40'
  # F48: a watchdog hold (the ops-board mod's, on a red disk or memory reading)
  # refuses every new dispatch until released; a second hold keeps its since.
  # R2: the hold is the main checkout's (from git, not the location or -Dir) -
  # work from inside the scratch repo, so the real one's .skillator is never touched.
  Push-Location $d4
  $wdFile = Join-Path $script:Dir 'watchdog.hold'
  function Wd($act, $why = '') { $script:Action = $act; $script:Reason = $why; try { DoWatchdog } finally { $script:Action = 'status'; $script:Reason = '' } }
  if ((Wd 'status') -cne 'CLEAR') { Die "F48: watchdog status with no hold: $(Wd 'status')" }
  $out = Wd 'hold' 'disk 0.8 GB free (below 1 GB)'
  if ($out -cnotmatch '^watchdog: held 20\S*Z disk 0\.8 GB free \(below 1 GB\)$') { Die "F48: watchdog hold said: $out" }
  $wdSince = $out.Substring('watchdog: held '.Length)
  if ([IO.File]::ReadAllText($wdFile) -cne "$wdSince`n") { Die "F48: hold file is not '<since> <reason>' LF: $([IO.File]::ReadAllText($wdFile))" }
  if ((Wd 'status') -cne "HELD $wdSince") { Die "F48: watchdog status: $(Wd 'status')" }
  [IO.File]::WriteAllText($wdFile, "2026-01-01T00:00Z disk 0.8 GB free (below 1 GB)`n")
  $out = Wd 'hold' 'mem 0.5 GB free'
  if ($out -cne 'watchdog: held 2026-01-01T00:00Z mem 0.5 GB free') { Die "F48: a second hold restarted the clock: $out" }
  ShouldFail 'watchdog hold: say why' { Wd 'hold' '' }
  ShouldFail 'one line' { Wd 'hold' "a`nb" }
  $bytes = [IO.File]::ReadAllBytes($wdFile)
  if ($bytes -contains 13 -or ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF)) { Die "F48: hold file has a CR or a BOM" }
  if (Test-Path "$wdFile.lock") { Die "F48: watchdog hold left its lock behind" }
  $script:Driver = '@cc-a'
  try { ShouldFail '^REFUSED: watchdog hold \(mem 0\.5 GB free\) - clear the cause, then /ops resume or relay-morpheus watchdog release$' { DoChainDispatch $s1 } }
  finally { $script:Driver = '' }
  # The exit code and the words, from a separate process, as a caller sees them.
  $psi = New-Object Diagnostics.ProcessStartInfo 'powershell'
  # R2b: -Dir does not move the hold - the child runs in the scratch repo with
  # -Dir pointing elsewhere and still sees the main checkout's hold.
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode chain -Action dispatch -N $s1 -Driver @cc-a -Dir `"$(Join-Path $d 'not-the-hold')`" -Run `"$Run`""
  $psi.WorkingDirectory = $d4
  if ($psi.EnvironmentVariables.ContainsKey('RELAY_DIR')) { $psi.EnvironmentVariables.Remove('RELAY_DIR') }
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $wdProc = [Diagnostics.Process]::Start($psi)
  $null = $wdProc.StandardOutput.ReadToEnd(); $wdErr = $wdProc.StandardError.ReadToEnd(); $wdProc.WaitForExit()
  if ($wdProc.ExitCode -ne 2 -or $wdErr.Trim() -cne 'REFUSED: watchdog hold (mem 0.5 GB free) - clear the cause, then /ops resume or relay-morpheus watchdog release') {
    Die "F48: dispatch while held (child): want exit 2 and the hold text, got $($wdProc.ExitCode): $wdErr" }
  if (-not (Select-String -Path $Run -Pattern "^\| $s1 \| $c1 B2\+B3 books \|   \| - \|" -Quiet) -or (Test-Path "$Run.lock")) { Die "F48: a held dispatch touched the row or left the lock" }
  if ((Wd 'release') -cne 'watchdog: released' -or (Test-Path -LiteralPath $wdFile)) { Die "F48: watchdog release did not remove the hold" }
  if ((Wd 'release') -cne 'watchdog: not held') { Die "F48: a second release did not say not held" }
  if ((Wd 'status') -cne 'CLEAR') { Die "F48: status after release: $(Wd 'status')" }
  ShouldFail 'usage: -Mode watchdog' { Wd 'plan' }
  # R2: one hold file per clone - <main checkout>/.skillator/watchdog.hold
  # whatever the location. Held from a subdir, it shows from the root and the
  # subdir, a release from the subdir clears it, and no <subdir>/.skillator
  # appears; status and release never create a folder. Separate processes, as
  # the mod and a shell in a subdir run it.
  function WdChild([string]$wdAt, [string]$wdAct, [string]$wdWhy = '', [string]$wdRd = '', [string]$wdExtra = '') {
    $wpsi = New-Object Diagnostics.ProcessStartInfo 'powershell'
    $wargs = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode watchdog -Action $wdAct"
    if ($wdWhy) { $wargs += " -Reason `"$wdWhy`"" }
    if ($wdExtra) { $wargs += " $wdExtra" }
    $wpsi.Arguments = $wargs; $wpsi.WorkingDirectory = $wdAt
    $wpsi.UseShellExecute = $false; $wpsi.RedirectStandardOutput = $true; $wpsi.RedirectStandardError = $true
    if ($wpsi.EnvironmentVariables.ContainsKey('RELAY_DIR')) { $wpsi.EnvironmentVariables.Remove('RELAY_DIR') }
    if ($wdRd) { $wpsi.EnvironmentVariables['RELAY_DIR'] = $wdRd }
    $wp = [Diagnostics.Process]::Start($wpsi)
    $wo = $wp.StandardOutput.ReadToEnd(); $we = $wp.StandardError.ReadToEnd(); $wp.WaitForExit()
    if ($wp.ExitCode -ne 0) { Die "R2: watchdog $wdAct from $wdAt exited $($wp.ExitCode): $we" }
    $wo.Trim()
  }
  $wdRepo = Join-Path $d 'wdrepo'; $wdSub = Join-Path $wdRepo 'sub'; $wdDeep = Join-Path $wdSub 'deep'
  New-Item -ItemType Directory -Force $wdDeep | Out-Null; G init -q $wdRepo
  $wdMain = Join-Path (Join-Path $wdRepo '.skillator') 'watchdog.hold'
  $null = WdChild $wdDeep 'hold' 'disk 0.7 GB free'
  if (-not (Test-Path -LiteralPath $wdMain -PathType Leaf)) { Die "R2: a hold from a subdir did not land in the main checkout's .skillator" }
  $out = WdChild $wdRepo 'status'
  if ($out -cnotmatch '^HELD 20\S*Z disk 0\.7 GB free$') { Die "R2: status from the repo root after a subdir hold: $out" }
  if ((WdChild $wdDeep 'status') -cne $out) { Die "R2: status from the subdir differs from the root's" }
  if ((WdChild $wdDeep 'release') -cne 'watchdog: released') { Die "R2: release from the subdir did not release" }
  if (Test-Path -LiteralPath $wdMain) { Die "R2: release from the subdir left the main checkout's hold" }
  if ((WdChild $wdRepo 'status') -cne 'CLEAR') { Die "R2: status from the root after a subdir release" }
  if ((Test-Path -LiteralPath (Join-Path $wdDeep '.skillator')) -or (Test-Path -LiteralPath (Join-Path $wdSub '.skillator'))) { Die "R2: a stray <subdir>/.skillator was created" }
  Remove-Item -Recurse -Force -LiteralPath (Join-Path $wdRepo '.skillator')
  $null = WdChild $wdSub 'status'; $null = WdChild $wdSub 'release'
  if ((Test-Path -LiteralPath (Join-Path $wdRepo '.skillator')) -or (Test-Path -LiteralPath (Join-Path $wdSub '.skillator'))) { Die "R2: watchdog status/release created a folder" }
  # R2b: one rule for the hold's place - RELAY_DIR; else in git the main
  # checkout (the common dir's parent, or the toplevel when the git dir lives
  # elsewhere: --separate-git-dir); outside git ./.skillator of the location.
  # -Dir never moves it.
  $wdSep = Join-Path $d 'sep'; $wdSepSub = Join-Path $wdSep 'sub'
  G init -q --separate-git-dir (Join-Path $d 'sep.git') $wdSep
  New-Item -ItemType Directory -Force $wdSepSub | Out-Null
  $wdSepHold = Join-Path (Join-Path $wdSep '.skillator') 'watchdog.hold'
  $null = WdChild $wdSepSub 'hold' 'disk 0.6 GB free'
  if (-not (Test-Path -LiteralPath $wdSepHold -PathType Leaf)) { Die "R2b: a hold in a separate-git-dir repo did not land in <toplevel>/.skillator" }
  if ((Test-Path -LiteralPath (Join-Path $wdSepSub '.skillator')) -or (Test-Path -LiteralPath (Join-Path (Join-Path $d 'sep.git') '.skillator'))) { Die "R2b: a separate-git-dir hold made a stray .skillator" }
  $out = WdChild $wdSep 'status'
  if ($out -cnotmatch '^HELD 20\S*Z disk 0\.6 GB free$') { Die "R2b: status from the separate-git-dir repo's root: $out" }
  if ((WdChild $wdSepSub 'release') -cne 'watchdog: released' -or (Test-Path -LiteralPath $wdSepHold)) { Die "R2b: release in a separate-git-dir repo" }
  $wdRdDir = Join-Path $d 'rd'
  $null = WdChild $wdSepSub 'hold' 'mem 0.6 GB free' $wdRdDir
  if (-not (Test-Path -LiteralPath (Join-Path $wdRdDir 'watchdog.hold') -PathType Leaf) -or (Test-Path -LiteralPath $wdSepHold)) { Die "R2b: RELAY_DIR did not take the hold" }
  Remove-Item -Recurse -Force -LiteralPath $wdRdDir
  $wdOther = Join-Path $d 'other-dir'
  $null = WdChild $wdSepSub 'hold' 'disk 0.55 GB free' '' "-Dir `"$wdOther`""
  if (-not (Test-Path -LiteralPath $wdSepHold -PathType Leaf) -or (Test-Path -LiteralPath $wdOther)) { Die "R2b: -Dir moved the hold" }
  if ((WdChild $wdSep 'release' '' '' "-Dir `"$wdOther`"") -cne 'watchdog: released') { Die "R2b: release with -Dir did not release the main checkout's hold" }
  $wdNoGitRoot = Join-Path ([IO.Path]::GetTempPath()) ("relay-nogit-" + [guid]::NewGuid())   # $d is a repo itself
  $wdNoGit = Join-Path $wdNoGitRoot 'a'; New-Item -ItemType Directory -Force $wdNoGit | Out-Null
  $null = WdChild $wdNoGit 'hold' 'disk 0.5 GB free'
  if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $wdNoGit '.skillator') 'watchdog.hold') -PathType Leaf)) { Die "R2b: outside git the hold is not ./.skillator of the location" }
  if ((WdChild $wdNoGit 'release') -cne 'watchdog: released') { Die "R2b: release outside git" }
  # R6: a hold file that exists holds whatever its content - empty or blank
  # reads HELD ? -, a missing reason -.
  New-Item -ItemType Directory -Force (Split-Path -Parent $wdSepHold) | Out-Null
  [IO.File]::WriteAllText($wdSepHold, '')
  if (($out = WdChild $wdSepSub 'status') -cne 'HELD ? -') { Die "R6: status of an empty hold file: $out" }
  [IO.File]::WriteAllText($wdSepHold, " `t `r`n")
  if (($out = WdChild $wdSepSub 'status') -cne 'HELD ? -') { Die "R6: status of a blank hold file: $out" }
  [IO.File]::WriteAllText($wdSepHold, "2026-01-01T00:00Z`n")
  if (($out = WdChild $wdSepSub 'status') -cne 'HELD 2026-01-01T00:00Z -') { Die "R6: status of a hold with no reason: $out" }
  Remove-Item -Recurse -Force -LiteralPath $wdSep, (Join-Path $d 'sep.git'), $wdNoGitRoot
  # R6, in-process: an empty hold file refuses a dispatch with reason -, and
  # a hold over it starts a fresh since.
  [IO.File]::WriteAllText($wdFile, '')
  if ((Wd 'status') -cne 'HELD ? -') { Die "R6: status of an empty hold file (in-process): $(Wd 'status')" }
  $script:Driver = '@cc-a'
  try { ShouldFail '^REFUSED: watchdog hold \(-\) - clear the cause' { DoChainDispatch $s1 } }
  finally { $script:Driver = '' }
  $out = Wd 'hold' 'disk 0.4 GB free'
  if ($out -cnotmatch '^watchdog: held 20\S*Z disk 0\.4 GB free$') { Die "R6: hold over an empty file kept a '?' since: $out" }
  if ((Wd 'release') -cne 'watchdog: released') { Die "R6: release after an empty-file hold" }
  Pop-Location
  $script:Driver = ''; $savedDrv = $env:RELAY_CHAIN_DRIVER; $env:RELAY_CHAIN_DRIVER = ''
  ShouldFail 'name this session' { DoChainDispatch $s1 }
  $script:Driver = '@cc-a'; $script:Owner = 'build:opus'
  $out = @(DoChainDispatch $s1)
  $script:Owner = ''
  if ($out[0] -ne $c1) { Die "chain dispatch: did not print the code first" }
  if ($out[1] -cne $want1) { Die "chain dispatch: printed prompt not verbatim" }
  $on = $false; $p = $false; $buf = @()
  foreach ($l in @(Get-Content -Encoding UTF8 $Run)) {
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

  # hold: idempotent, keeps its since, names the stage `chain next` would
  # dispatch - $s3, not the failed $s2 row a first-open-row pick named; locked.
  $script:Pct = '84'; $script:Next = ''; $script:Window = '5h'
  $h1 = DoChainHold
  if (-not (DrvFresh)) { Die "chain hold: did not refresh the driver stamp" }
  if ($h1 -notmatch " 84% 5h next=$s3$") { Die "chain hold: next is not chain next's NEXT ($s3): $h1" }
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $_ -replace 'hold: \S+ ', 'hold: 2026-01-01T00:00Z ' })
  $script:Pct = '86'; $h2 = DoChainHold
  if ($h2 -ne "hold: 2026-01-01T00:00Z 86% 5h next=$s3") { Die "chain hold: a second hold restarted the clock or lost next: $h2" }
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
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $_ -replace 'hold: 2026-01-01T00:00Z ', "hold: $(Now) " })
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
  if (-not (Select-String -Path $Run -SimpleMatch "${c3}: override: user confirmed past 7d 90% (91%)" -Quiet)) { Die "chain release: no ruling for the 7-day override" }
  if (-not (Select-String -Path $Run -Pattern '^driver: @cc-b \S+     hold: -     mode: workflow$' -Quiet)) { Die "chain release: hold not cleared" }
  $script:Override = $false; $script:Confirmed = $false
  if ((DoChainRelease) -ne 'not held') { Die "chain release: not idempotent" }
  $script:Pct = '83'; DoChainHold | Out-Null
  AgeDrv
  SetLevel 'src=claude-code 5h=83 7d=10 ctx=5 max=83'; $script:Override = $true
  DoChainRelease | Out-Null; $script:Override = $false
  if (-not (Select-String -Path $Run -SimpleMatch "${c3}: override: user asked at 83%" -Quiet)) { Die "chain release -Override: no ruling" }
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
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object {
    if ($_.StartsWith("### stage $s2 - ")) { $inb = $true; $_ } elseif ($_ -match '^#') { $inb = $false; $_ }
    elseif ($inb -and $_ -match '^run: ') { 'run: dead-run-1' } else { $_ } })
  if (-not (Select-String -Path $Run -Pattern '^run: dead-run-1$' -Quiet)) { Die "selftest: did not mark the old In-flight block" }
  $script:Confirmed = $true; DoChainDispatch $s2 | Out-Null; $script:Confirmed = $false
  $nb = @(Select-String -Path $Run -SimpleMatch "### stage $s2 - " | Where-Object { $_.Line.StartsWith("### stage $s2 - ") }).Count
  if ($nb -ne 1) { Die "chain dispatch: redispatching a failed stage left $nb In-flight blocks for it" }
  if (Select-String -Path $Run -Pattern '^run: dead-run-1$' -Quiet) { Die "chain dispatch: redispatching a failed stage kept the old In-flight block" }
  # A153: stage $s1 landed, so its block went then; the redispatch must not bring it back.
  if (@(Select-String -Path $Run -Pattern "^### stage $s1 - ").Count -ne 0) { Die "chain dispatch: landed stage $s1 still has an In-flight block" }
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
  # F37 refuses a stage beside in-flight stages it may share files with; this
  # race is about the claim, so stages 1-2 read as landed while it runs.
  $r12 = @{}; foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { $rn = RowNum $l; if ($rn -eq [int]$s1 -or $rn -eq [int]$s2) { $r12[$rn] = $l } }
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $rn = RowNum $_; if ($null -ne $rn -and $r12.ContainsKey($rn)) { $c = $_ -split '\|'; if ($c[3].Trim() -ceq '~') { $c[3] = ' x ' }; $c -join '|' } else { $_ } })
  $pa = Spawn "-Mode chain -Action dispatch -N $s3 -Driver @cc-b -Run `"$Run`""
  $pb = Spawn "-Mode chain -Action dispatch -N $s3 -Driver @cc-b -Run `"$Run`""
  $ra = Reap $pa; $rb = Reap $pb
  if ((@($ra, $rb) | Sort-Object) -join ',' -ne '0,2') { Die "chain dispatch: two parallel dispatches of one stage exited $ra and $rb, not 0 and 2" }
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $rn = RowNum $_; if ($null -ne $rn -and $r12.ContainsKey($rn)) { $r12[$rn] } else { $_ } })
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
  # A115: the lock is one exclusively-created file holding `<pid> ps1`.
  # (nopid) a holder that died between the create and the write leaves an
  # empty file, broken once older than $LockStaleS. (late) one that wrote its
  # pid and died: a waiter that came first sees the pid appear and breaks the
  # lock once the file is that old. The pid is an impossible one (odd; Windows
  # pids are multiples of 4) - a just-exited process's pid is soon reused.
  # (olddir) a pre-A115 lock dir, on the same clock.
  $old = (Get-Date).AddMinutes(-5)
  foreach ($c in @('nopid', 'late', 'olddir')) {
    if ($c -eq 'olddir') {
      New-Item -ItemType Directory "$Run.lock" | Out-Null; [IO.File]::WriteAllText("$Run.lock\pid", '99999999')
      (Get-Item -LiteralPath "$Run.lock\pid").LastWriteTime = $old; (Get-Item -LiteralPath "$Run.lock").LastWriteTime = $old
    } else { [IO.File]::WriteAllText("$Run.lock", '') }
    if ($c -eq 'nopid') { (Get-Item -LiteralPath "$Run.lock").LastWriteTime = $old }
    $pa = Spawn "-Mode add -Title `"A115 $c`" -Run `"$Run`""
    if ($c -eq 'late') { Start-Sleep -Seconds 2; [IO.File]::WriteAllText("$Run.lock", "99999999 ps1`n") }
    if (-not $pa.WaitForExit(25000)) { $pa.Kill(); Remove-Item -Recurse -Force "$Run.lock" -ErrorAction SilentlyContinue; Die "lock ($c): a waiter still spins on a dead holder's lock after 25s" }
    $ra = Reap $pa
    if ($ra -ne 0) { Remove-Item -Recurse -Force "$Run.lock" -ErrorAction SilentlyContinue; Die "lock ($c): a waiter on a dead holder's lock exited $ra" }
    if (-not (Select-String -Path $Run -SimpleMatch "| A115 $c |" -Quiet)) { Die "lock ($c): the waiter's add did not land" }
    if (Test-Path "$Run.lock") { Die "lock ($c): left the lock behind" }
  }
  # A live holder is never broken under $LockDeadS, however stale by the 10s
  # rule: one of this port (Get-Process sees it) or of the other (whose MSYS
  # pid it cannot see). The dir lock found no pid file in a file lock and broke
  # both at once; A115's 30s force path broke them too (A124).
  $mid = (Get-Date).AddSeconds(-30)
  foreach ($c in @("$PID ps1", '1 sh MINGW')) {
    [IO.File]::WriteAllText("$Run.lock", "$c`n"); (Get-Item -LiteralPath "$Run.lock").LastWriteTime = $mid
    $t = "A115 live $($c.Split(' ')[1])"
    $pa = Spawn "-Mode add -Title `"$t`" -Run `"$Run`""
    Start-Sleep -Seconds 4
    $held = try { [IO.File]::ReadAllText("$Run.lock").Trim() } catch { '' }
    if ($held -cne $c -or $pa.HasExited) { if (-not $pa.HasExited) { $pa.Kill() }; Remove-Item -Force "$Run.lock" -ErrorAction SilentlyContinue; Die "lock: a waiter broke a live holder's lock ($c)" }
    Remove-Item -Force "$Run.lock"
    if (-not $pa.WaitForExit(25000)) { $pa.Kill(); Die "lock: a waiter on a released lock still spins ($c)" }
    $ra = Reap $pa
    if ($ra -ne 0 -or -not (Select-String -Path $Run -SimpleMatch "| $t |" -Quiet)) { Die "lock: a waiter on a released lock exited $ra or lost its row ($c)" }
  }
  # A124: (crashed) a dead sh holder's lock and a dead sh breaker's `.break`,
  # both past $LockDeadS - the A115 code spun on them forever. (foreign) any
  # holder past $LockDeadS is broken, whatever port it names.
  foreach ($c in @('crashed', 'foreign')) {
    [IO.File]::WriteAllText("$Run.lock", "99999999 sh MINGW`n"); (Get-Item -LiteralPath "$Run.lock").LastWriteTime = $old
    if ($c -eq 'crashed') { [IO.File]::WriteAllText("$Run.lock.break", "88888888 sh MINGW`n"); (Get-Item -LiteralPath "$Run.lock.break").LastWriteTime = $old }
    $pa = Spawn "-Mode add -Title `"A124 $c`" -Run `"$Run`""
    if (-not $pa.WaitForExit(25000)) { $pa.Kill(); Remove-Item -Force "$Run.lock*" -ErrorAction SilentlyContinue; Die "lock ($c): a waiter still spins after 25s" }
    $ra = Reap $pa
    if ($ra -ne 0 -or -not (Select-String -Path $Run -SimpleMatch "| A124 $c |" -Quiet)) { Die "lock ($c): the waiter exited $ra or lost its row" }
    if (Get-ChildItem -Path (Split-Path $Run) -Filter "$(Split-Path -Leaf $Run).lock*") { Die "lock ($c): left a lock behind" }
  }
  # The race: a dead holder's stale lock and six callers at once. Exactly one
  # breaks it and every add lands - a lost row means two held it at once.
  [IO.File]::WriteAllText("$Run.lock", "99999999 ps1`n"); (Get-Item -LiteralPath "$Run.lock").LastWriteTime = $old
  $ps = @(1..6 | ForEach-Object { Spawn "-Mode add -Title `"A115 race $_`" -Run `"$Run`"" })
  $errs = @(); foreach ($q in $ps) { $null = $q.StandardOutput.ReadToEnd(); $e = $q.StandardError.ReadToEnd(); $q.WaitForExit(); if ($q.ExitCode -ne 0) { $errs += "exit $($q.ExitCode): $($e.Trim())" } }
  $bad = $errs.Count
  $n = @(Select-String -Path $Run -Pattern '^\| \d+ \| A115 race [1-6] \|').Count
  if ($bad -ne 0 -or $n -ne 6) { Die "lock race: $bad of 6 callers failed, $n of 6 rows landed: $($errs -join ' / ')" }
  if (Get-ChildItem -Path (Split-Path $Run) -Filter "$(Split-Path -Leaf $Run).lock*") { Die "lock race: left a lock or a broken lock behind" }
  # F31 review 2: a hand-mangled Chain header (4-space separators) is left
  # alone by the driver's heartbeat - row stamped, no throw, header unchanged.
  $good = [IO.File]::ReadAllBytes($Run)
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $_ -replace '^(driver: @\S+ \S+)     hold: (.*)     mode: ', '$1    hold: $2    mode: ' })
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
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $_ -replace '^driver: (@\S+) \S+     hold: ', 'driver: $1     hold: ' })
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
    $xs = $null; foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -match '^\| (\d+) \| one \|') { $xs = [int]$Matches[1] } }
    $oldRun = $env:RELAY_RUN; $env:RELAY_RUN = $Run.Replace('\', '/')
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
      # Disjoint files: F37 runs nothing beside an in-flight stage with unknown files.
      $xc = (& $shExe.Source $shScript chain plan $xs --prompt-file $p1.Replace('\', '/') --files a.py 2>$null | Select-Object -Last 1)
      if ("$xc" -cnotmatch '^[A-Z0-9]{4}$') { Die "cross: sh chain plan gave '$xc'" }
      SetLevel 'src=claude-code 5h=40 7d=10 ctx=5 max=40'; $script:Driver = '@cc-x'
      $out = @(DoChainDispatch $xs)
      if ($out[0] -ne $xc -or $out[1] -cne $want1) { Die "cross: ps did not read the sh-planned block verbatim" }
      # Stage two is planned too, so the hold's next= (chain next's NEXT) names it.
      $null = (& $shExe.Source $shScript chain plan ($xs + 1) --prompt-file $p1.Replace('\', '/') --files b.py 2>$null)
      $script:Pct = '84'; $script:Next = ''; DoChainHold | Out-Null
      WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { $_ -replace 'hold: \S+ ', 'hold: 2026-01-01T00:00Z ' })
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

# F33. A question is on disk the moment it is found, nothing waiting on it
# runs on a pre-answer prompt, and the file stays readable by every F31 parser
# and by relay-morpheus.sh - whose `chain next` must print the same lines.
function MarathonSelftest($d) {
  $gc = @('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=NUL')
  function G { $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git @gc @args 2>&1 | Out-Null; $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw "selftest: git $args failed" } }
  function Spawn([string]$argline) {
    $psi = New-Object Diagnostics.ProcessStartInfo 'powershell'
    $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" $argline"
    $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    [Diagnostics.Process]::Start($psi)
  }
  function Reap($p) { $null = $p.StandardOutput.ReadToEnd(); $null = $p.StandardError.ReadToEnd(); $p.WaitForExit(); $p.ExitCode }
  # A refusal (exit 2 through -File) whose message holds $want, literally.
  function No($label, $want, $block) {
    try { & $block | Out-Null } catch {
      if ("$_" -notmatch '^REFUSED: ' -or "$_" -notmatch [regex]::Escape($want)) { Die "${label}: want a refusal /$want/, got: $_" }
      return
    }
    Die "${label}: expected a refusal /$want/ and got none"
  }
  function First { @(ChainScan)[0] }
  function Has($line) { @(ChainScan) -ccontains $line }
  function Plan($n, $tickets, $files, $after) {
    $script:PromptFile = $pf; $script:Tickets = $tickets; $script:Files = $files; $script:After = $after; $script:Fix = ''; $script:Verify = ''
    try { DoChainPlan $n } finally { $script:After = ''; $script:Files = ''; $script:Tickets = '' }
  }
  function SetPark { $script:N = $m2; $script:Ticket = 'F2'; $script:Reason = 'taste'; $script:Question = 'Should export write CSV or JSON?'
    $script:Header = 'Format'; $script:Default = 'JSON'; $script:Recommended = 'JSON'; $script:Files = 'shelf/export.py, tests/test_export.py'
    $script:Stop = 'none'; $script:Blocks = ''; $script:Done = ''; $script:Gated = '' }
  function Park2($t, $f) { $script:N = 0; $script:Ticket = $t; $script:Reason = 'fact'; $script:Question = 'Which env var?'; $script:Header = 'Env'
    $script:Default = 'A_URL'; $script:Recommended = ''; $script:Files = $f; $script:Stop = 'none'; $script:Blocks = ''; $script:Done = ''; $script:Gated = ''
    DoPark @('A_URL | ours | ops may differ', 'B_URL | runbook | unconfirmed') }
  function Ans($qq, $txt, [switch]$ruled, $rep = '', $moot = '', $same = '') {
    $script:Q = $qq; $script:Text = $txt; $script:Ruled = [bool]$ruled; $script:Replanned = $rep; $script:Moot = $moot; $script:SameAs = $same
    try { DoAnswer } finally { $script:Text = ''; $script:Ruled = $false; $script:Replanned = ''; $script:Moot = ''; $script:SameAs = '' }
  }
  function Queue([switch]$mark, $asks = '') { $script:MarkAsked = [bool]$mark; $script:Asks = $asks
    try { DoQueue } finally { $script:MarkAsked = $false; $script:Asks = '' } }
  function Same($a, $b) { [Convert]::ToBase64String([IO.File]::ReadAllBytes($a)) -ceq [Convert]::ToBase64String([IO.File]::ReadAllBytes($b)) }

  $savedDrv = $env:RELAY_CHAIN_DRIVER; $env:RELAY_CHAIN_DRIVER = ''; $script:Driver = ''
  $env:RELAY_LEVEL_CMD = "echo 'src=claude-code 5h=40 7d=10 ctx=5 max=40'"
  $d6 = Join-Path $d 'marathon'; New-Item -ItemType Directory -Force $d6 | Out-Null; G init -q $d6
  $script:Dir = Join-Path $d6 '.skillator'; $script:Run = ''
  $script:Plan = 'TICKETS.md'; $script:Title = 'marathon'; $script:Stages = 'B3 books,F2 export,F5 export,B4 cli,F6 shelf,F9 docs,F10 notes,final'
  DoInit | Out-Null
  $m1 = $null; foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -match '^\| (\d+) \| B3 books \|') { $m1 = [int]$Matches[1] } }
  $m2 = $m1 + 1; $m3 = $m1 + 2; $m4 = $m1 + 3; $m5 = $m1 + 4; $m6 = $m1 + 5; $m7 = $m1 + 6
  $pf = Join-Path $d6 'p'; [IO.File]::WriteAllText($pf, "item: do it`n")
  $O1 = 'JSON | matches list --json | spreadsheet users convert it'; $O2 = 'CSV | opens in Excel | needs quoting'

  # D3: a run with no ## Chain is refused - park, answer and queue alike.
  SetPark; No 'park: no chain' 'no ## Chain section' { DoPark @($O1, $O2) }
  No 'queue: no chain' 'no ## Chain section' { Queue }
  if (Select-String -Path $Run -Pattern '^## Decisions' -Quiet) { Die "park: wrote Decisions into a run with no chain" }

  Plan $m1 'B3' 'shelf/books.py' '' | Out-Null
  $cm2 = Plan $m2 'F2' 'shelf/export.py, tests/test_export.py' ''
  $cm3 = Plan $m3 'F5' './shelf\export.py' "$m2"
  if (-not (Select-String -Path $Run -Pattern "^after: $m2$" -Quiet)) { Die "chain plan -After: no after: line" }
  if ((BlockPrompt $m3) -cne 'item: do it') { Die "chain plan -After: the after: line leaked into the prompt" }
  $script:PromptFile = $pf; $script:After = "$m4"
  try { ShouldFail 'cannot wait on itself' { DoChainPlan $m4 } } finally { $script:After = '' }
  $cm4 = Plan $m4 'B4' '' ''
  Plan $m5 'F6' 'shelf/' '' | Out-Null
  $cm6 = Plan $m6 'F9' 'docs/guide.md' ''
  Plan $m7 'F10' 'notes/a.md' "$m3" | Out-Null
  if ((First) -cne "NEXT $m1 $(CodeOf $m1)") { Die "chain next: lowest pending stage is not first: $(First)" }

  # --- park: every refusal is exit 2 and writes nothing.
  $before = Join-Path $d6 'before'; Copy-Item $Run $before
  SetPark; No 'park: 1 option' '1 option' { DoPark @($O1) }
  No 'park: 5 options' '5 option(s)' { DoPark @($O1, $O2, 'a | b | c', 'd | e | f', 'g | h | i') }
  SetPark; $script:Default = ''; No 'park: no default' '--default is required' { DoPark @($O1, $O2) }
  SetPark; $script:Reason = ''; No 'park: no reason' '--reason is required' { DoPark @($O1, $O2) }
  SetPark; $script:Reason = 'whim'; No 'park: bad reason' 'taste|fact|conflict' { DoPark @($O1, $O2) }
  SetPark; $script:Stop = ''; No 'park: no stop' '--stop is required' { DoPark @($O1, $O2) }
  SetPark; $script:Stop = 'destructive'; No 'park: a stop' 'never parked' { DoPark @($O1, $O2) }
  SetPark; $script:Header = ''; No 'park: no header' '--header is required' { DoPark @($O1, $O2) }
  SetPark; $script:Header = 'Formatsss'; No 'park: long header' 'chip takes 8' { DoPark @($O1, $O2) }
  SetPark; $script:Question = 'CSV or JSON.'; No 'park: not a question' 'must be a question' { DoPark @($O1, $O2) }
  SetPark; $script:Files = ''; No 'park: no files' '--files is required' { DoPark @($O1, $O2) }
  SetPark; $script:Question = "CSV or`n## Rulings?"; No 'park: newline in question' 'line break' { DoPark @($O1, $O2) }
  SetPark; No 'park: CR in option' 'line break' { DoPark @("$O1`r", $O2) }
  No 'park: pipe in an option field' "exactly two '|'" { DoPark @($O1, 'CSV | opens | in | Excel') }
  SetPark; $script:Question = '## Rulings?'; No 'park: leading # in question' "starts with '#'" { DoPark @($O1, $O2) }
  SetPark; No 'park: leading # in option' "starts with '#'" { DoPark @($O1, '# CSV | x | y') }
  SetPark; $script:Question = 'Use sk-abcdefghijklmnop0123456789?'; No 'park: sk- secret' 'token shape' { DoPark @($O1, $O2) }
  SetPark; No 'park: ghp_ secret' 'token shape' { DoPark @($O1, 'CSV | ghp_abcdefghijklmnopqrstuvwxyz0123 | x') }
  SetPark; $script:Done = 'landed 0123456789abcdef0123456789abcdef01234567'; No 'park: 40-hex secret' 'token shape' { DoPark @($O1, $O2) }
  SetPark; $script:Default = 'YAML'; No 'park: default not a label' 'not one of the option labels' { DoPark @($O1, $O2) }
  if (-not (Same $before $Run)) { Die "park: a refused park changed the run file" }

  SetPark; $script:Blocks = 'F2'; $script:Done = 'nothing landed'
  $q1 = DoPark @($O1, $O2)
  if ($q1 -cne 'Q1') { Die "park: first decision is '$q1', not Q1" }
  $txt = [IO.File]::ReadAllText($Run)
  if ($txt -cnotmatch '(?m)^### Q1 open 20[0-9-]+T[0-9:]+Z$') { Die "park: no Q1 header" }
  if ($txt -cnotmatch "(?m)^parked: stage $m2 \($cm2\)$" -or $txt -cnotmatch '(?m)^  - JSON \(Recommended\) \| matches list --json \| spreadsheet users convert it$' -or
      $txt -cnotmatch '(?m)^default: JSON$' -or $txt -cnotmatch '(?m)^answer: -$') { Die "park: block shape wrong" }
  if (-not ($txt.IndexOf("`n## Chain`n") -lt $txt.IndexOf("`n## Decisions`n") -and $txt.IndexOf("`n## Decisions`n") -lt $txt.IndexOf("`n## Rulings"))) { Die "park: ## Decisions not between ## Chain and ## Rulings" }
  Copy-Item -Force $Run $before
  SetPark; if ((DoPark @($O1, $O2)) -cne 'Q1') { Die "park: a repeat (same stage and ticket) did not print the existing Q1" }
  if (-not (Same $before $Run)) { Die "park: a repeat park wrote to the run file" }
  if (Test-Path "$Run.lock") { Die "park: left the lock behind" }

  # --- stage ? and >, and list counts ?.
  DoStage $m2 '?' '' ''
  if (-not (Select-String -Path $Run -Pattern "^\| $m2 \| $cm2 F2 export \| \? \|" -Quiet)) { Die "stage: ? not written" }
  if (-not ((DoList) -match "\(stage $m2 open\)")) { Die "list: a ? stage is not counted open" }
  ShouldFail 'no .stage <new>.' { DoStage $m2 '>' '' '' }
  $script:Driver = '@cc-m'
  No 'dispatch: a ? stage' 'not pending or failed' { DoChainDispatch $m2 }

  # --- chain next: held files (normalised, directory prefix), no files, after, transitive ?.
  $out = @(ChainScan)
  if ($out[0] -cne "NEXT $m1 $(CodeOf $m1)") { Die "chain next: want NEXT ${m1}: $($out -join ' / ')" }
  foreach ($want in @("IDLE $m2 parked", "IDLE $m3 Q1 files", "IDLE $m3 - after $m2", "IDLE $m4 Q1 nofiles", "IDLE $m5 Q1 files", "IDLE $m7 Q1 after", "IDLE $m7 - after $m3")) {
    if ($out -cnotcontains $want) { Die "chain next: no '$want' in: $($out -join ' / ')" }
  }
  if ($out | Where-Object { $_.StartsWith("IDLE $m6 ") -or $_.StartsWith("IDLE $m1 ") }) { Die "chain next: an independent stage is idle: $($out -join ' / ')" }
  # A118: -Holds prints those Q lines only, in order, and writes nothing.
  $hWant = @($out | Where-Object { $_ -cmatch '^IDLE \d+ Q\d+ [a-z]+$' }) -join "`n"
  $hReg = "$(@(GitOut @('-C', (Split-Path -Parent $Run), 'rev-parse', '--path-format=absolute', '--git-common-dir'))[0])/skillator/leases"
  $hRegT = if (Test-Path -LiteralPath $hReg) { "$((Get-Item -LiteralPath $hReg).LastWriteTimeUtc.Ticks) $([Convert]::ToBase64String([IO.File]::ReadAllBytes($hReg)))" } else { $null }
  $hRun = [IO.File]::ReadAllBytes($Run)
  $script:Holds = $true
  try {
    $hGot = @(DoChainNext) -join "`n"
    ShouldFail 'usage: -Mode chain -Action next' { $hAll = $script:All; $script:All = $true; try { DoChainNext } finally { $script:All = $hAll } }
  } finally { $script:Holds = $false }
  if (-not $hWant -or $hGot -cne $hWant) { Die "chain next -Holds: want [$hWant], got [$hGot]" }
  if ([Convert]::ToBase64String($hRun) -cne [Convert]::ToBase64String([IO.File]::ReadAllBytes($Run))) { Die "chain next -Holds: wrote to the run file" }
  $hRegT2 = if (Test-Path -LiteralPath $hReg) { "$((Get-Item -LiteralPath $hReg).LastWriteTimeUtc.Ticks) $([Convert]::ToBase64String([IO.File]::ReadAllBytes($hReg)))" } else { $null }
  if ($hRegT -ne $hRegT2) { Die "chain next -Holds: touched the lease registry" }
  if (Test-Path -LiteralPath "$Run.lock") { Die "chain next -Holds: left a lock" }
  $hRunSv = $Run; $script:Run = "$d/nochain.md"; [IO.File]::WriteAllText($script:Run, "# run`n")
  $script:Holds = $true
  try { ShouldFail ([regex]::Escape("FAIL: no ## Chain section in $script:Run - chain next reads a chain")) { DoChainNext } } finally { $script:Holds = $false; $script:Run = $hRunSv }
  No 'dispatch: a stage idle on Q1' 'waits on Q1' { DoChainDispatch $m3 }
  No 'dispatch: a no-files stage while Q1 holds' 'waits on Q1 nofiles' { DoChainDispatch $m4 }
  DoStage $m1 '!' '' ''
  if ((First) -cne "NEXT $m6 $cm6") { Die "chain next: a ! row was offered: $(First)" }
  if (-not (Has "IDLE $m1 failed")) { Die "chain next: no 'IDLE $m1 failed'" }
  $script:Driver = ''; $script:Pct = '84'; $script:Next = ''; $script:Window = '5h'
  DoChainHold | Out-Null
  if ((First) -cne "HOLD $((HdrParts)[1])") { Die "chain next: no HOLD while held: $(First)" }
  DoChainRelease | Out-Null
  DoStage $m1 'x' '-' 'aaa1111'; DoStage $m6 'x' '-' 'aaa2222'
  if ((First) -notlike 'ASK 1 *') { Die "chain next: want ASK 1: $(First)" }
  if ((First) -notmatch 'references/marathon\.md') { Die "chain next: ASK does not point at marathon.md" }
  DoChainHold | Out-Null
  if ((First) -notlike 'ASK 1 *') { Die "chain next: a hold suppressed ASK" }
  DoChainRelease | Out-Null

  # --- edge: one line ahead of the prompt; the code and prompt untouched.
  $script:IndependentOf = 'Q1'; $script:Why = ''
  ShouldFail 'needs --why' { DoChainEdge $m4 }
  $script:Why = 'B4 is cli.py only'
  try { $e = DoChainEdge $m4 } finally { $script:IndependentOf = ''; $script:Why = '' }
  if ($e -cne $cm4) { Die "chain edge: did not print the stage code" }
  if (-not (Select-String -Path $Run -Pattern "^\| $m4 \| $cm4 B4 cli \|" -Quiet) -or (BlockPrompt $m4) -cne 'item: do it') { Die "chain edge: changed the code or the prompt" }
  if (-not (Select-String -Path $Run -SimpleMatch "${cm4}: stage $m4 independent of Q1 - B4 is cli.py only" -Quiet)) { Die "chain edge -IndependentOf: no ruling" }
  if ((First) -cne "NEXT $m4 $cm4") { Die "chain edge -IndependentOf: stage $m4 still held: $(First)" }
  DoStage $m4 'x' '-' 'aaa3333'
  $script:After = "$m1"; try { DoChainEdge $m5 | Out-Null } finally { $script:After = '' }
  $lines = @(Get-Content -Encoding UTF8 $Run); $b = [array]::FindIndex($lines, [Predicate[string]]{ $args[0] -cmatch "- stage $m5 - " })
  $pi = [array]::FindIndex($lines, $b, [Predicate[string]]{ $args[0] -ceq 'prompt: |' })
  if ($lines[$pi - 1] -cne "after: $m1") { Die "chain edge -After: not ahead of the prompt" }
  if ((BlockPrompt $m5) -cne 'item: do it') { Die "chain edge -After: changed the prompt" }

  # --- answer: written once, under the lock; an answered Q still holds.
  No 'answer: secret' 'token shape' { Ans 'Q1' 'sk-abcdefghijklmnop0123456789' }
  if ((Ans 'Q1' 'CSV') -cne 'Q1 answered: CSV') { Die "answer: wrong confirmation" }
  $txt = [IO.File]::ReadAllText($Run)
  if ($txt -cnotmatch '(?m)^### Q1 answered ' -or $txt -cnotmatch '(?m)^answer: CSV$') { Die "answer: not on disk" }
  No 'answer: twice' 'written once' { Ans 'Q1' 'JSON' }
  $out = @(ChainScan)
  if ($out[0] -notlike 'UNBLOCK Q1 *') { Die "chain next: want UNBLOCK Q1: $($out -join ' / ')" }
  if ($out -cnotcontains "IDLE $m3 Q1 files") { Die "chain next: an answered Q1 stopped holding stage ${m3}" }
  $script:Driver = '@cc-m'; No 'dispatch: held by an answered Q' 'waits on Q1' { DoChainDispatch $m3 }; $script:Driver = ''
  $n8 = [int](DoAdd 'F2 export CSV'); Plan $n8 'F2' 'shelf/export.py' '' | Out-Null
  DoStage $m2 '>' '-' "stage $n8"; DoStage $m3 '>' '-' "stage $n8"
  if (-not (Select-String -Path $Run -Pattern "^\| $m3 \| $cm3 F5 export \| > \| - \| [^|]* \| stage $n8 \|" -Quiet)) { Die "stage >: row not closed with its new stage" }
  Ans 'Q1' '' -rep "$n8" | Out-Null
  if (-not (Select-String -Path $Run -Pattern "^replanned: stage $n8 " -Quiet) -or -not (Select-String -Path $Run -SimpleMatch "Q1 replanned as stage $n8" -Quiet)) { Die "answer -Replanned: no body line or ruling" }
  if (Select-String -Path $Run -Pattern '^### Q[0-9]+ .*stage' -Quiet) { Die "a Q header line names a stage" }
  $out = @(ChainScan)
  if ($out[0] -cne "NEXT $m5 $(CodeOf $m5)") { Die "chain next: replanned Q1 still holds: $($out -join ' / ')" }
  if ($out | Where-Object { $_ -match 'Q1' }) { Die "chain next: a replanned Q1 is still named" }

  # --- ruled, moot, same-as.
  if ((Park2 'F11' 'sync/a.py') -cne 'Q2' -or (Park2 'F12' 'sync/b.py') -cne 'Q3' -or (Park2 'F13' 'sync/c.py') -cne 'Q4') { Die "park: planning-time Qs not Q2..Q4" }
  if (-not (Select-String -Path $Run -Pattern '^parked: planning$' -Quiet)) { Die "park: a planning park does not say so" }
  if ((Ans 'Q2' 'you decide') -cne 'Q2 ruled: A_URL') { Die "answer: 'you decide' is not ruled with the default" }
  Ans 'Q3' '' -moot 'F12 closed by hand' | Out-Null
  No 'moot twice' 'already closed' { Ans 'Q3' '' -moot 'again' }
  No 'same-as: into a ruled Q' 'folds into an unanswered' { Ans 'Q4' '' -same 'Q2' }
  if ((Park2 'F14' 'sync/d.py') -cne 'Q5') { Die "park: Q5" }
  Ans 'Q4' '' -same 'Q5' | Out-Null
  if ((QGet 5 'blocks') -cne 'F14, F13' -or (QGet 5 'files') -cne 'sync/d.py, sync/c.py') { Die "same-as: blocks/files did not join Q5" }
  if (-not (Select-String -Path $Run -Pattern '^### Q4 same-as-Q5 ' -Quiet)) { Die "same-as: header state" }

  # --- queue: batch order, 8-char chips, -MarkAsked; asks: live.
  if (@(Queue)[0] -cne "1 decision parked in RUN-$(IdOf $Run) - answer as `"Q5 a`":") { Die "queue: header line: $(@(Queue)[0])" }
  Queue -mark | Out-Null
  if (-not (Select-String -Path $Run -Pattern '^### Q5 asked ' -Quiet) -or -not (Select-String -Path $Run -Pattern '^asked: ' -Quiet)) { Die "queue -MarkAsked: Q5 not asked" }
  if (-not (@(Queue) -cmatch '^Q5 \[Env\] .*\[asked\]$')) { Die "queue: an asked Q is not marked" }
  if ((Ans 'Q5' 'B_URL') -cne 'Q5 answered: B_URL') { Die "answer: an asked Q" }
  Queue -asks live | Out-Null
  if (@(Get-Content -Encoding UTF8 $Run | Where-Object { $_ -ceq 'asks: live' }).Count -ne 1 -or @(Get-Content -Encoding UTF8 $Run | Where-Object { $_.StartsWith('asks: ') }).Count -ne 1) { Die "queue -Asks live: not one asks: live line" }
  if ((Park2 'F15' 'sync/e.py') -cne 'Q6') { Die "park: Q6" }
  No 'replanned: an open Q' 'only an answered or ruled' { Ans 'Q6' '' -rep "$n8" }
  if ((First) -notlike 'ASK 1 *') { Die "chain next: asks: live did not ask before NEXT: $(First)" }
  Queue -asks end | Out-Null
  if ((First) -notlike 'NEXT *') { Die "chain next: asks: end still asks before NEXT" }
  Park2 'F16' 'x/f.py' | Out-Null
  $script:N = 0; $script:Ticket = 'F17'; $script:Reason = 'taste'; $script:Question = 'Which name?'; $script:Header = 'Naminglong'
  $script:Default = 'a'; $script:Recommended = 'd'; $script:Files = 'x/g.py'; $script:Stop = 'none'; $script:Blocks = 'F17, F18, F19'
  No 'park: a 10-char header' 'chip takes 8' { DoPark @('a | b | c', 'd | e | f') }
  $script:Header = 'Name'; DoPark @('a | b | c', 'd | e | f') | Out-Null
  $qo = (@(Queue) | Where-Object { $_ -cmatch '^Q[0-9]+ ' } | ForEach-Object { $_.Split(' ')[0] }) -join ' '
  if ($qo -cne 'Q8 Q6 Q7') { Die "queue: want Q8 Q6 Q7 (most blocked, then oldest), got '$qo'" }
  $ql8 = @(Queue); $i8 = [array]::IndexOf($ql8, @($ql8 | Where-Object { $_.StartsWith('Q8 ') })[0])
  if ($ql8[$i8 + 1] -cnotlike '   a) d (Recommended)*') { Die "queue: the recommended option is not first" }
  WriteRun (Get-Content -Encoding UTF8 $Run | ForEach-Object { if ($_ -ceq 'header: Name') { 'header: Namingtoolong' } else { $_ } })
  if (-not (@(Queue) -cmatch '^Q8 \[Namingto\] ')) { Die "queue: a hand-made long header was not cut to 8" }
  foreach ($l in @(Queue)) { if ($l -cmatch '^Q[0-9]+ \[([^\]]*)\]' -and $Matches[1].Length -gt 8) { Die "queue: a header over 8 characters" } }
  if (-not ((DoChainStatus) -ccontains '## Decisions')) { Die "chain status: no ## Decisions" }

  # --- FINAL when nothing is dispatchable and nothing holds.
  foreach ($k in 5, 6, 7, 8) { if ((QGet $k 'state') -cnotin @('answered', 'ruled')) { Ans "Q$k" '' -moot 'selftest' | Out-Null } }
  foreach ($k in 2, 5) { Ans "Q$k" '' -moot 'selftest' | Out-Null }
  foreach ($sn in @($m5, $m7, $n8)) { DoStage $sn 'x' '-' "bbb$sn" }
  if ((First) -cne 'FINAL') { Die "chain next: want FINAL: $(First)" }

  # --- the W allocator: Q1, Q100 and Q999 in every state leave the next code as it was.
  $d7 = Join-Path $d6 'alloc'; New-Item -ItemType Directory -Force $d7 | Out-Null; G init -q $d7
  $rf = Join-Path $d7 'run-1-a.md'; [IO.File]::WriteAllText($rf, "### AAAB - stage 1 - x`n")
  $savedNid = $env:RELAY_NEXT_ID; $nid = FindNextId
  $olderr = [Console]::Error; [Console]::SetError([IO.TextWriter]::Null)
  try {
    $env:RELAY_NEXT_ID = Join-Path $d7 'nope.ps1'; $w0 = AllocCode $d7
    if ($null -eq $savedNid) { Remove-Item Env:RELAY_NEXT_ID -ErrorAction SilentlyContinue } else { $env:RELAY_NEXT_ID = $savedNid }
    $p0 = if ($nid) { "$(& $nid -Peek -Runs $d7 W)" } else { '' }
    foreach ($k in 1, 100, 999) { foreach ($s in 'open', 'asked', 'answered', 'ruled', 'moot', 'replanned', 'same-as-Q1') {
      [IO.File]::AppendAllText($rf, "### Q$k $s 2026-10-11T14:02Z`nparked: stage 9 (ZZZZ)`nreplanned: stage 99 (ZZZY)`n") } }
    $env:RELAY_NEXT_ID = Join-Path $d7 'nope.ps1'
    if ((AllocCode $d7) -cne $w0) { Die "AllocCode: Q headers moved the next W code" }
    if ($null -eq $savedNid) { Remove-Item Env:RELAY_NEXT_ID -ErrorAction SilentlyContinue } else { $env:RELAY_NEXT_ID = $savedNid }
    if ($nid -and "$(& $nid -Peek -Runs $d7 W)" -cne $p0) { Die "next-id.ps1: Q headers moved the next W code" }
  } finally {
    [Console]::SetError($olderr)
    if ($null -eq $savedNid) { Remove-Item Env:RELAY_NEXT_ID -ErrorAction SilentlyContinue } else { $env:RELAY_NEXT_ID = $savedNid }
  }

  # --- through -File: chain next prints, a refused park exits 2.
  $o = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode chain -Action next -Run $Run)
  if ($LASTEXITCODE -ne 0 -or $o[0] -cne 'FINAL') { Die "-File: chain next gave '$($o -join ' / ')' / $LASTEXITCODE" }
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode park -Ticket F30 -Reason taste -Question 'A?' -Header A -Option1 'a | b | c' -Default a -Files y/z -Stop none -Run $Run 2>$null | Out-Null }
  finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 2) { Die "-File: a one-option park exited $LASTEXITCODE, not 2" }

  # --- two parks at once get two Qs, under the lock.
  $pa = Spawn "-Mode park -Ticket F20 -Reason taste -Question `"A?`" -Header A -Option1 `"a | b | c`" -Option2 `"d | e | f`" -Default a -Files y/a -Stop none -Run `"$Run`""
  $pb = Spawn "-Mode park -Ticket F21 -Reason taste -Question `"B?`" -Header B -Option1 `"a | b | c`" -Option2 `"d | e | f`" -Default a -Files y/b -Stop none -Run `"$Run`""
  $ra = Reap $pa; $rb = Reap $pb
  if ($ra -ne 0 -or $rb -ne 0) { Die "park: two parallel parks exited $ra and $rb" }
  if (@(Select-String -Path $Run -Pattern '^### Q9 ').Count -ne 1 -or @(Select-String -Path $Run -Pattern '^### Q10 ').Count -ne 1) { Die "park: two parallel parks did not get Q9 and Q10 once each" }
  if (Test-Path "$Run.lock") { Die "marathon: left the lock behind" }

  # --- F33 review (stage 68): one case per finding; each fails on the code
  # before the fix. (Review 7 and 8 are sh-only: no getline here, and -N is an
  # [int].) Its own run, so the numbers above stay as they are.
  $d8 = Join-Path $d6 'review'; New-Item -ItemType Directory -Force $d8 | Out-Null; G init -q $d8
  $script:Dir = Join-Path $d8 '.skillator'; $script:Run = ''; $script:Title = 'review'; $script:Stages = 'r1,r2,r3,r4,r5'
  DoInit | Out-Null
  $r1 = $null; foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -match '^\| (\d+) \| r1 \|') { $r1 = [int]$Matches[1] } }
  $r2 = $r1 + 1; $r3 = $r1 + 2; $r4 = $r1 + 3
  Plan $r1 'F40' 'a.py' '' | Out-Null; Plan $r2 'F41' 'b.py' "$r1" | Out-Null; Plan $r3 'AB12' 'c.py' '' | Out-Null
  # review 3: an unlanded after: stage refuses the dispatch, as a holding Q does.
  $script:Driver = '@cc-v'; No 'review 3: dispatch past an unlanded after:' "waits on stage $r1 (after:)" { DoChainDispatch $r2 }; $script:Driver = ''
  # review 9: a two-letter ticket id (AB12) is a ticket id, as on the board.
  function P3($qq, $hh) { $script:N = 0; $script:Ticket = 'AB12'; $script:Reason = 'fact'; $script:Question = $qq; $script:Header = $hh
    $script:Default = 'a'; $script:Recommended = ''; $script:Files = 'z.py'; $script:Stop = 'none'; $script:Blocks = ''; $script:Done = ''; $script:Gated = ''
    DoPark @('a | b | c', 'd | e | f') }
  if ((P3 'Which key?' 'Key') -cne 'Q1') { Die "review: first park is not Q1" }
  if (-not (Has "IDLE $r3 Q1 blocks")) { Die "review 9: Q1 blocks AB12 and did not hold stage $r3 (tickets AB12): $(@(ChainScan) -join ' / ')" }
  # review 4: keyed on the question too, among the decisions still holding.
  if ((P3 'Which key?' 'Key') -cne 'Q1') { Die "review 4: a repeat did not print the existing Q1" }
  if ((P3 'Which port?' 'Port') -cne 'Q2') { Die "review 4: a second question on the same ticket returned the old Q" }
  Ans 'Q1' '' -moot 'ticket closed' | Out-Null
  if ((P3 'Which key?' 'Key') -cne 'Q3') { Die "review 4: the question parked again after Q1 went moot returned the closed Q1" }
  # review 10: the header is measured trimmed, in characters.
  if ((P3 'Which env?' '  Format  ') -cne 'Q4' -or -not (Select-String -Path $Run -Pattern '^header: Format$' -CaseSensitive -Quiet)) { Die "review 10: a padded 6-character header was refused or stored untrimmed" }
  $U = [string][char]0xDC
  if ((P3 "Which ${U}bersicht?" "${U}bersich") -cne 'Q5') { Die "review 10: an 8-character non-ASCII header was refused" }
  No 'review 10: a 9-character header' 'is 9 characters' { P3 'Which user?' "${U}bersicht" }
  # A123 (c): queue cuts the chip at 8 characters, so an 8-character
  # non-ASCII header shows whole - as on the sh side.
  if (-not (@(Queue) -cmatch ('^Q5 \[' + "${U}bersich" + '\] Which ' + "${U}" + 'bersicht\?  \('))) { Die "A123: queue cut an 8-character non-ASCII header: $(@(Queue) -cmatch '^Q5 ')" }
  # A122: every rewrite read the BOM-less UTF-8 run file as ANSI and wrote it
  # back as UTF-8, so each write re-encoded the non-ASCII bytes (one header
  # grew a run file to 2 GB). Ten rewrites leave its bytes as they were,
  # timestamps aside; Latin-1 maps each byte to one char, so this is bytes.
  function NormRun { [regex]::Replace([Text.Encoding]::GetEncoding(28591).GetString([IO.File]::ReadAllBytes($Run)), '\d{4}-\d\d-\d\dT\d\d:\d\dZ', 'T') }
  $a122 = NormRun
  if (-not $a122.Contains([string][char]0xC3 + [char]0x9C + 'bersicht?')) { Die "A122: the parked question is not UTF-8 on disk" }
  for ($ri = 0; $ri -lt 5; $ri++) { $script:Pct = '84'; $script:Next = ''; $script:Window = '5h'; DoChainHold | Out-Null; DoChainRelease | Out-Null }
  if ((NormRun) -cne $a122) { Die "A122: 10 rewrites changed the bytes of a run file holding non-ASCII text" }
  foreach ($k in 2, 3, 4, 5) { Ans "Q$k" '' -moot 'selftest' | Out-Null }
  # review 5: hold's next= is chain next's NEXT - not the failed first row.
  DoStage $r1 '!' '' ''
  if ((First) -cne "NEXT $r3 $(CodeOf $r3)") { Die "review 5: want NEXT ${r3}: $(First)" }
  $script:Pct = '84'; $script:Next = ''; $script:Window = '5h'
  if ((DoChainHold) -notmatch " next=$r3$") { Die "review 5: chain hold did not name chain next's NEXT ($r3): $((HdrParts)[1])" }
  DoChainRelease | Out-Null
  # review 2: nothing dispatchable is FINAL only when nothing is in flight and
  # nothing pending waits behind a failed stage.
  DoStage $r3 'x' '-' 'ccc3333'
  if ((First) -notlike 'BLOCKED 1 *') { Die "review 2: a stage pending behind a failed one is not BLOCKED: $(First)" }
  DoChainHold | Out-Null
  if ((First) -cne "HOLD $((HdrParts)[1])") { Die "review 2: BLOCKED under a hold is not HOLD: $(First)" }
  DoChainRelease | Out-Null
  DoStage $r1 '~' '' ''
  if ((First) -notlike 'WAIT 1 *') { Die "review 2: a stage in flight is not WAIT: $(First)" }
  # review 1: a `>` row has landed only once the stage it names has.
  Plan $r4 'F40' 'a.py' '' | Out-Null
  DoStage $r1 '>' '-' "stage $r4"
  if ((First) -cne "NEXT $r4 $(CodeOf $r4)" -or -not (Has "IDLE $r2 - after $r1")) { Die "review 1: an after: on a re-planned stage was met before its replacement landed: $(@(ChainScan) -join ' / ')" }
  DoStage $r4 'x' '-' 'ddd4444'
  if ((First) -cne "NEXT $r2 $(CodeOf $r2)") { Die "review 1: the replacement landed and stage $r2 still waits: $(First)" }
  # review 6: list counts a closed `>` row as done.
  if (-not ((DoList) -match ' 3/5 done')) { Die "review 6: list did not count the > row done: $(@(DoList)[0])" }
  if (Test-Path "$Run.lock") { Die "review: left the lock behind" }

  # Cross-mirror: this side parks, relay-morpheus.sh queues and answers, and
  # both `chain next` print the same lines on the same file at every step.
  $shExe = Get-Command sh -ErrorAction SilentlyContinue
  $shScript = Join-Path $PSScriptRoot 'relay-morpheus.sh'
  if ($shExe -and (Test-Path $shScript)) {
    $x = Join-Path $d 'mcross'; New-Item -ItemType Directory -Force $x | Out-Null; G init -q $x
    $script:Dir = Join-Path $x '.skillator'; $script:Run = ''; $script:Title = 'mcross'; $script:Stages = 'F2 export,F5 export,B4 cli,final'
    DoInit | Out-Null
    $x1 = $null; foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -match '^\| (\d+) \| F2 export \|') { $x1 = [int]$Matches[1] } }
    Plan $x1 'F2' 'shelf/export.py' '' | Out-Null; Plan ($x1 + 1) 'F5' 'shelf\export.py' "$x1" | Out-Null; Plan ($x1 + 2) 'B4' '' '' | Out-Null
    $oldRun = $env:RELAY_RUN; $env:RELAY_RUN = $Run.Replace('\', '/')
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
      function Both($why) {
        $a = @(ChainScan) -join "`n"; $b = @(& $shExe.Source $shScript chain next 2>$null) -join "`n"
        if ($a -cne $b) { Die "cross ($why): chain next differs - ps: [$a] sh: [$b]" }
      }
      Both 'planned'
      $script:N = $x1; $script:Ticket = 'F2'; $script:Reason = 'taste'; $script:Question = 'CSV or JSON?'; $script:Header = 'Format'
      $script:Default = 'JSON'; $script:Recommended = 'JSON'; $script:Files = 'shelf/'; $script:Stop = 'none'; $script:Blocks = 'F2, F5'; $script:Done = ''; $script:Gated = ''
      DoPark @($O1, $O2) | Out-Null; DoStage $x1 '?' '' ''
      Both 'parked'
      $sq = @(& $shExe.Source $shScript queue 2>$null)
      if (($sq -join "`n") -cne (@(Queue) -join "`n")) { Die "cross: queue differs - sh: [$($sq -join ' / ')]" }
      $o = (& $shExe.Source $shScript answer Q1 CSV 2>$null) -join ' '
      if ($o -cne 'Q1 answered: CSV' -or (QGet 1 'state') -cne 'answered') { Die "cross: sh answer of a ps park gave '$o'" }
      Both 'answered'
      $o = (& $shExe.Source $shScript answer Q1 JSON 2>$null) -join ' '
      if ($LASTEXITCODE -ne 2) { Die "cross: sh answered a ps-answered Q twice" }
      $b = [IO.File]::ReadAllBytes($Run)
      if ($b[0] -eq 0xEF -or [Text.Encoding]::UTF8.GetString($b) -match "`r") { Die "cross: the shared run file gained a BOM or CR" }
    } finally { $ErrorActionPreference = $prev; $env:RELAY_RUN = $oldRun }
  } else {
    [Console]::Error.WriteLine("note: sh not on PATH - marathon cross-mirror round trip skipped")
  }
  $env:RELAY_CHAIN_DRIVER = $savedDrv; $script:Driver = ''
  Remove-Item Env:RELAY_LEVEL_CMD -ErrorAction SilentlyContinue
}

function DoSelftest {
  $env:RELAY_WORKTREE = 'off'; $env:RELAY_DIR = $null; $env:RELAY_RUN = $null
  $d = Join-Path ([IO.Path]::GetTempPath()) ("relay-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Force $d | Out-Null
  # F80: no ticket-meta (no claims, no owner skips) unless a check turns it on
  $env:RELAY_TICKET_META = Join-Path $d 'nope.ps1'
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

    # The lock must be released on the way out, or the next call spins until it is judged dead.
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

    # --- A153: landing (x) or re-planning (>) a stage drops its In-flight block
    # and nothing else; a failed stage (!) keeps it; a stage with no block is a
    # no-op. Stage 12 is the neighbour whose header starts like stage 1's. The
    # sh selftest asserts the same expected text, so the two ports agree.
    $saved = $script:Run; $script:Run = Join-Path $d "a153.md"
    $blk = { param($k, $s) @("### stage $k - $s  (dispatched 2026-10-01T00:00Z, @t)", 'run: -', 'prompt: |', "  do $s", '') }
    WriteRun (@('# RUN-9 - a153', 'plan: p.md', 'started: 2026-10-01T00:00Z   updated: 2026-10-01T00:00Z', '',
      '## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|-------|-------|-------|-----------|--------|',
      '| 1 | a | ~ | - | - | - |', '| 2 | b | ~ | - | - | - |', '| 3 | c | ~ | - | - | - |', '| 4 | d |   | - | - | - |', '| 12 | e | ~ | - | - | - |', '',
      '## In flight') + (& $blk 1 'a') + (& $blk 12 'e') + (& $blk 2 'b') + (& $blk 3 'c') + @('## Rulings', '- keep this ruling'))
    $a153 = { $l = @(Get-Content -Encoding UTF8 $Run); $i = [array]::IndexOf($l, '## In flight'); ($l[$i..($l.Count - 1)]) -join '/' }
    $a153f = @()
    DoStage 1 'x' '-' 'aaa1531'
    if (Select-String -Path $Run -Pattern '^### stage 1 - ' -Quiet) { $a153f += "x kept stage 1's block" }
    if (-not (Select-String -Path $Run -Pattern '^### stage 12 - ' -Quiet)) { $a153f += "x on stage 1 dropped neighbour stage 12's block" }
    DoStage 2 '!' '' ''
    if (-not (Select-String -Path $Run -Pattern '^### stage 2 - ' -Quiet)) { $a153f += "! dropped stage 2's block" }
    DoStage 3 '>' '-' 'stage 4'
    if (Select-String -Path $Run -Pattern '^### stage 3 - ' -Quiet) { $a153f += "> kept stage 3's block" }
    $before = & $a153
    DoStage 4 'x' '-' 'aaa1534'
    if ((& $a153) -cne $before) { $a153f += "x on a stage with no block changed In flight" }
    $want = (@('## In flight') + (& $blk 12 'e') + (& $blk 2 'b') + @('## Rulings', '- keep this ruling')) -join '/'
    if ((& $a153) -cne $want) { $a153f += "In flight is not exactly stage 12 + stage 2: $(& $a153)" }
    $raw = [IO.File]::ReadAllBytes($Run)
    if ($raw[0] -eq 0xEF) { $a153f += "the run file gained a BOM" }
    if ([Text.Encoding]::UTF8.GetString($raw) -match "`r") { $a153f += "the run file gained CRLF" }
    if ($a153f.Count) { Die ("A153: " + ($a153f -join '; ')) }
    $script:Run = $saved

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
    $n2 = @(Get-Content -Encoding UTF8 $f2 | ForEach-Object { RowNum $_ } | Where-Object { $null -ne $_ })[0]
    & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode stage -N $n2 -State pending -Run $f2 | Out-Null
    if ($LASTEXITCODE -ne 0) { Die "-File: -State pending failed" }

    # --- F44: a new run is RUN-00NN in its file, header and handoff line; an
    # old-format run-7 file resolves by 7, RUN-7 and RUN-0007, and the next run
    # after it is RUN-0008; the owner is set, replaced and cleared in the header
    # and shown by list, status and resume; an unknown or multi-line handle is
    # refused.
    $d44 = Join-Path $d 'f44'; New-Item -ItemType Directory -Force $d44 | Out-Null; G init -q $d44
    $sv44 = @($script:Dir, $script:Run)
    try {
      $script:Dir = $d44; $script:Run = ''; $script:Title = 'third thing'; $script:Stages = 'one'
      $o44 = @(DoInit)
      $f44 = Join-Path $d44 'run-0001-third-thing.md'
      if (-not (Test-Path -LiteralPath $f44)) { Die "F44: the new run file is not run-0001-*: $(Get-ChildItem $d44 -Name)" }
      if (@(Get-Content -Encoding UTF8 $f44)[0] -cne '# RUN-0001 - third thing') { Die "F44: header not RUN-0001: $(@(Get-Content -Encoding UTF8 $f44)[0])" }
      if ($o44 -cnotcontains 'hand this to any session:  continue RUN-0001') { Die "F44: handoff line not padded: $o44" }
      $f7 = Join-Path $d44 'run-7-old-seven.md'
      [IO.File]::WriteAllText($f7, "# RUN-7 - old seven`nplan: o.md`nstarted: 2026-01-01T00:00Z   updated: 2026-01-01T00:00Z`n`n## Stages`n| # | stage | state | owner | heartbeat | landed |`n|---|-------|-------|-------|-----------|--------|`n| 70 | s |   | - | - | - |`n")
      $f7 = (Get-Item -LiteralPath $f7).FullName
      foreach ($sp in @('7', 'RUN-7', 'RUN-0007', 'run-0007', 'run-7')) { if ((Resolve-Run $sp) -ne $f7) { Die "F44: old run-7 did not resolve as '$sp'" } }
      $script:Run = ''; if (-not (@(DoList) -match '^RUN-0007  old seven')) { Die "F44: list did not print the old run padded" }
      # team.md is found as tickets-zordon finds it - from the location's
      # worktree top, then its main checkout - so the owner calls run in $d44.
      $loc44 = (Get-Location).Path; Set-Location $d44
      $script:Run = $f44; $script:Text = '@asha'; $null = DoOwner
      if ((HdrField $f44 'owner') -cne '@asha') { Die "F44: owner not written in the header (no team.md)" }
      [IO.File]::WriteAllText("$d44/team.md", "- @asha: asha@x.com`n")
      $script:Text = '@vidul'; $null = DoOwner   # a team.md outside <top>/.skillator/ is not the team file
      Remove-Item -LiteralPath "$d44/team.md"; New-Item -ItemType Directory -Force "$d44/.skillator" | Out-Null
      [IO.File]::WriteAllText("$d44/.skillator/team.md", "# Team`n`n- @vidul: vidul@ikran.in, v2@x.com`n- @asha: asha@x.com`n")
      $script:Text = '@vidul'; $null = DoOwner
      if (@(Get-Content -Encoding UTF8 $f44 | Where-Object { $_ -like 'owner: *' }).Count -ne 1 -or (HdrField $f44 'owner') -cne '@vidul') { Die "F44: owner was not replaced" }
      $script:Text = '@zed'; ShouldFail 'is not in' { DoOwner }
      $script:Text = "@vidul`n@asha"; ShouldFail 'more than one line' { DoOwner }
      $script:Text = 'vidul'; ShouldFail 'not an @handle' { DoOwner }
      if ((HdrField $f44 'owner') -cne '@vidul') { Die "F44: a refused owner changed the header" }
      if (Test-Path "$f44.lock") { Die "F44: owner left the lock behind" }
      $script:Run = ''; if (-not (@(DoList) -ceq '          owner: @vidul')) { Die "F44: list does not show the owner" }
      $script:Run = $f44; if (@(DoStatus)[0] -cne 'owner: @vidul') { Die "F44: status does not show the owner" }
      if (-not (@(DoResume 1) -ceq '# Run owner: @vidul')) { Die "F44: resume does not show the owner" }
      $script:Text = '-'; $null = DoOwner
      if (@(Get-Content -Encoding UTF8 $f44 | Where-Object { $_ -like 'owner: *' }).Count) { Die "F44: owner - did not clear it" }
      $script:Run = ''; $script:Title = 'fourth thing'; $script:RunOwner = '@asha'; $null = DoInit
      $f48 = Join-Path $d44 'run-0008-fourth-thing.md'
      if (-not (Test-Path -LiteralPath $f48) -or (HdrField $f48 'owner') -cne '@asha') { Die "F44: the run after run-7 is not RUN-0008 with its owner: $(Get-ChildItem $d44 -Name)" }
      $script:Run = ''; $script:Title = 'fifth'; $script:RunOwner = '@zed'; ShouldFail 'is not in' { DoInit }
      Set-Location $loc44
      # F44 review: the RUN- prefix in any case; more than 9 digits is not a
      # run id (no Int64 overflow); list walks the runs in number order.
      foreach ($sp in @('Run-7', 'rUN-0007')) { if ((Resolve-Run $sp) -ne $f7) { Die "F44: '$sp' did not resolve (prefix case)" } }
      if ((RunIdArg 'Run-12') -cne 'RUN-0012') { Die "F44: RunIdArg Run-12 is not RUN-0012" }
      ShouldFail "'1234567890' is not a run id" { RunIdArg '1234567890' }
      ShouldFail "is not a run id" { RunIdArg '12345678901234567890' }
      if ($null -ne (Resolve-Run 'RUN-12345678901234567890')) { Die "F44: Resolve-Run accepted a 20-digit id" }
      $d9 = Join-Path $d 'f44order'; New-Item -ItemType Directory -Force $d9 | Out-Null
      foreach ($x in @('1-a', '2-b', '0012-c')) { [IO.File]::WriteAllText("$d9/run-$x.md", "# RUN-$($x.Split('-')[0]) - $($x.Split('-')[1])`nplan: p`n`n## Stages`n") }
      $script:Dir = $d9; $script:Run = ''
      $ord = (@(DoList | Where-Object { $_ -match '^RUN-' } | ForEach-Object { $_.Split(' ')[0] }) -join ' ')
      if ($ord -cne 'RUN-0001 RUN-0002 RUN-0012') { Die "F44: list is not in run-number order: $ord" }
    } finally { if ($loc44) { Set-Location $loc44 }; $script:Dir = $sv44[0]; $script:Run = $sv44[1]; $script:Title = 'selftest'; $script:Stages = 'alpha,beta'; $script:Text = ''; $script:RunOwner = '' }

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
      $fl = @(Get-Content -Encoding UTF8 $f4); $p = [array]::FindIndex($fl, [Predicate[string]]{ $args[0] -match '^\| 25 \|' })
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

    # F35: two runs from one clone, each in its own worktree on its own branch;
    # neither run's commit shows in the other, main's HEAD and index untouched;
    # a run started inside a run worktree lands in the main ledger; resume
    # recreates a deleted worktree from its branch; -Here makes none.
    $d5 = (Join-Path ([IO.Path]::GetTempPath()) ("relay-f35-" + [guid]::NewGuid())) -replace '\\', '/'
    try {
      $m5 = "$d5/m"; G init -q $m5; G -C $m5 commit -q --allow-empty -m base
      $base = @(GitOut @('-C', $m5, 'rev-parse', 'HEAD'))[0]
      $me = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
      $env:RELAY_WORKTREE = 'on'
      function Rm5([string]$at, [string[]]$a) { Push-Location $at; $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        try { $o = & powershell @me @a 2>&1 | ForEach-Object { "$_" } | Out-String; if ($LASTEXITCODE -ne 0) { Die "F35: $($a -join ' ') failed: $o" }; $o } finally { $ErrorActionPreference = $prev; Pop-Location } }
      [IO.File]::WriteAllText("$m5/plan.md", "the plan`n")
      $null = Rm5 $m5 @('-Mode', 'init', '-Plan', 'plan.md', '-Title', 'alpha', '-Stages', 's1')
      $null = Rm5 $m5 @('-Mode', 'init', '-Plan', 'p.md', '-Title', 'beta', '-Stages', 's1')
      $fa = @(Get-ChildItem "$m5/.skillator" -Filter 'run-*-alpha.md')[0].FullName; $fb = @(Get-ChildItem "$m5/.skillator" -Filter 'run-*-beta.md')[0].FullName
      if (-not $fa -or -not $fb) { Die "F35: run files not in the main ledger" }
      $hdr = { param($f, $k) ((Get-Content -Encoding UTF8 $f) | Where-Object { $_ -like "${k}: *" } | Select-Object -First 1) -replace "^${k}: ", '' }
      $wa = & $hdr $fa 'worktree'; $wb = & $hdr $fb 'worktree'; $ba = & $hdr $fa 'branch'; $bb = & $hdr $fb 'branch'
      if (-not (Test-Path $wa) -or -not (Test-Path $wb) -or $wa -eq $wb) { Die "F35: no separate worktrees ($wa, $wb)" }
      if ($wa -notmatch '/m/\.skillator/worktrees/RUN-\d{4}-alpha$') { Die "A126: the run worktree is not under the repo's .skillator/worktrees: $wa" }
      if (@(GitOut @('-C', $wa, 'config', 'core.longpaths'))[0] -cne 'true') { Die "A129: the run worktree has no core.longpaths" }
      if (@(GitOut @('-C', $m5, 'status', '--porcelain', '--', '.skillator/worktrees')).Count) { Die "A126: the worktrees show up in the main checkout's status" }
      if ($ba -notmatch '^run/RUN-\d{4}-alpha$' -or $bb -notmatch '^run/RUN-\d{4}-beta$') { Die "F35/F44: branches not run/RUN-00nn-<slug>: $ba $bb" }
      if (-not (Test-Path "$wa/plan.md") -or [IO.File]::ReadAllText("$wa/plan.md").Trim() -ne 'the plan') { Die "F35: the uncommitted plan was not copied into the run worktree" }
      [IO.File]::WriteAllText("$wa/a.txt", "a`n"); G -C $wa add a.txt; G -C $wa commit -q -m 'stage alpha'
      [IO.File]::WriteAllText("$wb/b.txt", "b`n"); G -C $wb add b.txt; G -C $wb commit -q -m 'stage beta'
      if ((@(GitOut @('-C', $m5, 'diff', '--name-only', $base, $ba)) -join ',') -ne 'a.txt') { Die "F35: alpha's branch carries more than its own commit" }
      if ((@(GitOut @('-C', $m5, 'diff', '--name-only', $base, $bb)) -join ',') -ne 'b.txt') { Die "F35: beta's branch carries more than its own commit" }
      if (@(GitOut @('-C', $m5, 'rev-parse', 'HEAD'))[0] -ne $base) { Die "F35: main's HEAD moved" }
      if (@(GitOut @('-C', $m5, 'status', '--porcelain', '--', '.', ':!.skillator', ':!plan.md')).Count) { Die "F35: main's index or tree moved" }
      $null = Rm5 $wa @('-Mode', 'init', '-Plan', 'p.md', '-Title', 'gamma', '-Stages', 's1')
      $fg = @(Get-ChildItem "$m5/.skillator" -Filter 'run-*-gamma.md')
      if (-not $fg) { Die "F35: a run started in a worktree did not land in the main ledger" }
      if (-not (GitOk @('-C', $m5, 'merge-base', '--is-ancestor', $ba, (HdrField $fg[0].FullName 'branch')))) { Die "F35: a run started in alpha's worktree did not branch from alpha" }
      if ((Test-Path "$wa/.skillator") -and (Get-ChildItem "$wa/.skillator" -Filter 'run-*-gamma.md')) { Die "F35: the run file was written on the run branch" }
      if (-not ((Rm5 $m5 @('-Mode', 'list')) -match [regex]::Escape("worktree: $wa"))) { Die "F35: list does not show the worktree" }
      Remove-Item -Recurse -Force $wa
      $ida = IdOf (Split-Path -Leaf $fa)
      if (-not ((Rm5 $m5 @('-Mode', 'resume', '-Id', $ida)) -match [regex]::Escape("Stages work and commit in: $wa"))) { Die "F35: resume does not name the worktree" }
      if (-not (Test-Path "$wa/a.txt")) { Die "F35: resume did not recreate the worktree from its branch" }
      $null = Rm5 $m5 @('-Mode', 'init', '-Here', '-Plan', 'p.md', '-Title', 'delta', '-Stages', 's1')
      $fd = @(Get-ChildItem "$m5/.skillator" -Filter 'run-*-delta.md')[0].FullName
      if ((Get-Content -Encoding UTF8 $fd) -match '^worktree:') { Die "F35: -Here made a worktree" }
    } finally {
      $env:RELAY_WORKTREE = 'off'
      Remove-Item -Recurse -Force $d5 -ErrorAction SilentlyContinue   # the worktrees sit in $d5/m/.skillator/worktrees
    }

    # F36: two runs plan one file; the first dispatch leases it, the second run
    # is refused (LEASED, exit 2) and idles in chain next until the first lands;
    # a stale lease is taken with a ruling; board flips one ticket in TICKETS.md.
    $d6 = (Join-Path $d 'lease') -replace '\\', '/'
    New-Item -ItemType Directory -Force $d6 | Out-Null; G init -q $d6
    $me6 = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath)
    $svl = $env:RELAY_LEVEL_CMD; $env:RELAY_LEVEL_CMD = "echo 'src=codex 5h=10 7d=10 ctx=- max=10'"
    function R6([string[]]$a) { Push-Location $d6; $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { $o = & powershell @me6 @a 2>&1 | ForEach-Object { "$_" } | Out-String; [pscustomobject]@{ rc = $LASTEXITCODE; out = $o } } finally { $ErrorActionPreference = $prev; Pop-Location } }
    try {
      $null = R6 @('-Mode', 'init', '-Plan', 'T.md', '-Title', 'lease a', '-Stages', 'A one,A two')
      $null = R6 @('-Mode', 'init', '-Plan', 'T.md', '-Title', 'lease b', '-Stages', 'B one')
      $ra = @(Get-ChildItem "$d6/.skillator" -Filter 'run-*-lease-a.md')[0].FullName; $rb = @(Get-ChildItem "$d6/.skillator" -Filter 'run-*-lease-b.md')[0].FullName
      $num = { param($f, $nm) foreach ($l in (Get-Content -Encoding UTF8 $f)) { if ($l -match "^\| (\d+) \| $nm \|") { return $Matches[1] } } }
      $sa = & $num $ra 'A one'; $sa2 = & $num $ra 'A two'; $sb = & $num $rb 'B one'
      [IO.File]::WriteAllText("$d6/p", "x`n")
      foreach ($pl in @(@($ra, $sa, 'src/x.py'), @($ra, $sa2, 'src/x.py/'), @($rb, $sb, './src'))) {
        $o = R6 @('-Mode', 'chain', '-Action', 'plan', '-N', $pl[1], '-PromptFile', "$d6/p", '-Files', $pl[2], '-Run', $pl[0]); if ($o.rc -ne 0) { Die "F36: plan $($pl[1]): $($o.out)" } }
      $ida = IdOf (Split-Path -Leaf $ra); $idb = IdOf (Split-Path -Leaf $rb)
      # F44: a pre-F44 run's row (RUN-7, unpadded) is left as written for an
      # older relay-morpheus sharing the registry, and A's own row in the
      # unpadded spelling is A's - a redispatch replaces it, not refused.
      $reg = "$d6/.git/skillator/leases"; New-Item -ItemType Directory -Force (Split-Path -Parent $reg) | Out-Null
      [IO.File]::WriteAllText($reg, "old/y.py`tRUN-7`t70`t@o`t$(Now)`nsrc/x.py`tRUN-$([int]$ida)`t$sa`t@a`t$(Now)`n")
      $svr = $script:Run; $script:Run = "$d6/run-7-old.md"; $t7 = RunTag; $script:Run = $ra; $ta = RunTag; $script:Run = $svr
      if ($t7 -cne 'RUN-7' -or $ta -cne "RUN-$ida") { Die "F44: RunTag does not spell the id as the run file does: $t7 $ta" }
      $o = R6 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $sa, '-Driver', '@a', '-Run', $ra); if ($o.rc -ne 0) { Die "F36: dispatch A: $($o.out)" }
      if (-not ((Get-Content -Encoding UTF8 $reg) -match "^old/y\.py`tRUN-7`t70`t")) { Die "F44: a pre-F44 run's lease row was rewritten: $(Get-Content $reg)" }
      if (@((Get-Content -Encoding UTF8 $reg) -match "^src/x\.py`t").Count -ne 1) { Die "F44: A's unpadded row was not replaced by its redispatch: $(Get-Content $reg)" }
      if (-not ((Get-Content -Encoding UTF8 $reg) -match "^src/x\.py`tRUN-$ida`t$sa`t@a`t")) { Die "F36: dispatch did not lease src/x.py: $(Get-Content $reg)" }
      $o = R6 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $sb, '-Driver', '@b', '-Run', $rb)
      if ($o.rc -ne 2 -or $o.out -notmatch [regex]::Escape("LEASED src/x.py RUN-$ida stage $sa")) { Die "F36: B dispatched over A's live lease (rc $($o.rc)): $($o.out)" }
      $o = R6 @('-Mode', 'chain', '-Action', 'next', '-Run', $rb)
      if ($o.out -notmatch [regex]::Escape("IDLE $sb leased src RUN-$ida stage $sa") -or $o.out -match "NEXT $sb ") { Die "F36: chain next did not idle B on the lease: $($o.out)" }
      $o = R6 @('-Mode', 'stage', '-N', $sa, '-State', 'x', '-Landed', 'abc1234', '-Run', $ra); if ($o.rc -ne 0) { Die "F36: land A: $($o.out)" }
      if ((Get-Content -Encoding UTF8 $reg) -match "`tRUN-$ida`t$sa`t") { Die "F36: landing did not release the lease" }
      $o = R6 @('-Mode', 'chain', '-Action', 'next', '-Run', $rb); if ($o.out -notmatch "NEXT $sb ") { Die "F36: B still idle after A landed: $($o.out)" }
      $o = R6 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $sb, '-Driver', '@b', '-Run', $rb); if ($o.rc -ne 0) { Die "F36: B could not dispatch after A landed: $($o.out)" }
      $env:RELAY_LEASE_STALE = '-1'
      try { $o = R6 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $sa2, '-Driver', '@a', '-Run', $ra) } finally { $env:RELAY_LEASE_STALE = $null }
      if ($o.rc -ne 0) { Die "F36: a stale lease was not taken: $($o.out)" }
      if (-not (Select-String -LiteralPath $ra -Pattern "lease on src from RUN-$idb stage $sb was .* stale" -Quiet)) { Die "F36: taking a stale lease left no ruling" }
      [IO.File]::WriteAllText("$d6/TICKETS.md", "# board`n- [ ] F9 $([char]0x2014) lease me`n- [ ] F90 $([char]0x2014) not me`n", (New-Object Text.UTF8Encoding($false)))
      $o = R6 @('-Mode', 'board', '-Ticket', 'F9', '-Mark', '~'); if ($o.rc -ne 0) { Die "F36: board failed: $($o.out)" }
      $tl = [IO.File]::ReadAllText("$d6/TICKETS.md")
      if (-not $tl.Contains("- [~] F9 $([char]0x2014) lease me`n") -or -not $tl.Contains("- [ ] F90 $([char]0x2014) not me")) { Die "F36: board flipped the wrong line: $tl" }
      # F45: '?' (pending decision) is a mark like the others.
      $o = R6 @('-Mode', 'board', '-Ticket', 'F9', '-Mark', '?'); if ($o.rc -ne 0) { Die "F45: board refused mark '?': $($o.out)" }
      $tl = [IO.File]::ReadAllText("$d6/TICKETS.md")
      if (-not $tl.Contains("- [?] F9 $([char]0x2014) lease me`n") -or -not $tl.Contains("- [ ] F90 $([char]0x2014) not me")) { Die "F45: board did not set [?]: $tl" }
      # F62: '%' (testing) is a mark like the others.
      $o = R6 @('-Mode', 'board', '-Ticket', 'F9', '-Mark', '%'); if ($o.rc -ne 0) { Die "F62: board refused mark '%': $($o.out)" }
      $tl = [IO.File]::ReadAllText("$d6/TICKETS.md")
      if (-not $tl.Contains("- [%] F9 $([char]0x2014) lease me`n") -or -not $tl.Contains("- [ ] F90 $([char]0x2014) not me")) { Die "F62: board did not set [%]: $tl" }
      if ((R6 @('-Mode', 'board', '-Ticket', 'F91', '-Mark', 'x')).rc -eq 0) { Die "F36: board accepted a missing ticket" }
      if ((Test-Path "$d6/TICKETS.md.lock") -or (Test-Path "$reg.lock")) { Die "F36: a lock was left behind" }
    } finally { $env:RELAY_LEVEL_CMD = $svl }

    # F37: four stages - a.py, b.py, a.py again, c.py. -All at cap 2 offers the
    # first two and idles c on slots; at cap 3 it idles the second a.py on the
    # first; two are in flight at once, the second in its own worktree; chain
    # merge brings a clean stage back, a conflicting one exits 3 with the run
    # branch untouched. The cap follows usage.
    $d7 = (Join-Path $d 'par') -replace '\\', '/'
    New-Item -ItemType Directory -Force $d7 | Out-Null; G init -q $d7; G -C $d7 commit -q --allow-empty -m base
    $svl = $env:RELAY_LEVEL_CMD; $env:RELAY_LEVEL_CMD = "echo 'src=codex 5h=10 7d=10 ctx=- max=10'"
    function R7([string[]]$a) { Push-Location $d7; $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { $o = & powershell @me6 @a 2>&1 | ForEach-Object { "$_" } | Out-String; [pscustomobject]@{ rc = $LASTEXITCODE; out = $o } } finally { $ErrorActionPreference = $prev; Pop-Location } }
    try {
      $env:RELAY_WORKTREE = 'on'
      try { $o = R7 @('-Mode', 'init', '-Plan', 'T.md', '-Title', 'par', '-Stages', 'P a,P b,P a2,P c') } finally { $env:RELAY_WORKTREE = 'off' }
      if ($o.rc -ne 0) { Die "F37: init: $($o.out)" }
      $r7 = @(Get-ChildItem "$d7/.skillator" -Filter 'run-*-par.md')[0].FullName; $rwt = HdrField $r7 'worktree'
      if (-not (Test-Path $rwt)) { Die "F37: no run worktree" }
      $p1 = & $num $r7 'P a'; $p2 = & $num $r7 'P b'; $p3 = & $num $r7 'P a2'; $p4 = & $num $r7 'P c'
      [IO.File]::WriteAllText("$d7/p", "x`n")
      foreach ($pl in @(@($p1, 'a.py'), @($p2, 'b.py'), @($p3, 'a.py'), @($p4, 'c.py'))) {
        $o = R7 @('-Mode', 'chain', '-Action', 'plan', '-N', $pl[0], '-PromptFile', "$d7/p", '-Files', $pl[1], '-Run', $r7); if ($o.rc -ne 0) { Die "F37: plan $($pl[0]): $($o.out)" } }
      $env:RELAY_CHAIN_PARALLEL = '2'
      try { $o = R7 @('-Mode', 'chain', '-Action', 'next', '-All', '-Run', $r7) } finally { $env:RELAY_CHAIN_PARALLEL = $null }
      if (@([regex]::Matches($o.out, '(?m)^NEXT ')).Count -ne 2 -or $o.out -notmatch "(?m)^NEXT $p1 " -or $o.out -notmatch "(?m)^NEXT $p2 " -or $o.out -notmatch "(?m)^IDLE $p4 slots\s*$") { Die "F37: -All at cap 2: $($o.out)" }
      $env:RELAY_CHAIN_PARALLEL = '3'
      try { $o = R7 @('-Mode', 'chain', '-Action', 'next', '-All', '-Run', $r7) } finally { $env:RELAY_CHAIN_PARALLEL = $null }
      if (@([regex]::Matches($o.out, '(?m)^NEXT ')).Count -ne 3 -or $o.out -notmatch "(?m)^IDLE $p3 parallel-files $p1\s*$") { Die "F37: -All at cap 3: $($o.out)" }
      $svr = $script:Run; $script:Run = $r7
      try {
        $env:RELAY_LEVEL_CMD = "echo 'src=codex 5h=60 7d=10 ctx=- max=60'"; $c1 = ParallelCap
        $env:RELAY_LEVEL_CMD = "echo 'src=codex 5h=10 7d=10 ctx=- max=10'"; $c2 = ParallelCap
        $env:RELAY_LEVEL_CMD = "echo nothing"; $c3 = ParallelCap
      } finally { $script:Run = $svr; $env:RELAY_LEVEL_CMD = "echo 'src=codex 5h=10 7d=10 ctx=- max=10'" }
      if ($c1 -ne 1 -or $c2 -ne 2 -or $c3 -ne 1) { Die "F37: the cap does not follow usage ($c1 $c2 $c3)" }
      $o = R7 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $p1, '-Driver', '@p', '-Run', $r7); if ($o.rc -ne 0) { Die "F37: dispatch ${p1}: $($o.out)" }
      $o = R7 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $p2, '-Driver', '@p', '-Run', $r7); if ($o.rc -ne 0) { Die "F37: dispatch $p2 beside ${p1}: $($o.out)" }
      $svr = $script:Run; $script:Run = $r7
      try { $s1st = RowCellN $p1 3; $s2st = RowCellN $p2 3; $w1 = InflightField $p1 'worktree'; $sw2 = InflightField $p2 'worktree' } finally { $script:Run = $svr }
      if ($s1st -cne '~' -or $s2st -cne '~') { Die "F37: two stages are not in flight at once" }
      if ($w1 -or -not $sw2 -or -not (Test-Path $sw2)) { Die "F37: the second stage has no worktree of its own" }
      if ((R7 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $p3, '-Driver', '@p', '-Run', $r7)).rc -ne 2) { Die "F37: a stage sharing a.py with one in flight dispatched" }
      $env:RELAY_CHAIN_PARALLEL = '2'
      try { $o = R7 @('-Mode', 'chain', '-Action', 'next', '-All', '-Run', $r7) } finally { $env:RELAY_CHAIN_PARALLEL = $null }
      if ($o.out -notmatch '(?m)^WAIT 2 ') { Die "F37: two in flight at cap 2 is not WAIT: $($o.out)" }
      [IO.File]::WriteAllText("$sw2/b.py", "b`n"); G -C $sw2 add b.py; G -C $sw2 commit -q -m 'stage b'
      $env:GIT_AUTHOR_NAME = 't'; $env:GIT_AUTHOR_EMAIL = 't@t'; $env:GIT_COMMITTER_NAME = 't'; $env:GIT_COMMITTER_EMAIL = 't@t'
      try {
        $o = R7 @('-Mode', 'chain', '-Action', 'merge', '-N', $p2, '-Run', $r7); if ($o.rc -ne 0) { Die "F37: a clean stage did not merge: $($o.out)" }
        if (-not (Test-Path "$rwt/b.py") -or (Test-Path $sw2)) { Die "F37: merge did not land b.py on the run branch or left the stage worktree" }
        $sha = @(GitOut @('-C', $rwt, 'rev-parse', '--short', 'HEAD'))[0]
        $o = R7 @('-Mode', 'stage', '-N', $p2, '-State', 'x', '-Landed', $sha, '-Run', $r7); if ($o.rc -ne 0) { Die "F37: land ${p2}: $($o.out)" }
        $o = R7 @('-Mode', 'chain', '-Action', 'dispatch', '-N', $p4, '-Driver', '@p', '-Run', $r7); if ($o.rc -ne 0) { Die "F37: dispatch ${p4}: $($o.out)" }
        $svr = $script:Run; $script:Run = $r7; try { $sw4 = InflightField $p4 'worktree' } finally { $script:Run = $svr }
        if (-not $sw4 -or -not (Test-Path $sw4)) { Die "F37: no worktree for $p4" }
        [IO.File]::WriteAllText("$sw4/a.py", "y`n"); [IO.File]::WriteAllText("$sw4/c.py", "c`n"); G -C $sw4 add a.py c.py; G -C $sw4 commit -q -m 'stage c, strays into a.py'
        [IO.File]::WriteAllText("$rwt/a.py", "x`n"); G -C $rwt add a.py; G -C $rwt commit -q -m 'stage a'
        $h7 = @(GitOut @('-C', $rwt, 'rev-parse', 'HEAD'))[0]
        $o = R7 @('-Mode', 'chain', '-Action', 'merge', '-N', $p4, '-Run', $r7)
        if ($o.rc -ne 3 -or @(GitOut @('-C', $rwt, 'rev-parse', 'HEAD'))[0] -ne $h7 -or (Test-Path "$rwt/.git/MERGE_HEAD") -or @(GitOut @('-C', $rwt, 'status', '--porcelain')).Count) { Die "F37: a conflicting merge did not exit 3 with the run branch untouched (rc $($o.rc)): $($o.out)" }
      } finally { foreach ($k in 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL') { Set-Item "env:$k" $null } }
    } finally { $env:RELAY_LEVEL_CMD = $svl }

    # F38: two queued runs start one at a time; a paused run is skipped; away
    # on/off; each lands on main by start (rebase) then finish (ff), one at a
    # time, worktree and branch removed; a landing conflict exits 3 with
    # nothing moved; queue -All lists both runs' open decisions once.
    $d8 = (Join-Path $d 'queue') -replace '\\', '/'
    New-Item -ItemType Directory -Force $d8 | Out-Null; G init -q $d8
    [IO.File]::WriteAllText("$d8/m.txt", "base`n"); G -C $d8 add m.txt; G -C $d8 commit -q -m base
    function R8([string[]]$a) { Push-Location $d8; $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      try { $o = & powershell @me6 @a 2>&1 | ForEach-Object { "$_" } | Out-String; [pscustomobject]@{ rc = $LASTEXITCODE; out = $o.Trim() } } finally { $ErrorActionPreference = $prev; Pop-Location } }
    $env:RELAY_WORKTREE = 'on'
    try { $null = R8 @('-Mode', 'init', '-Plan', 'T.md', '-Title', 'one', '-Stages', 'o1'); $null = R8 @('-Mode', 'init', '-Plan', 'T.md', '-Title', 'two', '-Stages', 't1') } finally { $env:RELAY_WORKTREE = 'off' }
    $f1 = @(Get-ChildItem "$d8/.skillator" -Filter 'run-*-one.md')[0].FullName; $f2 = @(Get-ChildItem "$d8/.skillator" -Filter 'run-*-two.md')[0].FullName
    $n1 = IdOf (Split-Path -Leaf $f1); $n2 = IdOf (Split-Path -Leaf $f2); $i1 = "RUN-$n1"; $i2 = "RUN-$n2"
    # Not $n: names are case-blind, and DoPark below reads the script's $N.
    if ($i1 -notmatch '^RUN-\d{4}$' -or $i2 -notmatch '^RUN-\d{4}$') { Die "F44: run ids not padded: $i1 $i2" }
    # F44: add <n> and add RUN-00nn are one row; a row written before F44
    # (RUN-<n>, unpadded) is the same run, and the rest of F38 runs on it.
    if ((R8 @('-Mode', 'queue-run', '-Sub', 'add', '-Id', "$([int]$n1)")).rc -ne 0) { Die "F38: add $n1" }
    if ((R8 @('-Mode', 'queue-run', '-Sub', 'add', '-Id', $i1)).out -notmatch 'already queued') { Die "F44: add RUN-00nn after add <n> did not see the row" }
    if (@(Get-Content -Encoding UTF8 "$d8/.skillator/queue.md" | Where-Object { $_ -match "^\| \d+ \| $i1 \| queued \|" }).Count -ne 1) { Die "F44: queue row not written padded, once" }
    [IO.File]::AppendAllText("$d8/.skillator/queue.md", "| 2 | RUN-$([int]$n2) | queued | $(Now) |`n")
    if ((R8 @('-Mode', 'queue-run', '-Sub', 'add', '-Id', $i2)).out -notmatch 'already queued') { Die "F44: an old-format RUN-<n> row is not the same run" }
    $qf = @(Get-Content -Encoding UTF8 "$d8/.skillator/queue.md")
    if (-not ($qf -match "^\| 2 \| $i2 \| queued \|") -or ($qf -match "^\| 2 \| RUN-$([int]$n2) \|")) { Die "F44: the old-format row was not rewritten padded: $qf" }
    if ((R8 @('-Mode', 'owner', '-Id', $n1, '-Text', '@lead')).rc -ne 0) { Die "F44: owner on a queued run" }
    $ql = (R8 @('-Mode', 'queue-run', '-Sub', 'list')).out
    if ($ql -notmatch "(?m)^\| 1 \| $i1 \| queued \| .* \| @lead \|\s*$" -or $ql -notmatch "(?m)^\| 2 \| $i2 \| queued \| .* \| - \|\s*$") { Die "F44: queue-run list does not show padded ids and owners: $ql" }
    if ((R8 @('-Mode', 'queue-run', '-Sub', 'next')).out -cne "START $i1") { Die "F38: next is not the first queued run" }
    $null = R8 @('-Mode', 'queue-run', '-Sub', 'start', '-Id', $n1)
    if ((R8 @('-Mode', 'queue-run', '-Sub', 'next')).out -cne "BUSY $i1 running") { Die "F38: a second run would start beside the first" }
    $null = R8 @('-Mode', 'queue-run', '-Sub', 'pause', '-Id', $n1)
    if ((R8 @('-Mode', 'queue-run', '-Sub', 'next')).out -cne "START $i2") { Die "F38: a paused run blocked the queue" }
    $null = R8 @('-Mode', 'queue-run', '-Sub', 'start', '-Id', $n2)
    $o = R8 @('-Mode', 'queue-run', '-Sub', 'start', '-Id', $n1)
    if ($o.rc -ne 2) { Die "F38: a second run started while one runs" }
    if ($o.out -notmatch "BUSY $i2 running ") { Die "F44: the BUSY refusal does not name the padded id: $($o.out)" }
    $null = R8 @('-Mode', 'queue-run', '-Sub', 'pause', '-Id', $n2); $null = R8 @('-Mode', 'queue-run', '-Sub', 'start', '-Id', $n1)
    if ((R8 @('-Mode', 'queue-run', '-Sub', 'add', '-Id', '999')).rc -eq 0) { Die "F38: queued a run that does not exist" }
    $null = R8 @('-Mode', 'away', '-Sub', 'on'); if (-not (Select-String -LiteralPath "$d8/.skillator/queue.md" -Pattern '^away: 20' -Quiet)) { Die "F38: away on" }
    $null = R8 @('-Mode', 'away', '-Sub', 'off'); if (-not (Select-String -LiteralPath "$d8/.skillator/queue.md" -Pattern '^away: -$' -Quiet)) { Die "F38: away off" }
    $w1 = HdrField $f1 'worktree'; $w2 = HdrField $f2 'worktree'; $b1 = HdrField $f1 'branch'
    [IO.File]::WriteAllText("$w1/one.txt", "one`n"); G -C $w1 add one.txt; G -C $w1 commit -q -m one
    [IO.File]::WriteAllText("$w2/two.txt", "two`n"); G -C $w2 add two.txt; G -C $w2 commit -q -m two
    $ft = @(Get-Content -Encoding UTF8 $f1 | ForEach-Object { RowNum $_ } | Where-Object { $null -ne $_ })[-1]
    $null = R8 @('-Mode', 'stage', '-N', $ft, '-State', '~', '-Owner', 'main', '-Run', $f1)
    # A129: a rebase that fails for a non-conflict reason (the main branch
    # does not resolve) is git's error, exit 1, with no rebase left in progress.
    $ob = @(GitOut @('-C', $d8, 'symbolic-ref', 'HEAD'))[0]; G -C $d8 symbolic-ref HEAD refs/heads/a129-missing
    $o = R8 @('-Mode', 'land', '-Id', $n1, '-Sub', 'start')
    G -C $d8 symbolic-ref HEAD $ob
    if ($o.rc -ne 1 -or $o.out -notmatch 'FAIL: land: git rebase failed before any conflict: .*a129-missing') { Die "A129: a non-conflict rebase failure gave rc $($o.rc): $($o.out)" }
    foreach ($x in @(GitOut @('-C', $w1, 'rev-parse', '--path-format=absolute', '--git-path', 'rebase-merge', '--git-path', 'rebase-apply'))) { if (Test-Path -LiteralPath $x) { Die "A129: left a rebase in progress: $x" } }
    if (-not (Select-String -LiteralPath "$d8/.skillator/queue.md" -Pattern '^landing: -$' -Quiet)) { Die "A129: a failed rebase took the landing" }
    $o = R8 @('-Mode', 'land', '-Id', $n1, '-Sub', 'start'); if ($o.rc -ne 0) { Die "F38: land one start (A127: the landing stage itself is in flight): $($o.out)" }
    if ((R8 @('-Mode', 'land', '-Id', $n2, '-Sub', 'start')).rc -ne 2) { Die "F38: a second run started landing beside the first" }
    $o = R8 @('-Mode', 'land', '-Id', $n1, '-Sub', 'finish'); if ($o.rc -ne 0) { Die "F38: land one finish: $($o.out)" }
    if (-not (Test-Path "$d8/one.txt") -or (Test-Path $w1) -or (GitOk @('-C', $d8, 'rev-parse', '-q', '--verify', "refs/heads/$b1"))) { Die "F38: one did not land on main, or left its worktree/branch" }
    if ((QState "$d8/.skillator/queue.md" $i1) -cne 'landed') { Die "F38: the queue does not say one landed" }
    [IO.File]::WriteAllText("$d8/m.txt", "clash`n"); G -C $d8 commit -q -am 'main moves'
    [IO.File]::WriteAllText("$w2/m.txt", "other`n"); G -C $w2 commit -q -am 'two clashes'
    $h8 = @(GitOut @('-C', $d8, 'rev-parse', 'HEAD'))[0]; $t8 = @(GitOut @('-C', $w2, 'rev-parse', 'HEAD'))[0]
    $o = R8 @('-Mode', 'land', '-Id', $n2, '-Sub', 'start')
    if ($o.rc -ne 3 -or @(GitOut @('-C', $d8, 'rev-parse', 'HEAD'))[0] -ne $h8 -or @(GitOut @('-C', $w2, 'rev-parse', 'HEAD'))[0] -ne $t8 -or -not (Select-String -LiteralPath "$d8/.skillator/queue.md" -Pattern '^landing: -$' -Quiet)) { Die "F38: a landing conflict did not exit 3 with nothing moved (rc $($o.rc)): $($o.out)" }
    foreach ($pr in @(@($f1, 'o1', 'F1', 'One?'), @($f2, 't1', 'F2', 'Two?'))) {
      $sn = & $num $pr[0] $pr[1]
      $null = R8 @('-Mode', 'chain', '-Action', 'plan', '-N', $sn, '-PromptFile', "$d7/p", '-Files', 'x.py', '-Run', $pr[0])
      $o = R8 @('-Mode', 'park', '-N', $sn, '-Ticket', $pr[2], '-Reason', 'taste', '-Question', $pr[3], '-Header', 'H', '-Option1', 'a | b | c', '-Option2', 'd | e | f', '-Default', 'a', '-Files', 'x.py', '-Stop', 'none', '-Run', $pr[0])
      if ($o.rc -ne 0) { Die "F38: park $($pr[3]): $($o.out)" }
    }
    $o = R8 @('-Mode', 'queue', '-All')
    if ($o.out -notmatch "(?m)^## $i1\s*$" -or $o.out -notmatch "(?m)^## $i2\s*$" -or $o.out -notmatch 'One\?' -or $o.out -notmatch 'Two\?') { Die "F38: queue -All did not list both runs' decisions: $($o.out)" }

    ChainSelftest $d
    MarathonSelftest $d
    F80Selftest $d
    "ok"
  } finally { $env:RELAY_TICKET_META = $null; Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue }
}

# F80: a chain takes only unassigned tickets and the session person's own; another's
# stage is IDLE ... owned, its dispatch refused; planning and dispatching claim.
function F80Selftest($d) {
  $tm = Join-Path $PSScriptRoot '..\..\tickets-zordon\scripts\ticket-meta.ps1'
  if (-not (Test-Path -LiteralPath $tm)) { [Console]::Error.WriteLine('note: ticket-meta.ps1 not beside this skill - F80 checks skipped'); return }
  $gc = @('-c', 'user.name=t', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=NUL')
  function G { $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git @gc @args 2>&1 | Out-Null; $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw "selftest: git $args failed" } }
  function No($label, $want, $block) {
    try { & $block | Out-Null } catch {
      if ("$_" -notmatch '^REFUSED: ' -or "$_" -notmatch [regex]::Escape($want)) { Die "${label}: want a refusal /$want/, got: $_" }
      return
    }
    Die "${label}: expected a refusal /$want/ and got none"
  }
  $saved = @($env:RELAY_CHAIN_DRIVER, $env:GIT_CONFIG_GLOBAL, $env:SKILLATOR_ME, $env:RELAY_CHAIN_PARALLEL)
  try {
    $env:RELAY_CHAIN_DRIVER = ''; $script:Driver = ''; $env:SKILLATOR_ME = $null
    $env:RELAY_LEVEL_CMD = "echo 'src=claude-code 5h=40 7d=10 ctx=5 max=40'"
    $d8 = Join-Path $d 'f80'; New-Item -ItemType Directory -Force (Join-Path $d8 '.skillator') | Out-Null; G init -q $d8
    [IO.File]::WriteAllText((Join-Path $d 'gitconfig'), ''); $env:GIT_CONFIG_GLOBAL = Join-Path $d 'gitconfig'
    G -C $d8 config user.email asha@x.com
    $u8 = New-Object Text.UTF8Encoding($false); $em = [string][char]0x2014
    [IO.File]::WriteAllText((Join-Path $d8 '.skillator/team.md'), "# Team`n`n- @asha: asha@x.com`n- @vidul: vidul@x.com`n", $u8)
    $tb = Join-Path $d8 'TICKETS.md'
    [IO.File]::WriteAllText($tb, "# TICKETS`n- [ ] F1 $em free`n- [ ] F2 $em mine [owner: @asha]`n- [ ] F3 $em theirs [owner: @vidul]`n", $u8)
    $script:Dir = Join-Path $d8 '.skillator'; $script:Run = ''
    $script:Plan = 'TICKETS.md'; $script:Title = 'f80'; $script:Stages = 'F1 free,F2 mine,F3 theirs'
    DoInit | Out-Null
    $t1 = $null; foreach ($l in @(Get-Content -Encoding UTF8 $Run)) { if ($l -match '^\| (\d+) \| F1 free \|') { $t1 = [int]$Matches[1] } }
    $t2 = $t1 + 1; $t3 = $t1 + 2
    $pf = Join-Path $d8 'p'; [IO.File]::WriteAllText($pf, "item: do it`n")
    $env:RELAY_TICKET_META = $tm
    foreach ($pl in @(@($t1, 'F1', 'a.py'), @($t2, 'F2', 'b.py'), @($t3, 'F3', 'c.py'))) {
      $script:PromptFile = $pf; $script:Tickets = $pl[1]; $script:Files = $pl[2]; $script:After = ''; $script:Fix = ''; $script:Verify = ''
      try { DoChainPlan $pl[0] | Out-Null } finally { $script:Files = ''; $script:Tickets = '' }
    }
    $board = [IO.File]::ReadAllText($tb, $u8)
    if ($board -notmatch "(?m)^- \[ \] F1 $em free \[owner: @asha\]$") { Die "F80: chain plan did not claim F1: $board" }
    if ($board -notmatch "(?m)^- \[ \] F3 $em theirs \[owner: @vidul\]$") { Die "F80: chain plan took another's ticket: $board" }
    $env:RELAY_CHAIN_PARALLEL = '3'; $script:All = $true
    try { $out = @(DoChainNext) } finally { $script:All = $false; $env:RELAY_CHAIN_PARALLEL = $null }
    if ($out -cnotcontains "NEXT $t1 $(CodeOf $t1)" -or $out -cnotcontains "NEXT $t2 $(CodeOf $t2)") { Die "F80: chain next -All did not pick the unassigned and my own: $($out -join ' | ')" }
    if ($out -cnotcontains "IDLE $t3 owned F3 @vidul") { Die "F80: another's ticket not listed as skipped with its owner: $($out -join ' | ')" }
    if (@($out | Where-Object { $_.StartsWith("NEXT $t3 ") }).Count) { Die "F80: chain next picked another's ticket: $($out -join ' | ')" }
    $script:Driver = '@cc-a'
    No 'F80: dispatch of another''s ticket' 'F3 is owned by @vidul' { DoChainDispatch $t3 }
    if (-not (Select-String -LiteralPath $Run -Pattern "^\| $t3 \| $(CodeOf $t3) F3 theirs \|   \|" -Quiet)) { Die "F80: a refused dispatch touched the row" }
    DoChainDispatch $t2 | Out-Null
    # review: each check below says FAIL and the block dies at its end, so every red line shows
    $bad = $false
    # 1: the claim is the gate - another run claims F1 right after this one looked (a race)
    [IO.File]::WriteAllText($tb, "# TICKETS`n- [ ] F1 $em free`n- [ ] F2 $em mine [owner: @asha]`n- [ ] F3 $em theirs [owner: @vidul]`n", $u8)
    $race = Join-Path $d8 'race.ps1'; $flag = Join-Path $d8 'raced'
    [IO.File]::WriteAllText($race, "& powershell -NoProfile -ExecutionPolicy Bypass -File '$tm' @args`n`$s = `$LASTEXITCODE`nif (`$args[0] -ceq 'pick' -and -not (Test-Path -LiteralPath '$flag')) { [IO.File]::WriteAllText('$flag', ''); `$env:SKILLATOR_ME = '@vidul'; & powershell -NoProfile -ExecutionPolicy Bypass -File '$tm' claim F1 | Out-Null }`nexit `$s`n")
    $env:RELAY_TICKET_META = $race
    $rerr = ''; try { DoChainDispatch $t1 | Out-Null } catch { $rerr = "$_" } finally { $env:RELAY_TICKET_META = $tm }
    $board = [IO.File]::ReadAllText($tb, $u8)
    if ($rerr -eq '') { if ($board -notmatch "(?m)^- \[ \] F1 $em free \[owner: @asha\]$") { Write-Output "FAIL: F80 review: dispatched a stage whose ticket another run claimed: $board"; $bad = $true } }
    elseif ($rerr -notmatch '^REFUSED: .*F1 is owned by @vidul') { Write-Output "FAIL: F80 review: race refusal: $rerr"; $bad = $true }
    # 3: with only another's stage left, FINAL names it - the end summary must
    SetRow $t1 'x' '' 'a1' | Out-Null; SetRow $t2 'x' '' 'a2' | Out-Null
    $out = @(DoChainNext)
    if ($out[0] -notlike "FINAL*stage $t3 F3 @vidul*") { Write-Output "FAIL: F80 review: FINAL does not name the skipped stage: $($out[0])"; $bad = $true }
    # 2: a token ticket-meta cannot read (HTML5) does not open the owner check
    [IO.File]::WriteAllText($Run, ([IO.File]::ReadAllText($Run, $u8) -creplace '(?m)^tickets: F3(\r?)$', 'tickets: F3, HTML5$1'), $u8)
    $out = @(DoChainNext)
    if ($out -cnotcontains "IDLE $t3 owned F3 @vidul") { Write-Output "FAIL: F80 review: an odd ticket token opened the owner check: $($out -join ' | ')"; $bad = $true }
    # 2: pick failing with a team.md = ownership unknown, nothing with a ticket starts (fail closed)
    $broken = Join-Path $d8 'broken.ps1'
    [IO.File]::WriteAllText($broken, "if (`$args[0] -ceq 'pick') { [Console]::Error.WriteLine('ticket-meta: boom'); exit 1 }`n& powershell -NoProfile -ExecutionPolicy Bypass -File '$tm' @args`nexit `$LASTEXITCODE`n")
    $env:RELAY_TICKET_META = $broken
    try { $out = @(DoChainNext) } finally { $env:RELAY_TICKET_META = $tm }
    if ($out -cnotcontains "IDLE $t3 owned F3 ?") { Write-Output "FAIL: F80 review: a failed pick left another's stage dispatchable: $($out -join ' | ')"; $bad = $true }
    if ($bad) { Die 'F80 review checks failed' }
    # not on the team: only unassigned tickets run; no team.md: every ticket, as before
    G -C $d8 config user.email ghost@x.com
    if (@(DoChainNext) -cnotcontains "IDLE $t3 owned F3 @vidul") { Die "F80: not on the team, another's ticket was not skipped" }
    Remove-Item -LiteralPath (Join-Path $d8 '.skillator/team.md') -Force
    $out = @(DoChainNext)
    if (@($out | Where-Object { $_ -match 'owned' }).Count) { Die "F80: no team.md, a ticket was still skipped: $($out -join ' | ')" }
  } finally {
    $env:RELAY_CHAIN_DRIVER = $saved[0]; $env:GIT_CONFIG_GLOBAL = $saved[1]; $env:SKILLATOR_ME = $saved[2]; $env:RELAY_CHAIN_PARALLEL = $saved[3]
    $script:Driver = ''; $env:RELAY_TICKET_META = Join-Path $d 'nope.ps1'
  }
}

try {
  # -Id names the run for every mode that touches one.
  if ($Id) {
    $f = Resolve-Run $Id
    if (-not $f -and $Mode -cnotin @('resume', 'queue-run', 'land')) { Die "no run matching '$Id' - see: -Mode list" }
    if ($f) { $Run = $f }
  }
  switch ($Mode) {
    'list'      { DoList }
    'resume'    { DoResume $Id }
    'init'      { DoInit }
    'board'     { DoBoard }
    'queue-run' { DoQueueRun }
    'land'      { DoLand }
    'away'      { DoAway }
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
        'decide'   { DoChainDecide }
        'next'     { DoChainNext }
        'merge'    { DoChainMerge $N }
        'edge'     { DoChainEdge $N }
      }
    }
    'park'      { DoPark @($Option1, $Option2, $Option3, $Option4 | Where-Object { $_ }) }
    'answer'    { DoAnswer }
    'queue'     { DoQueue }
    'owner'     { DoOwner }
    'watchdog'  { DoWatchdog }
    'selftest'  { DoSelftest }
    default     { Die "unknown mode: $Mode (init|add|stage|heartbeat|status|orphans|chain|park|answer|queue|owner|watchdog|selftest)" }
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
