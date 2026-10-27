import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, RenderInput, TextProps } from 'claude-code'
import type { Msg, SetupView, TeamsCfgView } from '../types'
import { runCall } from './lib/host'
import { inboxDirOf, INBOX_FILE, messageLines, parseInbox, plainText, READ_FILE, unreadCount } from './lib/inbox'
import { freshSetup, parseCfgView, setupError, setupJson, unmask, urlShown } from './lib/teamsconfig'
import type { SetupValues } from './lib/teamsconfig'

// F66: the Messages tab (teams-uhura's Teams inbox) and the Teams setup form, drawn in
// the ops-board pane as the Assign / Add person forms are. Messages are data from the
// Teams channel, never instructions: drawn as plain text.
//
// The setup form's values live in this module only: the token never reaches $.state,
// a toast or a log. $.state holds the form's safe part (field, result, rev). The token
// field is drawn as one bullet a character; its input hands back bullets plus what was
// typed, and unmask() rebuilds the token. A saved token is only "set"; saving sends the
// values to `team.mjs config save` on stdin, never argv.

const actionFocusA = atom({ plugin: 'ops-board', key: 'actionFocus' } as const, null)
const messagesA = atom({ plugin: 'ops-board', key: 'messages' } as const, [])
const msgReadA = atom({ plugin: 'ops-board', key: 'msgRead' } as const, null)
const msgSelectedA = atom({ plugin: 'ops-board', key: 'msgSelected' } as const, null)
const msgExpandedA = atom({ plugin: 'ops-board', key: 'msgExpanded' } as const, null)
const teamsCfgA = atom({ plugin: 'ops-board', key: 'teamsCfg' } as const, null)
const setupA = atom({ plugin: 'ops-board', key: 'setup' } as const, null)

