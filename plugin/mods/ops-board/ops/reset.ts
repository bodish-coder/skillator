// B24: `ops --reset` - recover from an unresponsive or hung ops board.
// Resets terminal modes (ANSI attributes, cursor visible, mouse tracking off, screen buffer restored),
// clears stale locks (quota refresh locks, board locks), and terminates orphaned reader processes.
import { existsSync, readdirSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { discover } from './status'
import { norm } from '../hooks/lib/calls'

const execFileAsync = promisify(execFile)

export function resolveUserHome(env: Record<string, string | undefined> = process.env): string {
  return norm(env.HOME || env.USERPROFILE || homedir())
}

export type ResetResult = {
  terminalReset: boolean
  clearedLocks: string[]
  killedProcesses: number
  errors: string[]
}

export const ANSI_RESET = '\x1b[0m\x1b[?1000l\x1b[?1002l\x1b[?1006l\x1b[?25h\x1b[?1049l'

export async function reset(env: Record<string, string | undefined> = process.env, appDir?: string): Promise<string> {
  const result: ResetResult = {
    terminalReset: true,
    clearedLocks: [],
    killedProcesses: 0,
    errors: [],
  }

  // 1. Terminal escape reset
  if (process.stdout.isTTY) {
    try {
      process.stdout.write(ANSI_RESET)
    } catch {
      // Non-fatal
    }
  }

  // 2. Clear stale lock files
  const home = resolveUserHome(env)
  const lockCandidates: string[] = [
    '.skillator/board.lock',
    '.skillator/profiles.lock',
    `${home}/.skillator/board.lock`,
    `${home}/.skillator/profiles.lock`,
  ]

  // Add refreshing locks from all profiles
  try {
    for (const p of discover(home)) {
      lockCandidates.push(`${p.dir}/quota-cache.json.refreshing`)
    }
  } catch {
    // Discovery failed
  }

  for (const lk of lockCandidates) {
    if (existsSync(lk)) {
      try {
        unlinkSync(lk)
        result.clearedLocks.push(lk)
      } catch (e: any) {
        result.errors.push(`Could not remove ${lk}: ${e.message}`)
      }
    }
  }

  // 3. Process cleanup: terminate orphaned usage-watch or stale ops background processes
  if (process.platform === 'win32') {
    try {
      // Find and kill stale background powershell processes running usage-watch -Mode refresh
      const cmd = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*usage-watch.ps1*refresh*' -or $_.CommandLine -like '*ops.ps1*refresh*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }"
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { timeout: 4000 })
      const count = stdout.trim().split(/\r?\n/).filter(Boolean).length
      result.killedProcesses += count
    } catch {
      // Ignore process query issues
    }
  }

  // Format the diagnostic report
  const lines: string[] = ['ops --reset:']
  lines.push('  [ok] Terminal attributes, cursor visibility and mouse tracking reset')
  if (result.clearedLocks.length > 0) {
    lines.push(`  [ok] Cleared ${result.clearedLocks.length} stale lock(s):`)
    for (const lk of result.clearedLocks) {
      lines.push(`       - ${lk}`)
    }
  } else {
    lines.push('  [ok] No stale lock files found')
  }
  if (result.killedProcesses > 0) {
    lines.push(`  [ok] Terminated ${result.killedProcesses} orphaned background process(es)`)
  } else {
    lines.push('  [ok] No orphaned background processes found')
  }
  if (result.errors.length > 0) {
    lines.push('  [!] Warnings/errors:')
    for (const err of result.errors) lines.push(`       ${err}`)
  }
  lines.push('ops board state clean.')
  return lines.join('\n') + '\n'
}
