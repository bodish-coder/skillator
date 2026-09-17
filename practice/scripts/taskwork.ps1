# The artifacts practice/task-loop.md hands to subagents, as files so they
# never enter the controller's context. Windows twin of taskwork.sh.
#
#   taskwork.ps1 brief  <DesignFile> <N>            -> path to task N's brief
#   taskwork.ps1 report <DesignFile> <N>            -> path for task N's report
#   taskwork.ps1 review <DesignFile> <Base> <Head>  -> path to the review package
#
# All print the path and nothing else:
#   $brief = & taskwork.ps1 brief design.md 3
# `report` only names the file — the implementer writes it, fix rounds append
# to it — so implementer and reviewer get the same path by construction.
param(
  [Parameter(Mandatory)][ValidateSet('brief','report','review')][string]$Command,
  [Parameter(Mandatory)][string]$DesignFile,
  [string]$A,   # brief/report: task number   review: base ref
  [string]$B    # review: head ref
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $DesignFile -PathType Leaf)) {
  Write-Error "no such design file: $DesignFile"; exit 1
}
$out = Join-Path (Split-Path -Parent (Resolve-Path $DesignFile)) '.taskwork'
New-Item $out -ItemType Directory -Force | Out-Null

if ($Command -eq 'brief') {
  if (-not $A) { Write-Error 'usage: taskwork.ps1 brief <DesignFile> <N>'; exit 2 }
  $f = Join-Path $out "task-$A-brief.md"
  # Keep in sync with taskwork.sh, which carries the full reasoning (A71).
  # A task block runs to the next '### Task ', the next top-level design field
  # (a closed set - matching their shape instead ate bodies opening 'IMPORTANT:'
  # or a bare Windows path), or EOF. SATISFIES: is per-task and deliberately
  # absent. Fenced code is skipped, closing only on a backtick run at least as
  # long as the one that opened it so nested fences do not re-open terminators.
  $fields = @('GOAL','REQUIREMENTS','APPROACHES','CHOSEN','DESIGN','CONSTRAINTS',
              'TRACE','TASKS','VERIFICATION','PLATFORM','DESIGN_MODEL','BUILD_MODEL')
  # -Encoding UTF8: Get-Content defaults to the system ANSI codepage on Windows
  # PowerShell 5.1, so every em-dash in a design file reached the brief as mojibake.
  $lines = Get-Content -LiteralPath $DesignFile -Encoding UTF8
  $block = [System.Collections.Generic.List[string]]::new()
  $in = $false
  $fence = 0
  foreach ($line in $lines) {
    if ($line -cmatch "^### Task $([regex]::Escape($A))([:.\s]|$)") { $in = $true; $block.Add($line); continue }
    if (-not $in) { continue }
    if ($line -match '^(`+)') {
      $run = $Matches[1].Length
      if ($run -ge 3) {
        if ($fence -eq 0) { $fence = $run }
        elseif ($run -ge $fence -and $line.Substring($run) -match '^\s*$') { $fence = 0 }
        $block.Add($line); continue
      }
    }
    # '### Task ' terminates even inside a fence - same-length nested fences leave the
    # run unbalanced and a fence-guarded heading ran the block to EOF (A71, third time).
    if ($line -cmatch '^### Task ') { break }
    if ($fence -ne 0) { $block.Add($line); continue }
    # -cmatch: -match is case-insensitive and would fire on an in-block 'Files:'
    # require the colon: a bare 'DESIGN' line split to 'DESIGN' and broke the block
    if ($line -cmatch '^([A-Z][A-Z_]*):' -and $fields -ccontains $Matches[1]) { break }
    $block.Add($line)
  }
  # taskwork.sh rm -f's the brief on every error path; without this a caller that
  # ignores the exit code reads a STALE brief on Windows and nothing on POSIX.
  if (-not $in -or $block.Count -le 1) { Remove-Item -LiteralPath $f -ErrorAction SilentlyContinue }
  if (-not $in) { Write-Error "no '### Task $A`:' block in $DesignFile"; exit 1 }
  if ($block.Count -le 1) { Write-Error "task $A block in $DesignFile has a heading but no body"; exit 1 }
  # awk writes each line plus a trailing LF and no BOM; Set-Content -Encoding utf8
  # on Windows PowerShell 5.1 emits a BOM, which is the A12 defect class and made
  # this twin disagree with taskwork.sh byte for byte. Write it explicitly.
  [System.IO.File]::WriteAllText($f, ($block -join "`n") + "`n",
    (New-Object System.Text.UTF8Encoding $false))
  $f
}
elseif ($Command -eq 'report') {
  if (-not $A) { Write-Error 'usage: taskwork.ps1 report <DesignFile> <N>'; exit 2 }
  Join-Path $out "task-$A-report.md"
}
else {
  if (-not $A -or -not $B) { Write-Error 'usage: taskwork.ps1 review <DesignFile> <Base> <Head>'; exit 2 }
  foreach ($r in @($A, $B)) {
    git rev-parse --verify --quiet $r > $null
    if ($LASTEXITCODE -ne 0) { Write-Error "bad ref: $r"; exit 1 }
  }
  $f = Join-Path $out "review-$(git rev-parse --short $A)-$(git rev-parse --short $B).md"
  $body = @(
    '# Review package', ''
    "Base: $(git rev-parse $A)"
    "Head: $(git rev-parse $B)", ''
    '## Commits', '```'
    (git log --oneline "$A..$B")
    '```', ''
    '## Stat', '```'
    (git diff --stat $A $B)
    '```', ''
    '## Diff', '```diff'
    # -U8: reviewers judge hunks in context; 3 lines is not enough context.
    (git diff -U8 $A $B)
    '```'
  )
  Set-Content $f ($body -join "`n") -Encoding utf8
  $f
}
