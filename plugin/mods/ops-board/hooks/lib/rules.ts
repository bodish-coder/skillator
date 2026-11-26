import type { Priority, Rule, RulesPreview } from '../../types'
import { PRIORITY_FILTERS } from './board'

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
  if (!count || !levels || Number.parseInt(count, 10) !== changes.length || (changes.length > 0 && !token)) return null
  return { token, count, levels, changes }
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