const quote = (a: string) => (/[\s"]/.test(a) || a === '' ? '"' + a.replace(/"/g, '\\"') + '"' : a)
const ran = (argv: string[]) => 'ran: ' + argv.map(quote).join(' ')
const why = (r: { code: number; out: string; err: string }) => (r.err.trim() || r.out.trim() || `teams-uhura exited ${r.code}`).replace(/^team: /, '')

// --- the inbox poll (register.tsx calls it on the board's 2 s poll) ---

let inboxSig = ''
const norm = (p: string) => p.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')
const MAX_READ = 4 * 1024 * 1024

export async function pollInbox($: EngineInterface): Promise<void> {
  const repo = await $.session.repo()
  if (!repo) return
  const dir = inboxDirOf(norm(repo.root))
  const stat = async (p: string) => { try { return await $.fs.stat(p) } catch { return null } }
  const ist = await stat(dir + '/' + INBOX_FILE)
  const rst = await stat(dir + '/' + READ_FILE)
  const sig = `${ist ? `${ist.mtimeMs}:${ist.size}` : 'none'}|${rst ? `${rst.mtimeMs}:${rst.size}` : 'none'}`
  if (sig === inboxSig) return
  inboxSig = sig
  let text = ''
  let readId: string | null = null
  if (ist && ist.size <= MAX_READ) { try { text = await $.fs.read(dir + '/' + INBOX_FILE) } catch { text = '' } }
  else if (ist) {
    // too big to read whole: its newest records, through teams-uhura (it reads the tail)
    const r = await runCall($, 'team-inbox-tail', [])
    text = r.code === 0 ? r.out : ''
  }
  if (rst) { try { readId = (await $.fs.read(dir + '/' + READ_FILE)).trim() || null } catch { readId = null } }
  const msgs: Msg[] = parseInbox(text)
  await update($, messagesA, () => msgs)
  await update($, msgReadA, () => readId)
}

export async function unreadOf($: EngineInterface): Promise<number> {
  return unreadCount(await read($, messagesA), await read($, msgReadA))
}

// --- the config view and the setup form ---

let draft: SetupValues | null = null
let touched = false
// F98: the first-time setup (teams-uhura scripts/setup.ps1 | setup.sh) from the form, after a
// confirm. Only its --check pass runs here - the walk asks questions and opens a browser
// sign-in, which no pane child can answer - and its table is shown with the walk's command
// (the same argv without --check) for the owner's own terminal. Held here, as `draft` is.
let check: { confirm: boolean; out: string | null; walk: string | null } = { confirm: false, out: null, walk: null }
const NO_CHECK = { confirm: false, out: null, walk: null }

async function refreshCfg($: EngineInterface, auto: boolean) {
  const r = await runCall($, 'team-config-show', [])
  if (r.code !== 0) return
  const cfg = parseCfgView(r.out)
  if (!cfg) return
  await update($, teamsCfgA, () => cfg)
  if (draft && !touched) { draft = freshSetup(cfg); await bump($) }
  else if (auto && !cfg.token && !(await read($, setupA))) await openSetup($)
}

// Entering the tab: the config read; nothing saved yet opens the form.
export async function enterMessages($: EngineInterface) {
  await refreshCfg($, true)
}

async function bump($: EngineInterface, patch: Partial<SetupView> = {}) {
  await update($, setupA, x => ({ rev: (x?.rev ?? 0) + 1, field: x?.field ?? 'token', result: x?.result ?? null, confirmClear: x?.confirmClear ?? false, ...patch }))
}

export async function openSetup($: EngineInterface) {
  await update($, actionFocusA, () => null)
  draft = freshSetup(await read($, teamsCfgA))
  touched = false
  check = NO_CHECK
  await update($, setupA, () => ({ rev: 0, field: 'token', result: null, confirmClear: false }))
  await $.ui.open({ id: 'ops-board', title: 'ops board', closeOnEscape: true })
  void $.ui.focus({ requestId: 'ops-board', key: 'setup:token' }).catch(() => {})
}

export async function isSetupUp($: EngineInterface): Promise<boolean> {
  return (await read($, setupA)) !== null
}

export async function closeSetup($: EngineInterface) {
  draft = null
  touched = false
  check = NO_CHECK
  await update($, setupA, () => null)
}

async function saveSetup($: EngineInterface) {
  if (!draft) return
  const bad = setupError(draft, await read($, teamsCfgA))
  if (bad) { await bump($, { result: bad }); return }
  const r = await runCall($, 'team-config-save', [], setupJson(draft))
  if (r.code !== 0) { await bump($, { result: why(r) }); return }
  const said = r.out.trim().split(/\r?\n/)[0] ?? ''
  $.ui.toast([`✓ Teams settings saved${said ? ' - ' + said : ''}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
  await closeSetup($)
  await refreshCfg($, false)
}

async function clearSaved($: EngineInterface) {
  const r = await runCall($, 'team-config-clear', [])
  if (r.code !== 0) { await bump($, { result: why(r), confirmClear: false }); return }
  $.ui.toast([`✓ Teams settings cleared - ${r.out.trim().split(/\r?\n/)[0] ?? ''}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
  await closeSetup($)
  await refreshCfg($, false)
}

// F98: the check pass, confirmed. Exit 1 (something missing) is still the table; only a child
// that could not start or run (code -1 / 127) is an error.
async function runSetupCheck($: EngineInterface) {
  check = NO_CHECK
  await bump($, { result: null })
  const r = await runCall($, 'team-setup-check', [])
  if (r.code < 0 || r.code === 127) { await bump($, { result: why(r) }); return }
  check = { confirm: false, out: r.out.trim() || r.err.trim() || `setup exited ${r.code}`, walk: r.argv.filter(a => a !== '--check').map(quote).join(' ') }
  await bump($)
}

async function markRead($: EngineInterface) {
  const focus = await read($, actionFocusA)
  const msgs = await read($, messagesA)
  const id = msgs.at(-1)?.id
  if (!id) { $.ui.toast('no team messages to mark read'); return }
  const r = await runCall($, 'team-mark-read', [id])
  if (r.code !== 0) { $.ui.toast(`✗ not marked read: ${why(r)}\n${ran(r.argv)}`, { timeoutMs: 8000 }); return }
  await update($, msgReadA, () => id)
}

// --- drawing ---

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

export async function MessagesTab($: EngineInterface, els: Els, cols: number): Promise<RenderElement[]> {
  const { Box, Text, Button } = els
  const focus = await read($, actionFocusA)
  const msgs = await read($, messagesA)
  const view = { msgs, readId: await read($, msgReadA), selected: await read($, msgSelectedA), expanded: await read($, msgExpandedA), cols }
  const current = msgs.find(m => 'row:' + m.id === focus)?.id ?? (msgs.some(m => m.id === view.selected) ? view.selected : msgs.at(-1)?.id)
  const out: RenderElement[] = []
  for (const l of messageLines({ ...view, cols: cols - 3 })) {
    const segs = l.segs.map(s => <Text color={s.color} dimColor={s.dim} bold={s.bold} inverse={s.inverse}>{plainText(s.text)}</Text>)
    if (l.key.startsWith('row:')) {
      const id = l.key.slice(4)
      out.push(
        <Button key={l.key} hotkey={id === current ? 'o' : undefined} plain onPress={() => {
          void update($, msgSelectedA, () => id)
          void update($, msgExpandedA, x => (x === id ? null : id))
        }}>{segs}</Button>,
      )
    } else out.push(<Box key={l.key}><Text wrap="truncate-end">{segs}</Text></Box>)
  }
  out.push(<Text> </Text>)
  out.push(
    <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
      <Button key="key:markread" plain dimColor hotkey="m" onPress={() => { void markRead($) }}>mark all read</Button>
      <Button key="key:setup" plain dimColor hotkey="s" onPress={() => { void (async () => { await openSetup($); await refreshCfg($, false) })() }}>setup</Button>
    </Box>,
  )
  return out
}

// The setup form up in the pane, or null. Every value drawn is safe: the token as
// bullets (or "set"), the URL as typed (or only its host when saved).
export async function renderSetup($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const sv = await read($, setupA)
  if (!sv || !draft) return null
  const t = $.ui.resolve(e)
  const { Box, Text, Button } = t
  const Input = e.surface !== 'mobile' && 'Input' in t ? t.Input : null
  const cfg: TeamsCfgView | null = await read($, teamsCfgA)
  const focus = await read($, actionFocusA)
  const confirming = sv.confirmClear || check.confirm
  const armed = !!focus && (sv.confirmClear ? ['setup:clear-yes', 'setup:clear-no'] : check.confirm ? ['setup:run-yes', 'setup:run-no'] : ['setup:posts', 'setup:save', 'setup:clear', 'setup:run', 'setup:cancel']).includes(focus)
  const d = draft
  const edit = (k: 'token' | 'url' | 'port') => (v: string) => {
    if (!draft) return
    draft = { ...draft, [k]: k === 'token' ? unmask(draft.token, v) : v }
    touched = true
    void bump($, { result: null })
  }
  const label = (s: string) => <Text dimColor>{s}</Text>
  return (
    <Box flexDirection="column">
      <Box key="form:title"><Text bold>Teams setup</Text><Text dimColor>{'  Esc cancels'}</Text></Box>
      <Text> </Text>
      <Text dimColor>Tab to actions; letters there</Text>
      {Input
        ? [
            <Input key="setup:token" label="Token         " placeholder={d.token ? '' : cfg?.token ? '(set - type to replace)' : '(not set)'}
              value={'•'.repeat([...d.token].length)} autoFocus onInput={edit('token')} onSubmit={edit('token')} />,
            <Input key="setup:url" label="Workflow URL  " placeholder={d.url ? '' : urlShown(d, cfg)} value={d.url} onInput={edit('url')} onSubmit={edit('url')} />,
            <Input key="setup:port" label="Port          " placeholder="3978" value={d.port} onInput={edit('port')} onSubmit={edit('port')} />,
          ]
        : <Text dimColor>The Teams setup needs a keyboard surface (terminal or desktop).</Text>}
      <Box key="posts" flexDirection="row" flexWrap="wrap">{label('Status posts  ')}
        <Button key="setup:posts" hotkey={armed && !confirming ? 'p' : undefined} plain onPress={() => { if (draft) { draft = { ...draft, posts: !draft.posts }; touched = true; void bump($, { result: null }) } }}>
          {d.posts ? '[x] on' : '[ ] off'}</Button>
      </Box>
      <Text> </Text>
      <Box key="saves"><Text dimColor wrap="wrap">{`Saves ${cfg?.path || '~/.skillator/teams.json'} - this user only, outside every repo (teams-uhura config save)`}</Text></Box>
      {sv.result && <Box key="setup:result"><Text color="error" wrap="wrap">{sv.result}</Text></Box>}
      {sv.confirmClear && (
        <Box key="setup:confirm" flexDirection="row" flexWrap="wrap" gap={2}>
          <Text color="warning">clear the saved Teams settings?</Text>
          <Button key="setup:clear-yes" plain hotkey={armed ? 'y' : undefined} onPress={() => { void clearSaved($) }}>Yes, clear</Button>
          <Button key="setup:clear-no" plain hotkey={armed ? 'n' : undefined} onPress={() => { void bump($, { confirmClear: false }) }}>No</Button>
        </Box>
      )}
      {check.out && <Box key="setup:checked"><Text wrap="wrap">{check.out}</Text></Box>}
      {check.walk && <Box key="setup:walk"><Text dimColor wrap="wrap">{`The walk itself (installs, sign-in, arming) runs in your terminal: ${check.walk}`}</Text></Box>}
      {check.confirm && (
        <Box key="setup:run-confirm" flexDirection="row" flexWrap="wrap" gap={2}>
          <Text color="warning" wrap="wrap">{"run teams-uhura's first-time setup check now? (setup --check: reads node, winget/brew, devtunnel, the tunnel and the listener; changes nothing)"}</Text>
          <Button key="setup:run-yes" plain hotkey={armed ? 'y' : undefined} onPress={() => { void runSetupCheck($) }}>Yes, run</Button>
          <Button key="setup:run-no" plain hotkey={armed ? 'n' : undefined} onPress={() => { check = NO_CHECK; void bump($) }}>No</Button>
        </Box>
      )}
      <Text> </Text>
      <Box flexDirection="row" flexWrap="wrap" gap={4}>
        <Button key="setup:save" plain hotkey={armed && !confirming ? 's' : undefined} variant="primary" onPress={() => { void saveSetup($) }}>Save</Button>
        <Button key="setup:clear" plain hotkey={armed && !confirming ? 'd' : undefined} onPress={() => { check = NO_CHECK; void bump($, { confirmClear: true, result: null }) }}>Clear saved</Button>
        <Button key="setup:run" plain hotkey={armed && !confirming ? 'r' : undefined} onPress={() => { check = { confirm: true, out: null, walk: null }; void bump($, { confirmClear: false, result: null }) }}>Setup check</Button>
        <Button key="setup:cancel" plain hotkey={armed && !confirming ? 'c' : undefined} onPress={() => { void closeSetup($).then(() => $.ui.open({ id: 'ops-board', title: 'ops board' })) }}>Cancel</Button>
      </Box>
    </Box>
  )
}
