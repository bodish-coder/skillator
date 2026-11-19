const fs = require('node:fs')

const WEEK_SECONDS = 7 * 86400
const TURN_HOLD_SECONDS = 86400
const WEEKLY_CAP = 90
const has = (object, key) => object != null && Object.hasOwn(object, key)
const weekly = object => has(object, '7d') ? object['7d'] : object?.weekly
const numeric = Number.isFinite

// An old or unreadable record may permit a free query, but cannot authorize a paid turn.
function quotaPolicy(record, mtime, now = Date.now() / 1000) {
  const fresh = (at, fallback) => now - (numeric(at) ? at : fallback) < WEEK_SECONDS
  const top = weekly(record)
  const last = record?.last
  const prior = weekly(last)
  const topFresh = fresh(record?.at, mtime)
  const lastFresh = has(last, 'at') && fresh(last.at, mtime)
  const invalid = value => value !== undefined && !numeric(value)
  const unknown = topFresh && (invalid(top) || invalid(record?.at)) ||
    lastFresh && (invalid(prior) || invalid(last.at))
  const used = topFresh && numeric(top) ? top : lastFresh ? prior : undefined
  const held = numeric(used) && used >= WEEKLY_CAP ? used : null
  const turnHeld = has(record, 'turned_at') &&
    (!numeric(record.turned_at) || now - record.turned_at < TURN_HOLD_SECONDS)
  const blank = !has(record, '7d') && !has(record, 'weekly') && last === null
  const known = numeric(used) && used >= 0 && used < WEEKLY_CAP
  return { unknown, held, allowTurn: !unknown && !turnHeld && (blank || known) }
}

module.exports = { quotaPolicy, WEEKLY_CAP }

if (require.main === module) {
  let fd
  try {
    fd = fs.openSync(process.argv[2], 'r')
    const raw = fs.readFileSync(fd, 'utf8')
    const record = JSON.parse(raw.replace(/^\uFEFF/, ''))
    process.exitCode = quotaPolicy(record, fs.fstatSync(fd).mtimeMs / 1000).allowTurn ? 0 : 1
  } catch (error) {
    process.exitCode = error.code === 'ENOENT' ? 0 : 1
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}
