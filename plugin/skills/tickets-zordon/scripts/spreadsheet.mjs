import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const columns = [
  ['Type', 'type'], ['Title', 'title'], ['Description', 'description'],
  ['Steps', 'steps'], ['Severity', 'severity'], ['Reporter', 'reporter'],
  ['Screenshot link', 'screenshot'],
]
const sizeLimit = 16 * 1024 * 1024

function csv(text) {
  const field = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n?|\n|$)/y
  const rows = []
  let row = []
  let offset = 0
  while (offset < text.length || row.length) {
    const match = field.exec(text)
    if (!match) throw new Error(`invalid CSV near character ${offset + 1}`)
    const [, value, delimiter] = match
    row.push(value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value)
    if (row.length > 16384) throw new Error('spreadsheet exceeds 16,384 columns')
    if (delimiter !== ',') {
      rows.push(row)
      if (rows.length > 50000) throw new Error('spreadsheet exceeds 50,000 rows')
      row = []
    }
    offset = field.lastIndex
  }
  return rows
}

function readRows(file) {
  const extension = extname(file).toLowerCase()
  if (!['.csv', '.xlsx'].includes(extension)) throw new Error('expected a .csv or .xlsx spreadsheet')
  const info = statSync(file)
  if (!info.isFile() || info.size > sizeLimit) throw new Error('spreadsheet must be a file of at most 16 MiB')
  if (extension === '.csv') {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file))
    return csv(text)
  }
  const reader = fileURLToPath(new URL('./spreadsheet-xlsx.py', import.meta.url))
  const python = process.platform === 'win32' ? 'python' : 'python3'
  try {
    return JSON.parse(execFileSync(python, ['-X', 'utf8', reader, file], {
      encoding: 'utf8', maxBuffer: sizeLimit, stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`XLSX import requires Python 3 (${python} on PATH). You can also export the worksheet as UTF-8 CSV.`)
    throw new Error(error.stderr?.trim() || 'could not read XLSX; check Python 3 and the workbook, or export as CSV')
  }
}

export async function readSpreadsheet(file, supplied, dir) {
  if (!file) throw new Error('usage: intake spreadsheet <file.csv|file.xlsx> [column numbers]')
  const rows = readRows(file)
  const first = rows.findIndex(row => row.some(cell => cell.trim()))
  if (first === -1) throw new Error('spreadsheet has no header row')
  const headers = rows[first].map(cell => cell.trim())
  const normalized = headers.map(header => header.toLowerCase())
  const fingerprint = createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  const mapPath = join(dir, fingerprint + '.json')
  let mapping = columns.map(([label]) => normalized.indexOf(label.toLowerCase()) + 1)
  let save = false
  if (supplied !== undefined) {
    save = true
  } else if (existsSync(mapPath)) {
    mapping = JSON.parse(readFileSync(mapPath, 'utf8'))
  } else if (normalized.length !== columns.length || mapping.includes(0)) {
    const choices = headers.map((header, i) => `${i + 1}=${JSON.stringify(header)}`).join(', ')
    const guide = `Columns: ${choices}\nEnter column numbers in this order: ${columns.map(([label]) => label).join(', ')}. Use 0 for unused optional fields.`
    if (!process.stdin.isTTY) throw new Error(`${guide}\nRerun with the seven comma-separated numbers as the final argument.`)
    const prompt = createInterface({ input: process.stdin, output: process.stderr, terminal: false })
    try {
      supplied = await prompt.question(`${guide}\nMapping: `)
    } finally {
      prompt.close()
    }
    save = true
  }
  if (save) {
    const parts = supplied.split(',').map(part => part.trim())
    mapping = parts.map(part => /^\d+$/.test(part) ? Number(part) : NaN)
  }
  if (!Array.isArray(mapping) || mapping.length !== columns.length || !mapping[0] || !mapping[1]
    || mapping.some(index => !Number.isInteger(index) || index < 0 || index > headers.length)
    || new Set(mapping.filter(Boolean)).size !== mapping.filter(Boolean).length) {
    throw new Error('mapping needs seven distinct column numbers; only optional fields may use 0')
  }
  const drafts = rows.slice(first + 1).flatMap((row, i) => {
    if (!row.some(cell => cell.trim())) return []
    const draft = Object.fromEntries(columns.flatMap(([, key], j) => mapping[j] ? [[key, row[mapping[j] - 1]?.trim() ?? '']] : []))
    const type = draft.type.toLowerCase()
    if (type === 'bug' || type === 'b') draft.type = 'B'
    else if (type === 'feature' || type === 'f') draft.type = 'F'
    else throw new Error(`row ${first + i + 2}: Type must be Bug, Feature, B or F`)
    if (!draft.title) throw new Error(`row ${first + i + 2}: Title is required`)
    return [{ ...draft, source: 'Spreadsheet' }]
  })
  return { drafts, mapPath, mapping: save ? mapping : undefined }
}
