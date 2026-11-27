import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'
import type { Priority, RuleDraft, RulesPreviewDraft, RulesView } from '../types'
import { PRIORITIES, PRIORITY_FILTERS, priorityFilterOptions } from './lib/board'
import { runCall } from './lib/host'
import { hasValue, orderedRules, parseRulesList, parseRulesPreview, ruleArgs, ruleMatchLine, ruleOptions, ruleReads, ruleSummary, sameRule, toggleValue } from './lib/rules'
import { clearForm, closeForm, showForm } from './assign'
import { say } from './logtab'

// F203: the Priorities tab's rules editor. queue-jarvis owns .skillator/priority-rules.md;
// every read and write here is a `queue-priority` run - the mod writes no file.
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const rulesA = atom({ plugin: 'ops-board', key: 'priorityRules' } as const, null)
const draftA = atom({ plugin: 'ops-board', key: 'ruleDraft' } as const, null)
const previewA = atom({ plugin: 'ops-board', key: 'rulesPreview' } as const, null)
const NONE: RulesView = { loading: false, error: null, revision: '', rules: [], invalid: [] }
const PAGE = 12
const LEVELS = Object.keys(PRIORITIES) as Priority[]
let listRequest = 0
let formRequest = 0

type Ran = { code: number; out: string; err: string }
// A function declaration: the hooks loader follows $ past a call only into one.
async function rules($: EngineInterface, args: string[]): Promise<Ran> {
  return runCall($, 'queue-priority', ['--current-worktree', 'rules', ...args]).catch(err => ({ code: -1, out: '', err: String(err) }))
}
const failed = (r: Ran) => r.err.trim() || r.out.trim() || `Queue Jarvis exited ${r.code}`

export async function loadRules($: EngineInterface) {
  const request = ++listRequest
  await update($, rulesA, current => ({ ...(current ?? NONE), loading: true }))
  const r = await rules($, ['list'])
  const list = r.code === 0 ? parseRulesList(r.out) : null
  if (request !== listRequest) return
  await update($, rulesA, () => list
    ? { ...NONE, ...list }
    : { ...NONE, error: r.code === 0 ? 'Queue Jarvis returned an incomplete rules list. Reload.' : failed(r) })
}

export async function openRule($: EngineInterface, n: number | null) {
  const view = await read($, rulesA)
  const rule = n === null ? null : view?.rules.find(x => x.n === n)
  if (!view || view.error || (n !== null && !rule)) return
  await clearForm($)
  const request = ++formRequest
  const level = rule?.level ?? 'P1'
  await update($, draftA, () => ({ request, n, level, values: Object.fromEntries(rule?.conditions ?? []), picker: null,
    busy: false, error: null, confirmDelete: false, revision: view.revision, origin: rule ?? null }))
  await showForm($, 'rule:level:' + level)
}

// Save (add / edit) or, with remove true, delete. Done: a toast, the form closed, the list read again.
async function writeRule($: EngineInterface, remove: boolean) {
  const draft = await read($, draftA)
  if (!draft || draft.busy) return
  const args = remove ? ['remove', String(draft.n), '--rev', draft.revision]
    : draft.n === null ? ['add', ...ruleArgs(draft.level, draft.values)]
    : ['edit', String(draft.n), ...ruleArgs(draft.level, draft.values), '--rev', draft.revision]
  if (!remove && args.filter(a => a.includes('=')).length === 0) return
  const request = ++formRequest
  let started = false
  await update($, draftA, current => {
    started = current?.request === draft.request && !current.busy
    return started ? { ...draft, request, busy: true, error: null, picker: null } : current
  })
  if (!started) return
  const r = await rules($, args)
  if (r.code !== 0) {
    await update($, draftA, current => current?.request === request ? { ...current, busy: false, confirmDelete: false, error: failed(r) } : current)
    // a stale revision: the list is read again; the form takes the new revision only while its rule
    // still sits at number n, else a second Save / Delete would hit another rule - the form closes
    await loadRules($)
    const view = await read($, rulesA)
    if (!view?.revision) return
    if (draft.n === null || sameRule(view.rules.find(x => x.n === draft.n), draft.origin)) {
      await update($, draftA, current => current?.request === request ? { ...current, revision: view.revision } : current)
    } else if ((await read($, draftA))?.request === request) {
      say($, 'The rules changed: rule ' + draft.n + ' is now another rule. Open it again from the list.', { timeoutMs: 8000 })
      await closeForm($)
    }
    return
  }
  say($, remove ? '✓ Priority rule deleted' : '✓ Priority rule saved', { timeoutMs: 8000 })
  if ((await read($, draftA))?.request === request) await closeForm($)
  await loadRules($)
}

