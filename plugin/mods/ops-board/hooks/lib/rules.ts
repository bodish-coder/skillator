import type { Box, Priority, Rule, RulesPreview, Ticket } from '../../types'
import { PRIORITY_FILTERS, isOpen } from './board'

// F203: the queue-jarvis `rules` output, read by the pane and the standalone TUI. Pure.
// Rule and RulesPreview are declared in types/index.d.ts (the self-contained types contract).
export type { Rule, RulesPreview }
export type RulesList = { rules: Rule[]; invalid: string[]; revision: string }

export function parseRulesList(out: string): RulesList | null {
  const lines = out.split(/\r?\n/)
  const count = lines.map(line => /^(\d+) rule\(s\)\.$/.exec(line)?.[1]).find(Boolean)
  const revision = lines.map(line => /^Rules revision: ([a-f0-9]{64})$/.exec(line)?.[1]).find(Boolean)
  const rules = lines.flatMap((line): Rule[] => {
    const match = /^(\d+)  (P[1-5]): (.+)$/.exec(line)
    if (!match) return []
    const conditions = match[3]!.split(/ +(?=[a-z-]+=)/).map((part): [string, string[]] => {
      const at = part.indexOf('=')
      return [part.slice(0, at), part.slice(at + 1).split(',')]
    })
    return [{ n: Number(match[1]), level: match[2] as Priority, conditions }]
  })
  if (count === undefined || !revision || Number(count) !== rules.length) return null
  return { rules, invalid: lines.filter(line => /^Invalid line \d+: /.test(line)), revision }
}

const CHANGE = /^[A-Z]{1,3}\d+[a-z]? +(?:Unranked|P[1-5]) +-> P[1-5] +rule \d+ +/
export function parseRulesPreview(out: string): RulesPreview | null {
  const lines = out.split(/\r?\n/)
  const count = lines.find(line => /^\d+ ticket\(s\) would change\.$/.test(line))
  const levels = lines.find(line => line.startsWith('P1: '))
  const token = lines.map(line => /^Preview token: ([a-f0-9]{64})$/.exec(line)?.[1]).find(Boolean) ?? null
  const changes = lines.filter(line => CHANGE.test(line)).map(line => line.replace(/ {2,}/g, ' '))
  const warning = lines.find(line => line.startsWith('Warning: '))
  if (!count || !levels || Number.parseInt(count, 10) !== changes.length || (changes.length > 0 && !token)) return null
  return { token, count, levels, changes, ...(warning ? { warning } : {}) }
}

// A253: the rule form's "Reads as" sentence and its live match line, both from the form's values.
const words = (values: string[]) => values.length > 1 ? values.slice(0, -1).join(', ') + ' or ' + values.at(-1) : values[0] ?? ''
export function ruleReads(level: Priority, values: Record<string, string[]>): string {
  const parts = PRIORITY_FILTERS.flatMap(({ key, label }) => values[key]?.length
    ? [(key === 'depends-on' ? 'depends on' : label[0]!.toLowerCase() + label.slice(1) + ' is') + ' ' + words(values[key]!)] : [])
  return parts.length ? level + ' when ' + parts.join(' and ') : level + ' - choose at least one field'
}
// The same match as queue-jarvis `rules preview`: open tickets unless a status is named; every
// chosen field matches when any of its values equals any comma part of the ticket's value.
const STATUS: Record<Box, string> = { ' ': 'pending', '~': 'in-progress', '!': 'blocked', '?': 'decide', '%': 'testing', v: 'verified', '>': 'deferred', x: 'done', '-': 'cancelled' }
const TYPE: Record<string, string> = { B: 'bug', F: 'feature', A: 'agent-found' }
function fieldOf(t: Ticket, key: string): string {
  if (key === 'id') return t.id
  if (key === 'status') return STATUS[t.box]
  if (key === 'type') return TYPE[/^[A-Z]+/.exec(t.id)?.[0] ?? ''] ?? ''
  // the last tag wins, as queue.mjs's new Map(tags) does
  return [...t.line.matchAll(new RegExp('\\[' + key + ':[ \\t]*([^\\]\\r\\n]*)\\]', 'gi'))].at(-1)?.[1] ?? ''
}
export function ruleMatchLine(tickets: readonly Ticket[], values: Record<string, string[]>): string {
  const chosen = Object.entries(values).filter(([, v]) => v.length)
  const ids = tickets.filter(t => (!!values.status?.length || isOpen(t)) && chosen.every(([key, v]) =>
    fieldOf(t, key).split(',').some(part => hasValue(v, part.trim())))).map(t => t.id)
  if (!ids.length) return 'Matches no ticket now'
  const shown = ids.slice(0, 8).join(' · ') + (ids.length > 8 ? ` · +${ids.length - 8} more` : '')
  return `Matches ${ids.length} ticket${ids.length > 1 ? 's' : ''} now: ${shown}`
}

export const ruleArgs = (level: Priority, values: Record<string, string[]>): string[] =>
  [level, ...PRIORITY_FILTERS.flatMap(({ key }) => (values[key]?.length ? [key + '=' + values[key]!.join(',')] : []))]
export const ruleSummary = (rule: Rule) => rule.conditions.map(([key, values]) => key + '=' + values.join(',')).join(' ')
// The same rule: level and conditions alike, in any order (a re-read list renumbers, so n is not compared).
const ruleKey = (rule: Rule) => JSON.stringify([rule.level, rule.conditions.map(([key, values]) => [key, [...values].sort()]).sort()])
export const sameRule = (a: Rule | null | undefined, b: Rule | null | undefined) => !!a && !!b && ruleKey(a) === ruleKey(b)
export const orderedRules = (rules: Rule[]) => [...rules].sort((a, b) => a.level.localeCompare(b.level) || a.n - b.n)
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
export const hasValue = (values: string[], value: string) => values.some(item => same(item, value))
export const toggleValue = (values: string[], value: string) =>
  hasValue(values, value) ? values.filter(item => !same(item, value)) : [...values, value]
export const ruleOptions = (observed: string[], chosen: string[]) =>
  [...observed, ...chosen.filter(value => !hasValue(observed, value))]
