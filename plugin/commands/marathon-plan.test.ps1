# Test suite for F121: Adaptive marathon-plan (suggest parallel or sequential)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginDir = Split-Path -Parent $here

$files = @(
    (Join-Path $pluginDir 'commands\marathon-plan.md'),
    (Join-Path $pluginDir 'host-commands\antigravity\marathon-plan\SKILL.md'),
    (Join-Path $pluginDir 'host-commands\cursor\marathon-plan.md'),
    (Join-Path $pluginDir 'host-commands\gemini\marathon-plan.toml'),
    (Join-Path $pluginDir 'host-commands\opencode\marathon-plan.md'),
    (Join-Path $pluginDir 'host-commands\pi\marathon-plan.md')
)

$marathonRef = Join-Path $pluginDir 'skills\relay-morpheus\references\marathon.md'

$passCount = 0
$failCount = 0

function Assert-Condition([bool]$cond, [string]$msg) {
    if ($cond) {
        $script:passCount++
    } else {
        $script:failCount++
        Write-Host "FAIL: $msg" -ForegroundColor Red
    }
}

Write-Host "Testing F121 requirements on marathon-plan commands..."

foreach ($f in $files) {
    $rel = $f.Substring($pluginDir.Length + 1)
    $content = [IO.File]::ReadAllText($f)

    # 1. Must specify adaptive suggestion when invoked without arguments instead of silently defaulting
    Assert-Condition ($content -match 'without arguments' -or $content -match 'No arguments') `
        "$rel specifies behavior when invoked without arguments"
    
    # 2. Must analyze open eligible tickets
    Assert-Condition ($content -match 'eligible tickets' -or $content -match 'open eligible') `
        "$rel mentions analyzing eligible tickets"

    # 3. Must compute file disjointness from bodies/history
    Assert-Condition ($content -match 'file disjointness' -and ($content -match 'bodies' -or $content -match 'history')) `
        "$rel mentions computing file disjointness from ticket bodies/history"

    # 4. Must identify tickets that can run in parallel without conflict
    Assert-Condition ($content -match 'parallel worktrees' -or $content -match 'without file conflicts' -or $content -match 'without conflict') `
        "$rel mentions identifying parallel worktrees without file conflicts"

    # 5. Must suggest recommended parallel grouping (or sequential) with confirmation choice
    Assert-Condition (($content -match 'recommended parallel' -or $content -match 'suggest') -and ($content -match 'confirmation choice' -or $content -match 'choice')) `
        "$rel suggests recommended grouping with confirmation choice before generating plan"

    # 6. Must preserve F112 table and syntax
    Assert-Condition ($content.Contains('| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |')) `
        "$rel preserves F112 mode table row"
    Assert-Condition ($content.Contains('say it is not an option and stop')) `
        "$rel preserves invalid argument rejection"
}

Write-Host "Testing F121 requirements on marathon.md..."
$mContent = [IO.File]::ReadAllText($marathonRef)

Assert-Condition ($mContent -match 'Adaptive marathon-plan' -or $mContent -match 'Adaptive planning') `
    "marathon.md has Adaptive marathon-plan section"
Assert-Condition ($mContent -match 'file disjointness') `
    "marathon.md explains file disjointness"
Assert-Condition ($mContent -match 'ticket bodies' -and $mContent -match 'history') `
    "marathon.md references ticket bodies and history"
Assert-Condition ($mContent -match 'confirmation choice') `
    "marathon.md mentions confirmation choice before generating plan"
Assert-Condition ($mContent.Contains('### Mode - sequential or parallel (F112)')) `
    "marathon.md retains F112 section"

Write-Host "Total passes: $passCount, failures: $failCount"
if ($failCount -gt 0) {
    exit 1
}
exit 0
