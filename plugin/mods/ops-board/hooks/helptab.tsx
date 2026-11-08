import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, RenderInput, TextProps } from 'claude-code'
import { SKILLS, filteredSkills } from '../ops/state'
import { copyHost, readSkillDocHost } from './lib/host'
import { cutTo, UNI } from './lib/ticketsmodel'

// F160 / A198: the Help tab in the Claude Code native pane - skill catalog, filter,
// synopsis, bounded SKILL.md viewer, clipboard copy, and direct session invocation.

const actionFocusA = atom({ plugin: 'ops-board', key: 'actionFocus' } as const, null)
const helpSelA = atom({ plugin: 'ops-board', key: 'helpSel' } as const, SKILLS[0]!.id)
const helpFilterA = atom({ plugin: 'ops-board', key: 'helpFilter' } as const, '')
const helpArgsA = atom({ plugin: 'ops-board', key: 'helpArgs' } as const, '')
const helpExpandedA = atom({ plugin: 'ops-board', key: 'helpExpanded' } as const, false)
const helpDocA = atom({ plugin: 'ops-board', key: 'helpDoc' } as const, null)

const PANE = 'ops-board'

type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  canType?: boolean
}

const cut = (s: string, room: number) => cutTo(s, room, UNI.cut)

export const isHelpItem = (el: string): boolean => el.startsWith('help:skill:')

export async function loadSkillDoc($: EngineInterface, skillId: string): Promise<void> {
  const res = await readSkillDocHost($, skillId)
  await update($, helpDocA, () => ({
    id: skillId,
    content: res.code === 0 ? res.out : null,
    error: res.code === 0 ? null : res.err || `exit ${res.code}`,
    path: res.path,
  }))
}

export async function enterHelp($: EngineInterface): Promise<void> {
  await update($, actionFocusA, () => null)
  const sel = (await read($, helpSelA)) || SKILLS[0]!.id
  await loadSkillDoc($, sel)
}

export async function focusHelp($: EngineInterface, el: string): Promise<void> {
  if (!isHelpItem(el)) return
  const id = el.slice('help:skill:'.length)
  if (!id) return
  const cur = await read($, helpSelA)
  if (cur !== id) {
    await update($, helpSelA, () => id)
    await loadSkillDoc($, id)
  }
}

export async function arrowHelp($: EngineInterface, by: number): Promise<boolean> {
  if (await read($, helpExpandedA)) return false
  const filter = await read($, helpFilterA)
  const skills = filteredSkills(filter)
  if (!skills.length) return true
  const rawSel = await read($, helpSelA)
  const at = skills.findIndex(x => x.id === rawSel)
  const idx = Math.max(0, Math.min(skills.length - 1, (at < 0 ? 0 : at) + by))
  const to = skills[idx]
  if (to && to.id !== rawSel) {
    await update($, helpSelA, () => to.id)
    void $.ui.focus({ requestId: PANE, key: `help:skill:${to.id}` }).catch(() => {})
    void loadSkillDoc($, to.id).catch(() => {})
  }
  return true
}

async function runSkill($: EngineInterface, skillId: string, rawArgs?: string): Promise<void> {
  const curArgs = (rawArgs ?? (await read($, helpArgsA))).trim()
  const cmd = `/skillator:${skillId}${curArgs ? ' ' + curArgs : ''}`
  try {
    await $.command.run({ command: `skillator:${skillId}`, ...(curArgs ? { args: curArgs } : {}) })
    $.ui.toast(`✓ Sent to session: ${cmd}`)
  } catch {
    try {
      await $.prompt.submit({ text: cmd })
      $.ui.toast(`✓ Sent to session: ${cmd}`)
    } catch {
      const r = await copyHost($, cmd)
      if (r.code === 0) $.ui.toast(`✓ Ready to run: ${cmd} (copied to clipboard — paste into your CLI)`)
      else $.ui.toast(`Paste into your CLI to run: ${cmd}`)
    }
  }
}

