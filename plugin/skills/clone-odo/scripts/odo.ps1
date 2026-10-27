# clone-odo tool runner. Windows twin of odo.sh, which carries the reasoning;
# keep the two in step. One entry point for the six stdlib-Python tools, so the
# python check lives once and a missing python is one line, never a traceback.
#
#   odo.ps1 parity   <features.csv> [--visual <diffs/*.json>] [--markdown] [--fail-under N]
#   odo.ps1 imgdiff  <original.png> <clone.png> [--out diff.png] [--json] [--mode layout|pixel]
#   odo.ps1 reviews  <reviews.csv> [--out feedback.md] [--json] [--themes <themes.json>]
#   odo.ps1 sweep    [<dir>] --avoid "Name,Co" [--domains d.com] [--colors "#hex"] | --config brand.json
#   odo.ps1 listing  <listing.json> [--avoid "Name"]
#   odo.ps1 contrast <tokens.json> | <#fg> <#bg>
#   odo.ps1 test                          -> the tools' unittest suite
#   odo.ps1 selftest                      -> prints ok (or skipped: no python3), or dies
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File skills/clone-odo/scripts/odo.ps1 <tool> <args...>
#
# Each tool's own flags: odo.ps1 <tool> --help. Exit codes are the tool's (0 ok,
# 1 a finding / under threshold, 2 bad input); 127 = no python3 >= 3.8.
# No param() block on purpose: every argument after the tool name goes to the
# tool untouched, --flags included.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$self = $MyInvocation.MyCommand.Path
$prog = 'odo.ps1'
$noPython = 'clone-odo: python3 (3.8 or newer) was not found on PATH. Install it from python.org (Windows: winget install Python.Python.3.12; Debian/Ubuntu: apt install python3) and rerun.'

function Show-Usage {
  foreach ($l in (Get-Content -LiteralPath $self)) {
    if ($l -notmatch '^#') { break }
    [Console]::Error.WriteLine(($l -replace '^# ?', ''))
  }
  exit 2
}

# Find-Python: the first of python3 / python / py -3 on PATH that is CPython
# >= 3.8. `python` may be Python 2 or the Windows Store stub (it prints an
# advert and exits 9009); both fail the version probe quietly, so neither can
# produce a traceback. Returns @{ Exe; Pre } or $null.
function Find-Python {
  $probe = 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)'
  foreach ($c in @(@('python3'), @('python'), @('py', '-3'))) {
    $cmd = Get-Command $c[0] -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $cmd) { continue }
    $pre = @($c | Select-Object -Skip 1)
    try {
      & $cmd.Source @pre -c $probe *> $null
      if ($LASTEXITCODE -eq 0) { return @{ Exe = $cmd.Source; Pre = $pre } }
    } catch { continue }
  }
  return $null
}

function Exit-NoPython {
  [Console]::Error.WriteLine($noPython)
  exit 127
}

function Invoke-Selftest {
  $t = Join-Path ([IO.Path]::GetTempPath()) ('odo-selftest-' + [Guid]::NewGuid().ToString('N'))
  $bin = Join-Path $t 'bin'
  New-Item -ItemType Directory -Path $bin -Force | Out-Null
  $code = 0
  $msg = ''
  $oldPath = $env:PATH
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    # 1. no usable python: a PATH whose first python3 is "too old" (its probe
    #    exits 1), whose python is a Store-style stub (exits 9) and whose py
    #    fails too. .cmd files on Windows; sh scripts where pwsh runs elsewhere.
    $onWindows = ($PSVersionTable.PSEdition -ne 'Core') -or $IsWindows
    if ($onWindows) {
      Set-Content -LiteralPath (Join-Path $bin 'python3.cmd') -Value '@exit /b 1' -Encoding Ascii
      Set-Content -LiteralPath (Join-Path $bin 'python.cmd') -Value '@exit /b 9' -Encoding Ascii
      Set-Content -LiteralPath (Join-Path $bin 'py.cmd') -Value '@exit /b 1' -Encoding Ascii
    } else {
      foreach ($p in @(@('python3', 1), @('python', 9), @('py', 1))) {
        $f = Join-Path $bin $p[0]
        [IO.File]::WriteAllText($f, "#!/bin/sh`nexit $($p[1])`n")
        & chmod 755 $f
      }
    }
    $host_exe = (Get-Process -Id $PID).Path
    $env:PATH = $bin + [IO.Path]::PathSeparator + $oldPath
    $out = (& $host_exe -NoProfile -ExecutionPolicy Bypass -File $self parity (Join-Path $t 'none.csv') 2>&1 | Out-String)
    $rc = $LASTEXITCODE
    $env:PATH = $oldPath
    if ($rc -ne 127) { throw "no-python: exit $rc, want 127: $out" }
    if ($out -notmatch [regex]::Escape('python3 (3.8 or newer) was not found')) { throw "no-python: message missing: $out" }
    if ($out -match '(?i)traceback') { throw "no-python: a traceback leaked: $out" }
    # 2. a bad subcommand is usage, exit 2
    & $host_exe -NoProfile -ExecutionPolicy Bypass -File $self nosuch *> $null
    if ($LASTEXITCODE -ne 2) { throw "unknown tool: exit $LASTEXITCODE, want 2" }
    # 3. with a real python, the suite
    $py = Find-Python
    if ($py) {
      $tests = Join-Path $here 'tests'
      $log = (& $py.Exe @($py.Pre) -m unittest discover -s $tests -t $tests 2>&1 | Out-String)
      if ($LASTEXITCODE -ne 0) { [Console]::Error.WriteLine($log); throw 'unittest suite failed' }
      $n = 0
      if ($log -match '(?m)^Ran (\d+) tests?') { $n = [int]$Matches[1] }
      if ($n -lt 40) { throw "unittest ran $n tests, want 40+" }
      $msg = "ok - clone-odo tools: $n tests"
    } else {
      $msg = 'skipped: python3 (3.8 or newer) not found - clone-odo tool tests not run'
    }
  } catch {
    [Console]::Error.WriteLine("FAIL: $($_.Exception.Message)")
    $code = 1
  } finally {
    $env:PATH = $oldPath
    $ErrorActionPreference = $oldEap
    Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($code -eq 0) { Write-Output $msg }
  exit $code
}

if ($args.Count -lt 1) { Show-Usage }
$tool = [string]$args[0]
$rest = @($args | Select-Object -Skip 1)
switch -CaseSensitive ($tool) {
  'selftest' { Invoke-Selftest }
  { $_ -in 'parity', 'imgdiff', 'reviews', 'sweep', 'listing', 'contrast' } {
    $py = Find-Python
    if (-not $py) { Exit-NoPython }
    & $py.Exe @($py.Pre) (Join-Path $here "$tool.py") @rest
    exit $LASTEXITCODE
  }
  'test' {
    $py = Find-Python
    if (-not $py) { Exit-NoPython }
    $tests = Join-Path $here 'tests'
    & $py.Exe @($py.Pre) -m unittest discover -s $tests -t $tests @rest
    exit $LASTEXITCODE
  }
  { $_ -in '-h', '--help' } { Show-Usage }
  default {
    [Console]::Error.WriteLine("${prog}: unknown tool '$tool'")
    Show-Usage
  }
}
