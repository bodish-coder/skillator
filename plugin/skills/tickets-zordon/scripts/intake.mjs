import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readSpreadsheet } from './spreadsheet.mjs'

const ticket = /^\s*- \[(.)\]\s+([A-Z]+\d+[a-z]?)\s*[-–—]\s*(.*)/
const sections = { B: 'Bugs', F: 'Features' }
const labels = { description: 'Description', steps: 'Steps', severity: 'Severity', reporter: 'Reporter',
  screenshot: 'Screenshot', source: 'Source', sourceId: 'Source ID' }
const fields = ['title', ...Object.keys(labels)]

function draftFields(input) {
  const draft = { type: input.type }
  if (draft.type !== 'B' && draft.type !== 'F') throw new Error('draft type must be B or F')
  for (const key of fields) {
    if (input[key] === undefined) continue
    if (typeof input[key] !== 'string') throw new Error(`draft ${key} must be text`)
    draft[key] = input[key].trim()
  }
  if (!draft.title) throw new Error('draft title is required')
  return draft
}

function atomicWrite(path, value) {
  const tmp = path + '.' + randomUUID()
  try {
    writeFileSync(tmp, value, { flag: 'wx' })
    renameSync(tmp, path)
  } finally {
    rmSync(tmp, { force: true })
  }
}

