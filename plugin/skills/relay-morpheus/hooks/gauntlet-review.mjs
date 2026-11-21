import { execFileSync } from 'node:child_process'
import { closeSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [worktree, base, ledger, stage, gateDir] = process.argv.slice(2)
if (!worktree || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(base ?? '') ||
    !ledger || !/^[1-9]\d*$/.test(stage ?? '') || !gateDir) {
  throw new Error('Usage: node gauntlet-review.mjs <worktree> <base-sha> <run-file> <stage> <gate-log-directory>')
}
const gate = JSON.parse(readFileSync(join(gateDir, 'result.json'), 'utf8'))
if (!(gate.status === 'pass' && gate.exit === 0 && gate.log) && !(gate.status === 'skip' && gate.reason)) {
  throw new Error('Review requires the recorded passing or skipped gate')
}

const git = (...args) => execFileSync('git', ['-C', worktree, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
if (git('rev-parse', 'HEAD').trim() !== base) throw new Error('Builder must return before commit')
const diffArgs = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-color']
const tracked = git(...diffArgs, '--name-only', '-z', base, '--').split('\0').filter(Boolean)
const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)
const files = [...new Set([...tracked, ...untracked])].sort()
const ui = /\.(?:[jt]sx|css|scss|sass|less|html?|vue|svelte|astro)$|(?:^|\/)(?:ui|components|views|screens|tui)(?:\/|[._-]|$)/i
const sensitive = /(?:^|[\/._-])(?:auth(?:entication|orization)?|oauth\d*|login|session|credentials?|input|validat(?:e|ion|or)|sanitiz(?:e|ation|er)|crypto(?:graphy)?|encrypt(?:ion)?|secrets?|passwords?|tokens?|webhooks?|keystore|env)(?:[\/._-]|$)|\.(?:pem|key|p12|pfx)$/i
const securityCode = /\b(?:req(?:uest)?\.(?:body|query|params|headers|cookies|json|formData|text)\b|(?:process\.env\.)?(?:[\w]*_)?(?:API_KEY|SECRET_KEY|PRIVATE_KEY|PASSWORD|AUTH_TOKEN)\b|\b(?:authorization|set-cookie)\b|(?:crypto|jwt|bcrypt|argon2)\.|(?:validateInput|sanitizeInput|verifyToken|checkPermission|createCipheriv|timingSafeEqual)\s*\()/i
const security = files.some(file => sensitive.test(file)) ||
  git(...diffArgs, '--unified=0', base, '--').split('\n')
    .some(line => /^[+-](?![+-]{2})/.test(line) && securityCode.test(line.slice(1))) ||
  untracked.some(file => {
    const path = join(worktree, file)
    const stat = lstatSync(path)
    return stat.isFile() && stat.size <= 1024 * 1024 && securityCode.test(readFileSync(path, 'utf8'))
  })

// Use Relay's run lock so heartbeat and stage commands can keep writing the same ledger.
const lock = ledger + '.lock'
const fd = openSync(lock, 'wx')
try {
  writeFileSync(fd, `${process.pid} ${process.platform === 'win32' ? 'ps1' : 'sh'}\n`)
  const run = readFileSync(ledger, 'utf8')
  const chain = run.split(/^## /m).find(section => /^Chain\r?\n/.test(section))
  const block = chain?.split(/^### /m).find(section => new RegExp(`^\\S+ - stage ${stage} - `).test(section))
  const metadata = block?.split(/^prompt: \|\r?$/m)[0]
  const risk = metadata?.match(/^triage: ACCEPT (low|medium|high)\r?$/m)?.[1]
  if (!risk) throw new Error(`Stage ${stage} needs recorded ACCEPT triage`)

  const verify = risk === 'high' || security ? 'deep' : 'build'
  const reviewers = [{ seat: 'code-review', tier: verify }]
  if (files.some(file => ui.test(file))) {
    reviewers.push({ seat: 'design-arwen', tier: 'deep' }, { seat: 'a11y-toph', tier: verify })
  }
  if (security) reviewers.push({ seat: 'security-review', tier: 'deep' })

  const route = { stage: Number(stage), base, risk, files, reviewers }
  const old = metadata.match(/^reviewers: .*\r?\n/m)?.[0] ?? ''
  const eol = run.includes('\r\n') ? '\r\n' : '\n'
  const record = `reviewers: ${JSON.stringify(route)}${eol}`
  const updated = old ? metadata.replace(old, () => record) : metadata + (metadata.endsWith(eol) ? '' : eol) + record
  if (updated !== metadata) {
    const temp = `${ledger}.tmp.${process.pid}`
    writeFileSync(temp, run.replace('### ' + block, () => '### ' + updated + block.slice(metadata.length)))
    renameSync(temp, ledger)
  }
  console.log(JSON.stringify(route))
} finally {
  closeSync(fd)
  unlinkSync(lock)
}
