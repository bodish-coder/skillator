export type Draft = {
  id: string; revision: string; type: 'B' | 'F'; title: string; description?: string
  steps?: string; severity?: string; reporter?: string; screenshot?: string; source?: string; sourceId?: string
  duplicates: string[]; ticketId?: string
}

export function firstDraft(output: string): Draft | undefined {
  return (JSON.parse(output) as Draft[])[0]
}

export function intakeDetails(draft: Draft): string[] {
  return [
    draft.duplicates.length ? 'Possible duplicates: ' + draft.duplicates.join(', ') : '',
    draft.ticketId ? 'Interrupted approval. Accept to finish it.' : '',
    draft.description,
    draft.steps && 'Steps: ' + draft.steps,
    draft.severity && 'Severity: ' + draft.severity,
    draft.reporter && 'Reporter: ' + draft.reporter,
    draft.screenshot && 'Screenshot: ' + draft.screenshot,
    draft.source && 'Source: ' + draft.source,
    draft.sourceId && 'Source ID: ' + draft.sourceId,
  ].flatMap(line => line ? line.split(/\r?\n/).map(cleanIntakeText) : [])
}

export const cleanIntakeText = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, ' ')
export const draftEdit = (title: string, description: string) => encodeURIComponent(JSON.stringify({ title, description }))
export type IntakePaths = { file: string; mapping: string; folder: string }
export const newIntakePaths = (): IntakePaths => ({ file: '', mapping: '', folder: '' })

export function intakeImportArgs(paths: IntakePaths): string[] {
  const file = paths.file.trim()
  if (/\.(csv|xlsx)$/i.test(file)) return ['spreadsheet', file, ...(paths.mapping.trim() ? [paths.mapping.trim()] : [])]
  if (/\.xml$/i.test(file)) return ['xml', file, ...(paths.mapping.trim() ? [paths.mapping.trim()] : [])]
  if (/\.json$/i.test(file)) return ['xml', file]
  throw new Error('Choose a CSV, XLSX, XML, or ATS results JSON file.')
}
