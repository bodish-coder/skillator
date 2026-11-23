import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderCasefile } from './render-casefile.mjs'

const sample = () => JSON.parse(readFileSync(new URL('./example-casefile.json', import.meta.url), 'utf8'))
const renderer = fileURLToPath(new URL('./render-casefile.mjs', import.meta.url))

test('both formats include the scope, every finding, the complete ticket reviews and positive evidence', () => {
  const record = sample()
  const { html, markdown } = renderCasefile(record)
  const run = record.runs[0]
  const contents = [run.scope, run.summary, run.board, ...run.notRead,
    ...run.findings.flatMap(f => [f.title, f.failure, ...f.evidence, f.fix, ...f.tickets.map(t => t.reference)]),
    ...run.coverage.map(c => c.evidence), ...run.proposals.flatMap(p => [p.evidence, ...p.options]),
    ...run.ticketReviews.map(t => t.evidence), ...run.strengths.flatMap(s => [s.evidence, s.benefit])]
  for (const value of contents) {
    assert.ok(html.includes(value.replaceAll("'", '&#39;')), value)
    assert.ok(markdown.includes(value), value)
  }
})

test('empty results render and embedded evidence stays literal in each format', () => {
  const record = sample()
  const run = record.runs[0]
  const hostile = '<img src=x onerror="alert(1)">'
  run.findings = []
  run.coverage = []
  run.notRead = []
  run.project = hostile
  const { html, markdown } = renderCasefile(record)
  assert.ok(html.includes('No findings passed verification.'))
  assert.ok(markdown.includes('**Verified findings** · 0'))
  assert.ok(!html.includes(hostile))
  assert.ok(!markdown.includes(hostile))
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'))
})

test('invalid and incomplete ledgers leave both files intact, while migration, verified fixes and appends succeed', t => {
  const directory = mkdtempSync(join(tmpdir(), 'sherlock-casefile-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'casefile.json')
  const md = join(directory, 'CASEFILE.md')
  const html = join(directory, 'CASEFILE.html')
  const files = () => [readFileSync(md, 'utf8'), readFileSync(html, 'utf8')]
  const call = record => {
    writeFileSync(input, JSON.stringify(record))
    return spawnSync(process.execPath, [renderer, input, directory], { encoding: 'utf8' })
  }
  const record = sample()
  const legacy = '# Prior audit\r\n\r\nOld evidence at src/old.ts:13.\r\n'
  writeFileSync(md, legacy)
  assert.match(call(record).stderr, /earlier evidence/)
  assert.equal(readFileSync(md, 'utf8'), legacy)
  record.legacyMarkdown = legacy
  assert.equal(call(record).status, 0)
  assert.ok(readFileSync(md, 'utf8').includes(legacy))
  const unmodified = files()
  const invalid = structuredClone(record)
  invalid.runs[0].findings[0].confidence = 79
  assert.match(call(invalid).stderr, /80–100/)
  assert.deepEqual(files(), unmodified)
  const incomplete = structuredClone(record)
  incomplete.runs[0].findings.shift()
  assert.match(call(incomplete).stderr, /earlier evidence/)
  assert.deepEqual(files(), unmodified)
  record.runs[0].findings[0].fixed = 'f423ade'
  const second = structuredClone(record.runs[0])
  second.date = '2026-12-10'
  second.id = 'atlas-second'
  second.findings = []
  record.runs.push(second)
  assert.equal(call(record).status, 0)
  assert.ok(readFileSync(html, 'utf8').includes('f423ade'))
  assert.ok(readFileSync(md, 'utf8').includes('atlas-second'))
  const complete = files()
  record.runs.shift()
  assert.notEqual(call(record).status, 0)
  assert.deepEqual(files(), complete)
})
