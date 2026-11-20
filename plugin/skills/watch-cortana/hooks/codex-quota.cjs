const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')

const profile = process.argv[2]
const executable = process.argv[3] || 'codex'
if (!profile || !/^codex(?:-[a-z0-9_-]+)?$/.test(executable)) process.exit(1)

const env = { ...process.env, CODEX_HOME: profile }
delete env.SKILLATOR_QUOTA_REFRESH_WAIT
const child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
  env,
  shell: process.platform === 'win32',
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'ignore'],
})
const lines = createInterface({ input: child.stdout })

function send(message) {
  child.stdin.write(JSON.stringify(message) + '\n')
}

function finish(record) {
  if (finished) return
  finished = true
  clearTimeout(timeout)
  lines.close()
  child.stdout.destroy()
  child.stdin.end()
  if (record) process.stdout.write(JSON.stringify(record))
  // Allow the server to exit on EOF, including through the Windows command shim.
  const shutdown = setTimeout(() => child.kill(), 1000)
  shutdown.unref()
}

function windows(limit) {
  const result = {}
  for (const bucket of [limit?.primary, limit?.secondary]) {
    const used = bucket?.usedPercent
    if (!Number.isFinite(used) || used < 0 || used > 100) continue
    if (bucket.windowDurationMins === 300) result['5h'] = used
    if (bucket.windowDurationMins === 10080) result['7d'] = used
  }
  return result
}

let finished = false
const timeout = setTimeout(() => finish(), 15_000)
child.on('error', () => finish())
child.on('close', () => finish())
child.stdin.on('error', () => finish())
lines.on('line', line => {
  let reply
  try { reply = JSON.parse(line) } catch { return }
  if (reply?.id === 1 && reply.result) {
    send({ method: 'initialized' })
    send({ id: 2, method: 'account/rateLimits/read' })
  } else if (reply?.id === 2) {
    const limits = windows(reply.result?.rateLimits)
    if (!Object.keys(limits).length) return finish()
    const models = []
    for (const [id, limit] of Object.entries(reply.result?.rateLimitsByLimitId ?? {})) {
      if (id === 'codex') continue
      const buckets = windows(limit)
      if (Object.keys(buckets).length) models.push({ name: limit.limitName || id, ...buckets })
    }
    finish({ src: 'codex', at: Math.floor(Date.now() / 1000), ...limits, ...(models.length ? { models } : {}) })
  } else if (reply?.id === 1 && reply.error) {
    finish()
  }
})
send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'skillator-quota', version: '1' } } })
