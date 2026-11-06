import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, RenderInput, TextProps } from 'claude-code'
import { SKILLS, filteredSkills } from '../ops/state'
import { copyHost, readSkillDocHost } from './lib/host'
import { cutTo, UNI } from './lib/ticketsmodel'

// F160 / A198: the Help tab in the Claude Code native pane - skill catalog, filter,
// synopsis, bounded SKILL.md viewer, clipboard copy, and direct session invocation.

const helpSelA = atom({ plugin: 'ops-board', key: 'helpSel' } as const, SKILLS[0]!.id)
const helpFilterA = atom({ plugin: 'ops-board', key: 'helpFilter' } as const, '')
const helpArgsA = atom({ plugin: 'ops-board', key: 'helpArgs' } as const, '')
const helpExpandedA = atom({ plugin: 'ops-board', key: 'helpExpanded' } as const, false)
const helpDocA = atom({ plugin: 'ops-board', key: 'helpDoc' } as const, null)

type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  canType?: boolean
}

const cut = (s: string, room: number) => cutTo(s, room, UNI.cut)

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
  const sel = (await read($, helpSelA)) || SKILLS[0]!.id
  await loadSkillDoc($, sel)
}

export async function HelpTab($: EngineInterface, e: RenderInput<'Pane'>, els: Els, cols: number): Promise<RenderElement[]> {
  const { Box, Text, Button } = els
  const t = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' && 'Input' in t ? t.Input : null

  const filter = await read($, helpFilterA)
  const skills = filteredSkills(filter)
  const rawSel = await read($, helpSelA)
  const sel = skills.some(x => x.id === rawSel) ? rawSel : (skills[0]?.id ?? SKILLS[0]!.id)
  const expanded = await read($, helpExpandedA)
  const args = await read($, helpArgsA)
  const doc = await read($, helpDocA)
  const sk = skills.find(x => x.id === sel) ?? SKILLS.find(x => x.id === sel) ?? SKILLS[0]!

  const out: RenderElement[] = []

  out.push(
    <Box key="help:header" flexDirection="row" flexWrap="wrap" gap={2}>
      <Text bold>{`Help & Skills Guide (${skills.length} skills)`}</Text>
      {Input && (
        <Input
          key="help:filter"
          placeholder="Filter skills..."
          value={filter}
          onChange={(v: string) => { void update($, helpFilterA, () => v) }}
        />
      )}
    </Box>,
  )

  out.push(
    <Box key="help:actions" flexDirection="row" flexWrap="wrap" gap={2}>
      <Button
        key="help:run"
        variant="primary"
        hotkey="r"
        onPress={() => {
          void (async () => {
            const curArgs = (await read($, helpArgsA)).trim()
            const cmd = `/skillator:${sk.id}${curArgs ? ' ' + curArgs : ''}`
            void $.prompt.submit({ text: cmd })
            $.ui.toast(`✓ Sent to session: ${cmd}`)
          })()
        }}
      >
        {`Run /skillator:${sk.id}`}
      </Button>
      {Input && (
        <Input
          key="help:args"
          placeholder="Optional args (e.g. F12)"
          value={args}
          onChange={(v: string) => { void update($, helpArgsA, () => v) }}
        />
      )}
      <Button
        key="help:copy"
        hotkey="c"
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
        hotkey="d"
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
              onPress={() => {
                void (async () => {
                  await update($, helpSelA, () => item.id)
                  await loadSkillDoc($, item.id)
                })()
              }}
            >
              <Text inverse={isSel} bold={isSel}>
                {cut(`${isSel ? '› ' : '  '}${item.id.padEnd(18)} [${item.category}] ${item.summary}`, cols - 2)}
              </Text>
            </Button>
          )
        })}
      </Box>,
    )
  }

  return out
}