export async function HelpTab($: EngineInterface, e: RenderInput<'Pane'>, els: Els, cols: number): Promise<RenderElement[]> {
  const { Box, Text, Button } = els
  const t = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' && 'Input' in t ? t.Input : null

  const focus = await read($, actionFocusA)
  const armed = focus !== 'help:filter' && focus !== 'help:args'
  const filter = await read($, helpFilterA)
  const skills = filteredSkills(filter)
  const rawSel = await read($, helpSelA)
  const sel = skills.some(x => x.id === rawSel) ? rawSel : (skills[0]?.id ?? SKILLS[0]!.id)
  const expanded = await read($, helpExpandedA)
  const args = await read($, helpArgsA)
  const doc = await read($, helpDocA)
  const sk = skills.find(x => x.id === sel) ?? SKILLS.find(x => x.id === sel) ?? SKILLS[0]!

  const setFilter = (v: string) => {
    void (async () => {
      await update($, helpFilterA, () => v)
      const nextSkills = filteredSkills(v)
      const curSel = await read($, helpSelA)
      if (nextSkills.length && !nextSkills.some(x => x.id === curSel)) {
        const nextId = nextSkills[0]!.id
        await update($, helpSelA, () => nextId)
        await loadSkillDoc($, nextId)
      }
    })()
  }

  const out: RenderElement[] = []

  out.push(
    <Box key="help:header" flexDirection="row" flexWrap="wrap" gap={2}>
      <Text bold>{`Help & Skills Guide (${skills.length} skills)`}</Text>
      {Input && (
        <Input
          key="help:filter"
          label="Filter "
          placeholder="Filter skills..."
          value={filter}
          onInput={(v: string) => { setFilter(v) }}
          onSubmit={(v: string) => { setFilter(v) }}
        />
      )}
    </Box>,
  )

  out.push(
    <Box key="help:actions" flexDirection="row" flexWrap="wrap" gap={2}>
      <Button
        key="help:run"
        plain
        hotkey={armed ? 'r' : undefined}
        onPress={() => { void runSkill($, sk.id) }}
      >
        {`Run /skillator:${sk.id}`}
      </Button>
      {Input && (
        <Input
          key="help:args"
          label="Args "
          placeholder="Optional args (e.g. F12)"
          value={args}
          onInput={(v: string) => { void update($, helpArgsA, () => v) }}
          onSubmit={(v: string) => {
            void (async () => {
              await update($, helpArgsA, () => v)
              await runSkill($, sk.id, v)
            })()
          }}
        />
      )}
      <Button
        key="help:copy"
        plain
        hotkey={armed ? 'c' : undefined}
        onPress={() => {
          void (async () => {
            const refText = `skillator:${sk.id}`
            const r = await copyHost($, refText)
            if (r.code === 0) $.ui.toast(`✓ Copied reference: ${refText}`)
            else $.ui.toast(`✗ Copy failed: ${r.err || 'clipboard unavailable'} (reference: ${refText})`)
          })()
        }}
      >
        Copy reference
      </Button>
      <Button
        key="help:toggle-doc"
        plain
        hotkey={armed ? 'd' : undefined}
        onPress={() => {
          void (async () => {
            const next = !(await read($, helpExpandedA))
            await update($, helpExpandedA, () => next)
            if (next) await loadSkillDoc($, sk.id)
          })()
        }}
      >
        {expanded ? 'Hide SKILL.md' : 'View SKILL.md'}
      </Button>
    </Box>,
  )

  out.push(
    <Box key="help:synopsis" flexDirection="column">
      <Text bold color="suggestion">{`${sk.id} [${sk.category}]${sk.aliases.length ? ` (aliases: ${sk.aliases.join(', ')})` : ''}`}</Text>
      <Text>{cut(sk.summary, cols - 2)}</Text>
      <Text dimColor>{`Triggers: ${sk.triggers.join(' · ')}`}</Text>
      <Text dimColor>{`Examples: ${sk.examples.join('  ')}`}</Text>
    </Box>,
  )

  if (expanded) {
    const content = doc?.id === sk.id ? doc.content : null
    const err = doc?.id === sk.id ? doc.error : null
    out.push(
      <Box key="help:doc" flexDirection="column">
        <Text bold dimColor>{`─── Installed SKILL.md (${doc?.path ?? `${sk.id}/SKILL.md`}) ───`}</Text>
        {err ? (
          <Text color="warning">{`SKILL.md unavailable: ${err}`}</Text>
        ) : content ? (
          content.split('\n').slice(0, 80).map((line, i) => <Text key={`doc:${i}`}>{cut(line, cols - 2)}</Text>)
        ) : (
          <Text dimColor>Loading SKILL.md...</Text>
        )}
      </Box>,
    )
  } else {
    out.push(
      <Box key="help:list" flexDirection="column">
        {skills.map(item => {
          const isSel = item.id === sk.id
          return (
            <Button
              key={`help:skill:${item.id}`}
              plain
              hotkey={isSel && armed ? 'o' : undefined}
              onPress={() => {
                void (async () => {
                  if (item.id === sk.id) {
                    const next = !(await read($, helpExpandedA))
                    await update($, helpExpandedA, () => next)
                    if (next) await loadSkillDoc($, item.id)
                  } else {
                    await update($, helpSelA, () => item.id)
                    await loadSkillDoc($, item.id)
                  }
                })()
              }}
            >
              <Text inverse={isSel} bold={isSel}>
                {cut(`${isSel ? '› ' : '  '}${item.id.padEnd(18)} [${item.category}] ${item.summary}`, cols - 2 - (isSel && armed ? 3 : 0))}
              </Text>
            </Button>
          )
        })}
      </Box>,
    )
  }

  return out
}