// Esc while the value picker is up closes only the picker, like the TUI; true if it did.
export async function closeRulePicker($: EngineInterface): Promise<boolean> {
  const draft = await read($, draftA)
  if (!draft?.picker || draft.busy) return false
  const key = draft.picker.key
  await update($, draftA, current => current?.request === draft.request ? { ...current, picker: null } : current)
  await showForm($, 'rule:field:' + key)
  return true
}

export async function openRulesPreview($: EngineInterface) {
  await clearForm($)
  const request = ++formRequest
  await update($, previewA, () => ({ request, busy: false, error: null, preview: null }))
  await showForm($, 'rule:preview-cancel')
  await runRulesPreview($)
}

// Preview, or with save true apply the previewed token. True once the board was changed.
export async function runRulesPreview($: EngineInterface, save = false): Promise<boolean> {
  const draft = await read($, previewA)
  if (!draft || draft.busy || (save && !draft.preview?.token)) return false
  const request = ++formRequest
  let started = false
  await update($, previewA, current => {
    started = current?.request === draft.request && !current.busy
    return started ? { request, busy: true, error: null, preview: null } : current
  })
  if (!started) return false
  const finish = (preview: RulesPreviewDraft['preview'], error: string | null) =>
    update($, previewA, current => current?.request === request ? { ...current, busy: false, preview, error } : current)
  const r = await rules($, save ? ['apply', draft.preview!.token!] : ['preview'])
  if (r.code !== 0) { await finish(null, failed(r)); return false }
  if (save) {
    say($, r.out.trim().split(/\r?\n/).at(-1) || 'Priority rules applied.', { timeoutMs: 8000 })
    if ((await read($, previewA))?.request === request) await closeForm($)
    return true
  }
  const preview = parseRulesPreview(r.out)
  await finish(preview, preview ? null : 'Queue Jarvis returned an incomplete preview. Run Preview again.')
  return false
}

