// Temp skills dirs for the node host tests: the marker file, and fake scripts that print
// their argv one per line, then the directory they ran in.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// A skills dir: holds the marker (tickets-zordon/scripts/ticket-meta.sh). Forward slashes.
export const skills = (dir: string) => {
  mkdirSync(join(dir, 'tickets-zordon/scripts'), { recursive: true })
  writeFileSync(join(dir, 'tickets-zordon/scripts/ticket-meta.sh'), '')
  return dir.replace(/\\/g, '/')
}

const SH = 'printf "%s\\n" "$@"; pwd\n'
const PS = '$args | ForEach-Object { $_ }; (Get-Location).Path\n'

// A skills dir whose ticket-meta and pending (both spellings) echo argv and cwd.
export const echoSkills = (dir: string) => {
  const d = skills(dir)
  for (const s of ['ticket-meta', 'pending']) {
    writeFileSync(join(d, 'tickets-zordon/scripts', s + '.sh'), SH)
    writeFileSync(join(d, 'tickets-zordon/scripts', s + '.ps1'), PS)
  }
  return d
}
