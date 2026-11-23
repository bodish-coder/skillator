import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const levels = ['critical', 'high', 'medium', 'low']
const coverageStates = ['reviewed', 'partial', 'unavailable', 'out-of-scope']
const source = ['active', 'archive']
const ticket = { id: 'text', source, relation: 'text', reference: 'text' }
const finding = {
  severity: levels, title: 'text', location: 'text', failure: 'text', evidence: ['text'],
  fix: 'text', confidence: 'confidence', tickets: [ticket], 'fixed?': 'text'
}
const runSchema = {
  id: 'text', date: 'text', project: 'text', scope: 'text', notRead: ['text'],
  discarded: 'count', board: 'text', 'summary?': 'text', 'preview?': 'boolean', 'revision?': 'text',
  coverage: [{ area: 'text', status: coverageStates, evidence: 'text' }], findings: [finding],
  proposals: [{ title: 'text', evidence: 'text', options: ['text'] }],
  'strengths?': [{ title: 'text', evidence: 'text', benefit: 'text' }],
  'ticketReviews?': [{ id: 'text', source, reference: 'text', expectation: 'text', evidence: 'text', verdict: 'text' }]
}

// Single-element arrays describe lists. Longer arrays contain the allowed string values.
function validate(value, schema, path) {
  const fail = message => { throw new Error(`${path}: ${message}`) }
  if (Array.isArray(schema)) {
    if (schema.length > 1) {
      if (!schema.includes(value)) fail(`expected one of ${schema.join(', ')}`)
    } else {
      if (!Array.isArray(value)) fail('expected a list')
      value.forEach((item, i) => validate(item, schema[0], `${path}[${i}]`))
    }
  } else if (typeof schema === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object')
    for (const [field, type] of Object.entries(schema)) {
      const key = field.replace(/\?$/, '')
      if (field.endsWith('?') && !Object.hasOwn(value, key)) continue
      validate(value[key], type, `${path}.${key}`)
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema, key) && !Object.hasOwn(schema, key + '?')) fail(`unknown field ${key}`)
    }
  } else if (schema === 'text') {
    if (typeof value !== 'string' || !value.trim()) fail('expected nonempty text')
  } else if (schema === 'boolean') {
    if (typeof value !== 'boolean') fail('expected true or false')
  } else if (!Number.isSafeInteger(value) || value < 0 ||
             (schema === 'confidence' && (value < 80 || value > 100))) {
    fail(schema === 'confidence' ? 'expected a verified confidence of 80–100' : 'expected a nonnegative integer')
  }
}

function checkRecord(record) {
  validate(record, { runs: [runSchema], 'legacyMarkdown?': 'text' }, 'casefile')
  if (!record.runs.length) throw new Error('casefile.runs needs at least one audit')
  const ids = new Set()
  for (const run of record.runs) {
    if (ids.has(run.id)) throw new Error(`duplicate audit ID: ${run.id}`)
    ids.add(run.id)
    for (const item of run.findings) {
      if (!item.evidence.length) throw new Error(`no evidence for ${item.title}`)
    }
  }
}