// The rules under their level, the status line and the action row: the Priorities tab body below the tab bar.
export async function renderRules($: EngineInterface, e: RenderInput<'Pane'>, ascii: boolean, dot: string): Promise<RenderElement> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const view = await read($, rulesA)
  const shown = orderedRules(view?.rules ?? [])
  const usable = !!view && !view.loading && !view.error
  return (
    <Box flexDirection="column">
      {LEVELS.map(id => (
        <Box key={'level:' + id} flexDirection="column">
          <Text key={id}><Text color={ascii ? undefined : PRIORITIES[id].color}>{ascii ? '' : dot + ' '}{id}</Text>{'  ' + PRIORITIES[id].label}</Text>
          {shown.filter(rule => rule.level === id).map(rule =>
            <Button key={'rule:' + rule.n} plain onPress={() => { void openRule($, rule.n) }}>{'    ' + ruleSummary(rule)}</Button>)}
        </Box>
      ))}
      <Text dimColor>Unprioritized tickets follow P5 in Queue Jarvis.</Text>
      {!view && <Text key="rule:unloaded" dimColor>Rules not read yet. Press Reload.</Text>}
      {view?.loading && <Text key="rule:loading" dimColor>Loading rules…</Text>}
      {view?.error && <Box key="rule:list-error"><Text color="error" wrap="wrap">{view.error}</Text></Box>}
      {usable && !shown.length && !view.invalid.length && <Box key="rule:empty"><Text dimColor wrap="wrap">
        No priority rules yet. A rule ranks every matching open ticket, e.g. P1 for bugs in an app.</Text></Box>}
      {usable && view.invalid.length > 0 && <Box key="rule:invalid"><Text color="warning" wrap="wrap">
        {[...view.invalid, 'Fix these lines in .skillator/priority-rules.md. Rules cannot be applied until then.'].join('\n')}</Text></Box>}
      <Box flexDirection="row" flexWrap="wrap" gap={2}>
        {usable && <Button key="rule:add" plain hotkey="n" onPress={() => { void openRule($, null) }}>Add rule</Button>}
        {usable && shown.length > 0 && !view.invalid.length &&
          <Button key="rule:preview" plain hotkey="p" onPress={() => { void openRulesPreview($) }}>Apply rules</Button>}
        <Button key="rule:reload" plain hotkey="r" onPress={() => { void loadRules($) }}>Reload</Button>
      </Box>
    </Box>
  )
}