function normalized(text) {
  return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

function duplicateIds(title, lines) {
  const titleWords = normalized(title)
  const words = new Set(titleWords)
  return lines.flatMap(line => {
    const match = line.match(ticket)
    if (!match || 'xX-'.includes(match[1])) return []
    const candidate = match[3].split(/ (?:Description|Steps|Severity|Reporter|Screenshot|Source|Source ID):|\s+[(\[]/u, 1)[0]
    const candidateWords = normalized(candidate)
    const other = new Set(candidateWords)
    const shared = [...words].filter(word => other.has(word)).length
    return ((titleWords.length > 0 && candidateWords.join(' ') === titleWords.join(' '))
      || (shared >= 3 && shared / (words.size + other.size - shared) >= 0.75)) ? [match[2]] : []
  })
}

function markdownText(value) {
  return value.replace(/[\p{Cc}\p{Cf}\s]+/gu, ' ').trim()
    .replace(/[&\\`*_{}\[\]<>!()@]/g, char => `&#${char.charCodeAt(0)};`)
}

async function run([root, common, git, shell, allocator, action, id, revision, payload]) {
  const dir = join(common, 'skillator', 'intake')
  function enqueue(draft) {
    const pending = { ...draft, id: randomUUID(), revision: randomUUID(), createdAt: Date.now() }
    mkdirSync(dir, { recursive: true })
    atomicWrite(join(dir, pending.id + '.json'), JSON.stringify(pending))
    return pending
  }
  if (action === 'spreadsheet') {
    const maps = join(common, 'skillator', 'spreadsheet-mappings')
    const { drafts, mapPath, mapping } = await readSpreadsheet(id, revision, maps)
    const validated = drafts.map(draftFields)
    if (mapping) {
      mkdirSync(maps, { recursive: true })
      atomicWrite(mapPath, JSON.stringify(mapping))
    }
    return validated.map(enqueue)
  }
  const board = join(root, 'TICKETS.md')
  const raw = readFileSync(board, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split('\n')
  const readDraft = file => JSON.parse(readFileSync(file, 'utf8'))
  const decode = data => JSON.parse(data?.startsWith('%7B')
    ? decodeURIComponent(data) : Buffer.from(data, 'base64url').toString('utf8'))
  if (action === 'list') {
    const pending = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith('.json')) : []
    return pending.map(name => readDraft(join(dir, name)))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map(draft => ({ ...draft, duplicates: duplicateIds(draft.title, lines) }))
  }
  if (action === 'teams') {
    const { ID_RE, linesOf, readInbox } = await import('../../teams-uhura/scripts/inbox.mjs')
    if (!ID_RE.test(id ?? '')) throw new Error('teams intake requires a message ID')
    const message = readInbox(join(common, 'skillator')).findLast(record => record.id === id)
    if (!message) throw new Error('Teams message is not in the inbox')
    const { type, title, steps, severity } = decode(revision)
    const draft = draftFields({ type, title, steps, severity,
      description: linesOf(message.text).join('\n'), reporter: message.from,
      source: 'Teams', sourceId: message.id })
    if (!draft.steps || !draft.severity) throw new Error('Teams triage requires repro steps and severity')
    return enqueue(draft)
  }
  if (action === 'add') {
    return enqueue(draftFields(decode(id)))
  }
  if (!['accept', 'edit', 'reject'].includes(action) || !/^[a-f0-9-]{36}$/.test(id))
    throw new Error('usage: intake list | add <base64url-json> | spreadsheet <file> [column numbers] | teams <message-id> <base64url-json> | accept/edit/reject <draft-id> <revision> [base64url-json]')
  const path = join(dir, id + '.json')
  if (!existsSync(path)) throw new Error('draft is no longer pending')
  const draft = readDraft(path)
  if (draft.revision !== revision) throw new Error('draft has changed; reopen it before deciding')
  if (draft.ticketId && action !== 'accept') throw new Error('approval was interrupted; retry accept to finish it')
  if (action === 'edit') {
    const edited = { ...draft, ...draftFields({ ...draft, ...decode(payload), source: draft.source, sourceId: draft.sourceId }), revision: randomUUID() }
    atomicWrite(path, JSON.stringify(edited))
    return edited
  }
  if (action === 'reject') {
    rmSync(path)
    return { id }
  }
  const details = Object.entries(labels).flatMap(([key, label]) => draft[key] ? [` ${label}: ${markdownText(draft[key])}.`] : [])
  const rowFor = ticketId => `- [ ] ${ticketId} — ${markdownText(draft.title)}${details.join('')}`
  const gitDiff = execFileSync(git, ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=0', 'HEAD', '--', 'TICKETS.md'],
    { cwd: root, encoding: 'utf8' })
  const changes = gitDiff.split(/\r?\n/).filter(line => /^[+-]/.test(line)).slice(2)
  if (gitDiff && !(draft.ticketId && changes.length === 1 && changes[0] === '+' + rowFor(draft.ticketId))) {
    throw new Error('TICKETS.md has uncommitted changes; resolve them before approving')
  }
  const heading = new RegExp(`^## ${sections[draft.type]}(?:\\s|$)`)
  const start = lines.findIndex(line => heading.test(line))
  if (start === -1) throw new Error(`missing ${sections[draft.type]} section`)
  let end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line))
  if (end === -1) end = lines.length
  while (end > start + 1 && !lines[end - 1].trim()) end--
  if (!draft.ticketId) {
    const args = allocator.endsWith('.ps1')
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', allocator, draft.type, board]
      : [allocator.replaceAll('\\', '/'), draft.type, board.replaceAll('\\', '/')]
    const serial = execFileSync(shell, args, { encoding: 'utf8', cwd: dirname(board) }).trim()
    if (!/^\d+$/.test(serial)) throw new Error('ticket allocator returned an invalid number')
    draft.ticketId = draft.type + serial
    atomicWrite(path, JSON.stringify(draft))
  }
  const row = rowFor(draft.ticketId)
  const existing = lines.find(line => line.match(ticket)?.[2] === draft.ticketId)
  if (existing && existing.replace(/\r$/, '') !== row) throw new Error(`reserved ticket ID ${draft.ticketId} already exists with different content`)
  if (!existing) {
    lines.splice(end, 0, row + (eol === '\r\n' && end < lines.length ? '\r' : ''))
    atomicWrite(board, lines.join('\n'))
  }
  rmSync(path)
  return draft.ticketId
}

try {
  const result = await run(process.argv.slice(2))
  console.log(typeof result === 'string' ? result : JSON.stringify(result))
} catch (error) {
  console.error(`ticket-meta intake: ${error.message}`)
  process.exitCode = 1
}
