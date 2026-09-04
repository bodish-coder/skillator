# The two artifacts practice/task-loop.md hands to subagents, as files so they
# never enter the controller's context. Windows twin of taskwork.sh.
#
#   taskwork.ps1 brief  <DesignFile> <N>            -> path to task N's brief
#   taskwork.ps1 review <DesignFile> <Base> <Head>  -> path to the review package
#
# Both print the path and nothing else:
#   $brief = & taskwork.ps1 brief design.md 3
param(
  [Parameter(Mandatory)][ValidateSet('brief','review')][string]$Command,
  [Parameter(Mandatory)][string]$DesignFile,
  [string]$A,   # brief: task number   review: base ref
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
  # A task block runs from '### Task <n>:' to the next '### Task ' or EOF.
  $lines = Get-Content -LiteralPath $DesignFile
  $block = [System.Collections.Generic.List[string]]::new()
  $in = $false
  foreach ($line in $lines) {
    if ($line -match "^### Task $([regex]::Escape($A))([:.\s]|$)") { $in = $true; $block.Add($line); continue }
    if ($in -and $line -match '^### Task ') { break }
    if ($in) { $block.Add($line) }
  }
  if (-not $in) { Write-Error "no '### Task $A`:' block in $DesignFile"; exit 1 }
  Set-Content $f ($block -join "`n") -Encoding utf8
  $f
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