// The add / edit form, its picker, or the apply preview: whichever is up, else null.
export async function renderRuleForm($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const preview = await read($, previewA)
  if (preview) {
    const p = preview.preview
    return (
      <Box flexDirection="column">
        <Box key="form:title"><Text bold>Apply priority rules</Text><Text dimColor>{'  Esc cancels'}</Text></Box>
        <Text dimColor wrap="wrap">A matching ticket takes its rule's priority, replacing the one it has.</Text>
        {preview.busy && <Text dimColor>Working…</Text>}
        {preview.error && <Box key="rule:preview-error"><Text color="error" wrap="wrap">{preview.error}</Text></Box>}
        {p && <Box key="rule:preview-summary" flexDirection="column">
          <Text>{p.count}</Text><Text wrap="wrap">{p.levels}</Text>
          {p.warning && <Text key="rule:preview-warning" color="warning" wrap="wrap">{p.warning}</Text>}
          {!p.token && <Text dimColor wrap="wrap">No ticket would change: every matching ticket already has its rule's priority, or no open ticket matches a rule.</Text>}
        </Box>}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {!preview.busy && <Button key="rule:preview-again" plain onPress={() => { void runRulesPreview($) }}>Preview</Button>}
          {p?.token && !preview.busy && <Button key="rule:apply" variant="primary" onPress={() => {}}>Save</Button>}
          <Button key="rule:preview-cancel" plain onPress={() => { void closeForm($) }}>Cancel</Button>
        </Box>
        {p?.changes.length ? <Box key="rule:preview-changes"><Text wrap="wrap">{p.changes.join('\n')}</Text></Box> : null}
      </Box>
    )
  }
  const draft = await read($, draftA)
  if (!draft) return null
  const set = (change: (d: RuleDraft) => RuleDraft) => {
    void update($, draftA, current => current && !current.busy && current.request === draft.request ? change(current) : current)
  }
  const board = await read($, boardA)
  const fields = priorityFilterOptions(board, true)
  const picking = draft.picker && fields.find(field => field.key === draft.picker!.key)
  if (draft.picker && picking) {
    const chosen = draft.values[picking.key] ?? []
    const options = ruleOptions(picking.values, chosen)
    // a toggle or Clear can shrink the options: the page is clamped to the last one
    const lastPage = Math.max(0, Math.ceil(options.length / PAGE) - 1)
    const start = Math.min(draft.picker.page, lastPage) * PAGE
    const page = (by: number) => set(d => d.picker ? { ...d, picker: { ...d.picker, page: Math.min(d.picker.page, lastPage) + by } } : d)
    return (
      <Box flexDirection="column">
        <Box key="form:title"><Text bold>{picking.label}</Text><Text dimColor>{'  any of the checked values'}</Text></Box>
        {!options.length && <Text dimColor wrap="wrap">No open ticket has a value for this field.</Text>}
        {options.slice(start, start + PAGE).map(value =>
          <Button key={'rule:option:' + value} plain onPress={() => set(d => ({ ...d, error: null,
            values: { ...d.values, [picking.key]: toggleValue(d.values[picking.key] ?? [], value) } }))}>
            {(hasValue(chosen, value) ? '[x] ' : '[ ] ') + value}</Button>)}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {start > 0 && <Button key="rule:picker-previous" plain onPress={() => page(-1)}>Previous</Button>}
          {start + PAGE < options.length && <Button key="rule:picker-next" plain onPress={() => page(1)}>Next</Button>}
          <Button key="rule:picker-clear" plain onPress={() => set(d => ({ ...d, values: { ...d.values, [picking.key]: [] } }))}>Clear</Button>
          <Button key="rule:picker-back" plain onPress={() => set(d => ({ ...d, picker: null }))}>Done</Button>
        </Box>
      </Box>
    )
  }
  const hasCondition = PRIORITY_FILTERS.some(({ key }) => draft.values[key]?.length)
  return (
    <Box flexDirection="column">
      <Box key="form:title"><Text bold>{draft.n === null ? 'New priority rule' : 'Edit rule ' + draft.n}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>
      <Text dimColor wrap="wrap">A ticket matches when every chosen field matches; several values in a field mean any of them.</Text>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {LEVELS.map(level => draft.busy
          ? <Text key={'rule:level:' + level} bold={level === draft.level}>{level}</Text>
          : <Button key={'rule:level:' + level} plain variant={level === draft.level ? 'primary' : undefined}
              onPress={() => set(d => ({ ...d, level, error: null }))}>{level}</Button>)}
      </Box>
      {fields.map(({ key, label }) => {
        const text = label + ' ' + (draft.values[key]?.length ? draft.values[key]!.join(', ') : 'any')
        return draft.busy ? <Text key={'rule:field:' + key} wrap="wrap">{text}</Text>
          : <Button key={'rule:field:' + key} plain onPress={() => set(d => ({ ...d, picker: { key, page: 0 }, confirmDelete: false }))}>{text}</Button>
      })}
      <Box key="rule:reads" flexDirection="column">
        <Text dimColor>Reads as</Text>
        <Text wrap="wrap">{ruleReads(draft.level, draft.values)}</Text>
        {hasCondition && <Text dimColor wrap="wrap">{ruleMatchLine(board?.tickets ?? [], draft.values)}</Text>}
      </Box>
      {draft.busy && <Text dimColor>Working…</Text>}
      {draft.error && <Box key="rule:error"><Text color="error" wrap="wrap">{draft.error}</Text></Box>}
      {draft.confirmDelete && !draft.busy
        ? <Box flexDirection="row" flexWrap="wrap" gap={2}>
            <Text>Delete this rule?</Text>
            <Button key="rule:delete-yes" plain onPress={() => { void writeRule($, true) }}>Yes, delete</Button>
            <Button key="rule:delete-no" plain onPress={() => set(d => ({ ...d, confirmDelete: false }))}>No</Button>
          </Box>
        : <Box flexDirection="row" flexWrap="wrap" gap={2}>
            {!draft.busy && hasCondition && <Button key="rule:save" variant="primary" onPress={() => { void writeRule($, false) }}>Save</Button>}
            {!draft.busy && draft.n !== null && <Button key="rule:delete" plain onPress={() => set(d => ({ ...d, confirmDelete: true }))}>Delete</Button>}
            <Button key="rule:cancel" plain onPress={() => { void closeForm($) }}>Cancel</Button>
          </Box>}
    </Box>
  )
}
