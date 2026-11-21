import { execFileSync } from 'node:child_process'
import { constants, copyFileSync, mkdtempSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [action, arg] = process.argv.slice(2)
const root = fileURLToPath(new URL('..', import.meta.url))

function pick(kind) {
  if (process.platform !== 'win32') throw new Error('Enter a local path on this platform.')
  const folder = kind === 'folder'
  const mapping = kind === 'mapping'
  const script = `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.${folder ? 'FolderBrowserDialog' : 'OpenFileDialog'}
    ${folder ? "$dialog.Description = 'Choose a folder for intake samples'" :
      `$dialog.Filter = '${mapping ? 'Mapping JSON (*.json)|*.json' : 'Intake files (*.csv;*.xlsx;*.xml;*.json)|*.csv;*.xlsx;*.xml;*.json'}'
      $dialog.CheckFileExists = $true`}
    $owner = New-Object System.Windows.Forms.Form
    $owner.Text = 'Skillator Intake'
    $owner.ShowInTaskbar = $false
    $owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $owner.Width = 1
    $owner.Height = 1
    $owner.TopMost = $true
    try {
      $owner.Show()
      $owner.Activate()
      if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        ConvertTo-Json -InputObject $dialog.${folder ? 'SelectedPath' : 'FileName'} -Compress
      } else { 'null' }
    } finally { $dialog.Dispose(); $owner.Dispose() }
  `
  const windows = process.env.SystemRoot || 'C:\\Windows'
  if (!isAbsolute(windows)) throw new Error('Windows system folder could not be resolved.')
  return JSON.parse(execFileSync(join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
    '-NoProfile', '-STA', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64'),
  ], { encoding: 'utf8', windowsHide: true, timeout: 120000 }))
}

try {
  let result
  if (action === 'pick' && ['file', 'mapping', 'folder'].includes(arg)) {
    result = pick(arg)
  } else if (action === 'samples' && arg?.trim()) {
    result = mkdtempSync(join(resolve(arg), 'skillator-intake-'))
    for (const [source, name] of [
      ['spreadsheet-template.xlsx', 'sample-bugs.xlsx'],
      ['xml-template.xml', 'sample-bugs.xml'],
      ['tests/fixtures/ats-scenarios.xml', 'sample.ats.xml'],
      ['tests/fixtures/ats-synthetic-results.json', 'sample-ats-results.json'],
      ['tests/fixtures/ats-mapping.json', 'ats-mapping.json'],
    ]) copyFileSync(join(root, source), join(result, name), constants.COPYFILE_EXCL)
  } else throw new Error('Usage: intake-files pick <file|mapping|folder> or samples <directory>')
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
