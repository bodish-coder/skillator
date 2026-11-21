import { randomUUID } from 'node:crypto'
import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'

const [action, ledger, ...args] = process.argv.slice(2)
const usage = 'Usage: gauntlet-usage.mjs start <run> <stage> <seat> | finish <run> <stage> <id> [usd|tokens <amount>] | record <run> <workflow-result.json>'
if (!ledger || !['start', 'finish', 'record'].includes(action)) throw new Error(usage)

const now = Date.now()
const [stage, value, unit, amount] = args
const measured = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0
const numbered = (n) => Number.isSafeInteger(n) && n > 0
const name = (s) => typeof s === 'string' && /^[a-z\d-]+$/i.test(s)
if (action !== 'record' && (!numbered(Number(stage)) || !name(value))) throw new Error(usage)
if (action === 'start' && args.length !== 2) throw new Error(usage)
if (action === 'finish' && !(args.length === 2 ||
    (args.length === 4 && ['usd', 'tokens'].includes(unit) && /^\d+(?:\.\d+)?$/.test(amount) &&
      measured(Number(amount)) && (unit !== 'tokens' || Number.isSafeInteger(Number(amount)))))) throw new Error(usage)

const results = action === 'record' ? JSON.parse(readFileSync(stage, 'utf8')) : null
if (action === 'record' && (args.length !== 1 || !Array.isArray(results) ||
    results.some(row => !numbered(row.stage) || !Array.isArray(row.seatUsage)))) throw new Error(usage)
const records = action === 'start' ? [{ stage: Number(stage), id: randomUUID(), seat: value, startedAt: now, elapsedMs: null }]
  : results?.flatMap(row => row.seatUsage.map(record => ({ ...record, stage: row.stage }))) ?? []

// Relay stage updates, heartbeats, and routed reviewers all write this ledger.
const lock = ledger + '.lock'
const fd = openSync(lock, 'wx')
try {
  writeFileSync(fd, `${process.pid} ${process.platform === 'win32' ? 'ps1' : 'sh'}\n`)
  const original = readFileSync(ledger, 'utf8')
  let run = original
  const eol = run.includes('\r\n') ? '\r\n' : '\n'
  const update = (n, id, change) => {
    const chain = run.split(/^## /m).find(section => /^Chain\r?\n/.test(section))
    const block = chain?.split(/^### /m).find(section => new RegExp(`^\\S+ - stage ${n} - `).test(section))
    if (!block) throw new Error(`Stage ${n} is missing from the Chain`)
    const metadata = block.split(/^prompt: \|\r?$/m)[0]
    const line = metadata.match(/^seat: .*\r?\n/gm)?.find(row => JSON.parse(row.slice(6)).id === id)
    const old = line ? JSON.parse(line.slice(6)) : null
    const record = change(old)
    if (!record || record === old) return old
    const { seat, startedAt, elapsedMs, usd, tokens } = record
    const payload = { id, seat, startedAt, elapsedMs, usd, tokens }
    const entry = 'seat: ' + JSON.stringify(payload) + eol
    const next = line ? metadata.replace(line, () => entry) : metadata + (metadata.endsWith(eol) ? '' : eol) + entry
    run = run.replace('### ' + block, () => '### ' + next + block.slice(metadata.length))
    return payload
  }
  let result
  if (action === 'finish') {
    result = update(Number(stage), value, old => {
      if (!old) throw new Error(`Seat invocation ${value} was never started`)
      if (old.elapsedMs !== null && (!unit || old[unit] !== undefined)) return old
      return { ...old, elapsedMs: old.elapsedMs ?? (now >= old.startedAt ? now - old.startedAt : null),
        ...(unit ? { [unit]: Number(amount) } : {}) }
    })
  } else {
    result = records.map(record => {
      if (!name(record.id) || !name(record.seat) || !numbered(record.startedAt) ||
          (action === 'record' && record.elapsedMs !== null && !measured(record.elapsedMs)) ||
          (record.usd !== undefined && !measured(record.usd)) ||
          (record.tokens !== undefined && (!Number.isSafeInteger(record.tokens) || record.tokens < 0))) throw new Error('Invalid seat usage record')
      return update(record.stage, record.id, old => old ?? record)
    })
  }
  if (run !== original) {
    const temp = `${ledger}.tmp.${process.pid}`
    writeFileSync(temp, run)
    renameSync(temp, ledger)
  }
  console.log(action === 'start' ? records[0].id : JSON.stringify(result))
} finally {
  closeSync(fd)
  unlinkSync(lock)
}