const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c])
// Treat generated Markdown as a literal-text report, including text copied from ticket boards.
const md = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/([\\`*_{}\[\]()#|!~])/g, '\\$1').replace(/\r?\n/g, ' ')
const display = value => value[0].toUpperCase() + value.slice(1).replaceAll('-', ' ')
const bySeverity = run => levels.flatMap(level => run.findings.filter(item => item.severity === level))
const count = (run, level) => run.findings.filter(item => item.severity === level).length
const ref = ticket => `${ticket.id} · ${display(ticket.source)} · ${ticket.relation} · ${ticket.reference}`
const status = (run, n) => `${n} of ${run.findings.length} findings`
const metadata = run => [
  ['Audit ID', run.id], ['Date', run.date], ...(run.revision ? [['Revision', run.revision]] : [])
]
const normalizeFile = text => text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trimEnd()
const digest = text => createHash('sha256').update(normalizeFile(text)).digest('hex')

function markdownRun(run) {
  const lines = [`## ${md(run.project)} — ${md(run.date)}`, '']
  if (run.preview) lines.push('**Sample audit with fictional evidence.**', '')
  for (const [label, value] of metadata(run)) lines.push(`- **${label}** · ${md(value)}`)
  lines.push('', `**Scope** · ${md(run.scope)}`)
  if (run.summary) lines.push('', md(run.summary))
  lines.push('', `**Verified findings** · ${run.findings.length}  `, `**Discarded on verification** · ${run.discarded}  `,
    levels.map(level => `${display(level)} ${count(run, level)}`).join(' · '), '', `**Board** · ${md(run.board)}`)
  for (const level of levels) {
    lines.push('', `### ${display(level)} (${count(run, level)})`, '')
    const items = run.findings.filter(item => item.severity === level)
    if (!items.length) lines.push('No verified findings at this severity.')
    for (const item of items) {
      lines.push(`#### ${md(item.title)}`, '', `- **Location** · ${md(item.location)}`,
        `- **Confidence** · ${item.confidence}/100`, `- **Failure** · ${md(item.failure)}`,
        '- **Evidence**', ...item.evidence.map(text => `  - ${md(text)}`), `- **Fix** · ${md(item.fix)}`,
        '- **Ticket links**', ...(item.tickets.length ? item.tickets.map(t => `  - ${md(ref(t))}`) : ['  - Casefile only']))
      if (item.fixed) lines.push(`- **Fixed** · ${md(item.fixed)}`)
      lines.push('')
    }
  }
  lines.push('### Coverage', '', ...run.coverage.map(c => `- **${md(c.area)}** · ${display(c.status)} · ${md(c.evidence)}`))
  if (!run.coverage.length) lines.push('No coverage entries recorded.')
  lines.push('', '**Not read**', '', ...(run.notRead.length ? run.notRead.map(text => `- ${md(text)}`) : ['None recorded.']))
  for (const group of supportingGroups(run)) {
    lines.push('', `### ${group.title}`, '')
    if (!group.items.length) lines.push(group.empty)
    for (const item of group.items) {
      lines.push(`#### ${md(item.title)}`, '')
      for (const [label, value] of item.rows) lines.push(`- **${label}** · ${md(value)}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

function supportingGroups(run) {
  return [
    { title: 'Ticket review', empty: 'No ticket reviews recorded.', items: (run.ticketReviews ?? []).map(t => ({
      title: `${t.id} · ${t.verdict}`, rows: [['Source', display(t.source)], ['Reference', t.reference],
        ['Expectation', t.expectation], ['Evidence', t.evidence]]
    })) },
    { title: 'Verified strengths', empty: 'No verified strengths recorded.', items: (run.strengths ?? []).map(s => ({
      title: s.title, rows: [['Evidence', s.evidence], ['Benefit', s.benefit]]
    })) },
    { title: 'Architectural proposals', empty: 'No architectural proposals recorded.', items: run.proposals.map(p => ({
      title: p.title, rows: [['Evidence', p.evidence], ...p.options.map((option, i) => [`Option ${i + 1}`, option])]
    })) }
  ]
}

const h = escapeHtml
const bulletList = items => `<ul>${items.map(s => `<li>${h(s)}</li>`).join('')}</ul>`
const rows = entries => `<dl class="pairs">${entries.map(([label, value]) =>
  `<dt>${h(label)}</dt><dd>${h(value)}</dd>`).join('')}</dl>`
const badge = level => `<span class="badge ${level}"><i aria-hidden="true"></i>${display(level)}</span>`

function htmlFinding(item, id, reviews, anchor) {
  const tags = item.tickets.map(t => `<span>${h(t.id)} · ${h(t.relation)}</span>`).join(' / ')
  const links = item.tickets.map(t => {
    const i = reviews.findIndex(r => r.id === t.id && r.source === t.source)
    const label = h(ref(t))
    return `<li>${i < 0 ? label : `<a href="#${anchor}-ticket-${i + 1}">${label}</a>`}</li>`
  })
  return `<article class="finding" data-finding data-level="${item.severity}">
    <h4><button type="button" data-toggle aria-expanded="true" aria-controls="${id}">
      <span class="finding-meta">${badge(item.severity)}<span class="ticket-tag">${tags || 'Casefile only'}</span></span>
      <span class="finding-title">${h(item.title)}</span><span class="twist" aria-hidden="true"></span>
    </button></h4>
    <div class="finding-body" id="${id}" data-body>
      <p class="location"><code>${h(item.location)}</code><span>Confidence ${item.confidence}/100</span></p>
      <h5>Observed failure</h5><p>${h(item.failure)}</p>
      <h5>Evidence</h5>${bulletList(item.evidence)}
      <h5>Proposed fix</h5><p>${h(item.fix)}</p>
      <h5>Ticket links</h5>${links.length ? `<ul>${links.join('')}</ul>` : '<p>Casefile only</p>'}
      ${item.fixed ? `<h5>Fixed</h5><p>${h(item.fixed)}</p>` : ''}
    </div></article>`
}

function htmlRun(run, i) {
  const totals = levels.map(level => `<li class="${level}"><i></i><span>${display(level)}</span><b>${count(run, level)}</b></li>`).join('')
  const bars = levels.flatMap(level => {
    const n = count(run, level)
    return n ? [`<span class="${level}" style="flex:${n}"></span>`] : []
  }).join('')
  const groups = supportingGroups(run)
  const anchor = 'audit-' + (i + 1)
  const sections = ['Findings', 'Coverage', ...groups.map(g => g.title)]
  const findings = bySeverity(run)
  return `<section class="audit" data-run id="${anchor}" aria-labelledby="${anchor}-title">
    <header class="hero"><div class="hero-copy">
      <p class="overline"><span class="line"></span>${run.preview ? 'Sample audit · Fictional evidence' : 'Application audit'}</p>
      <h2 id="${anchor}-title">${h(run.project)}</h2><p class="abstract">${h(run.summary || run.scope)}</p>
      <div class="byline"><span>${h(run.date)}</span>${run.revision ? `<span>Revision <code>${h(run.revision)}</code></span>` : ''}</div>
    </div><aside class="overview" aria-label="Severity summary">
      <div class="lead-stat"><strong>${findings.length}</strong><span>Verified findings</span></div>
      <div class="distribution" aria-hidden="true">${bars}</div><ul class="ledger">${totals}</ul>
      <p class="discarded">${run.discarded} discarded on verification</p>
    </aside></header>
    <nav class="section-nav" aria-label="Sections for ${h(run.project)}">${sections.map((s,k) =>
      `<a href="#${anchor}-s${k}">${s}</a>`).join('')}</nav>
    <section id="${anchor}-s0" class="chapter"><div class="section-heading"><h3>Findings</h3><span class="count">${findings.length}</span></div>
      <div class="tools interactive"><label class="search"><span class="search-icon" aria-hidden="true"></span><span class="sr">Search findings</span><input type="search" placeholder="Search findings, files or tickets" data-search></label>
      <label><span class="sr">Filter by severity</span><select data-severity><option value="">All severities</option>${levels.map(l => `<option value="${l}">${display(l)}</option>`).join('')}</select></label>
      <button type="button" class="expand" data-expand>Expand all</button></div>
      <p class="results interactive" data-results role="status">${status(run, findings.length)}</p>
      ${findings.map((f,k) => htmlFinding(f, `${anchor}-f${k + 1}`, run.ticketReviews ?? [], anchor)).join('')}
      ${findings.length ? '<p class="empty" data-empty hidden>No findings match these filters.</p>' : '<p class="empty">No findings passed verification.</p>'}
    </section>
    <section class="chapter" id="${anchor}-s1"><div class="section-heading"><h3>Coverage</h3></div>
      ${rows([['Audit ID', run.id], ['Scope', run.scope], ['Board', run.board]])}
      ${run.coverage.length ? `<div class="coverage-list">${run.coverage.map(c => `<article><div><h4>${h(c.area)}</h4><span class="status">${display(c.status)}</span></div><p>${h(c.evidence)}</p></article>`).join('')}</div>` : '<p>No coverage entries recorded.</p>'}
      <h4>Not read</h4>${run.notRead.length ? bulletList(run.notRead) : '<p>None recorded.</p>'}
    </section>
    ${groups.map((g,k) => `<section class="chapter" id="${anchor}-s${k + 2}"><div class="section-heading"><h3>${g.title}</h3><span class="count">${g.items.length}</span></div>
      ${g.items.length ? g.items.map((s,j) => `<article class="support"${k === 0 ? ` id="${anchor}-ticket-${j + 1}"` : ''}><h4>${h(s.title)}</h4>${rows(s.rows)}</article>`).join('') : `<p>${g.empty}</p>`}</section>`).join('')}
  </section>`
}

export function renderCasefile(record) {
  checkRecord(record)
  const css = readFileSync(new URL('./casefile.css', import.meta.url), 'utf8')
  const js = readFileSync(new URL('./casefile-browser.js', import.meta.url), 'utf8')
  const latest = record.runs.at(-1)
  const history = record.runs.length > 1 ? `<nav class="history" aria-label="Audit history"><strong>Audit history</strong>${record.runs.map((r,i) =>
    `<a href="#audit-${i + 1}">${h(r.date)} · ${h(r.project)}</a>`).join('')}</nav>` : ''
  const legacy = record.legacyMarkdown
  const markdown = '# Audit casefile\n\n' + (legacy ? legacy + '\n\n---\n\n' : '') +
    record.runs.map(markdownRun).join('\n\n---\n\n') + '\n'
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="casefile-markdown-sha256" content="${digest(markdown)}">
<title>${h(latest.project)} · Audit casefile</title><style>${css}</style></head>
<body><a class="skip" href="#main">Skip to casefile</a>
<header class="mast"><div class="frame mast-inner"><div class="brand"><span class="lens" aria-hidden="true"></span><div><strong>Sherlock</strong><h1>Audit casefile</h1></div></div>
<button type="button" class="print interactive" id="export-pdf"><span aria-hidden="true">↓</span> Export PDF</button></div></header>
<main id="main" class="frame">${history}${record.runs.map((r,i) => htmlRun(r,i)).reverse().join('')}
${legacy ? `<section class="chapter"><h2>Previous casefile</h2><pre class="legacy">${h(legacy)}</pre></section>` : ''}
</main><footer><div class="frame"><strong>Sherlock</strong><span>Audit casefile · ${h(latest.project)}</span></div></footer><script>${js}</script></body></html>`
  return { markdown, html }
}

function preservesHistory(previous, next, legacy) {
  if (legacy && normalizeFile(previous) === normalizeFile(legacy)) return true
  const oldLines = normalizeFile(previous).split('\n')
  const newLines = normalizeFile(next).split('\n')
  let i = 0
  for (const line of newLines) {
    if (i === oldLines.length) return true
    if (line === oldLines[i]) i++
    else if (!line.startsWith('- **Fixed** · ')) return false
  }
  return i === oldLines.length
}

// Stage both outputs before replacing either. Keep the old Markdown for rollback if HTML is locked.
function writeCasefile(output, record, { markdown, html }) {
  mkdirSync(output, { recursive: true })
  const lock = join(output, '.casefile-render.lock')
  try { writeFileSync(lock, String(process.pid), { flag: 'wx' }) }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`An existing render lock is at ${lock}. Check whether its process is still running before removing it.`)
    throw error
  }
  let staging
  let recoveryNeeded = false
  try {
    const mdPath = join(output, 'CASEFILE.md')
    const htmlPath = join(output, 'CASEFILE.html')
    const previous = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null
    if (previous !== null && !preservesHistory(previous, markdown, record.legacyMarkdown)) {
      throw new Error('Existing CASEFILE.md contains earlier evidence. Keep previous runs in the ledger or migrate the exact earlier document into legacyMarkdown.')
    }
    if (existsSync(htmlPath)) {
      const previousHtml = readFileSync(htmlPath, 'utf8')
      const previousHash = previousHtml.match(/<meta name="casefile-markdown-sha256" content="([a-f0-9]{64})">/)?.[1]
      if (![digest(markdown), ...(previous === null ? [] : [digest(previous)])].includes(previousHash)) {
        throw new Error('Existing CASEFILE.html belongs to a different or incomplete report. Restore its matching Markdown before rendering into this directory.')
      }
    }
    staging = mkdtempSync(join(output, '.casefile-render-'))
    writeFileSync(join(staging, 'new.md'), markdown)
    writeFileSync(join(staging, 'new.html'), html)
    if (previous !== null) writeFileSync(join(staging, 'original.md'), previous)
    renameSync(join(staging, 'new.md'), mdPath)
    try { renameSync(join(staging, 'new.html'), htmlPath) }
    catch (error) {
      try {
        if (previous !== null) renameSync(join(staging, 'original.md'), mdPath)
        else unlinkSync(mdPath)
      } catch (rollbackError) {
        recoveryNeeded = true
        throw new Error(`Could not restore CASEFILE.md: ${rollbackError.message}. Recovery files remain in ${staging}.`)
      }
      throw error
    }
  } finally {
    try {
      if (staging && !recoveryNeeded) {
        for (const name of ['new.md', 'new.html', 'original.md']) {
          const path = join(staging, name)
          if (existsSync(path)) unlinkSync(path)
        }
        rmdirSync(staging)
      }
    } finally { unlinkSync(lock) }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [input, output] = process.argv.slice(2)
    if (!input || !output || process.argv.length !== 4) throw new Error('Usage: node render-casefile.mjs <casefile.json> <output-directory>')
    const record = JSON.parse(readFileSync(input, 'utf8').replace(/^\uFEFF/, ''))
    writeCasefile(output, record, renderCasefile(record))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
