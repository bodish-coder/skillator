export type Box = ' ' | '~' | '!' | '?' | '>' | 'x' | '-'
export type Ticket = {
  id: string; box: Box; title: string; line: string      // line = exact text after "- [b] "
  parent: string | null; indent: number; section: string // heading it sits under
  apps: string[]; decide: string | null; owner: string | null; by: string[]
  session: string | null                                 // "(@cc-4ae496)" tag, without parens
}
export type Board = { path: string; mtimeMs: number; size: number; tickets: Ticket[]; error: string | null }
export type Member = { handle: string; emails: string[]; name?: string }   // name: the `  name:` line under it
export type Filter = { app: string | null; who: string | null; mine: boolean; showDone: boolean }
export type Lock = { path: string; ageMin: number; holder: string }
export type Machine = { at: number; drive: string; diskFree: number | null; diskTotal: number | null;
                        memFree: number | null; locks: Lock[]; hold: string | null }   // bytes
export type Window = { pct: number; resetsAt: string | null; source: 'host' | 'watch-cortana'; at: number }
export type Usage = { five: Window | null; seven: Window | null; spendLimitPct: number | null;
                      costUsd: number | null; decision: string | null }   // decision = relay `chain decide` line
export type Level = 'green' | 'amber' | 'red'
export type Watch = { level: Level; reasons: string[] }
export type Stage = { n: number; code: string; ticket: string; title: string; after: string; files: string; state: string }
export type RunView = { id: string; title: string; done: number; total: number; owner: string | null;
                        stages: Stage[]; planned: boolean     // planned = chain planned, nothing dispatched
                        decisions: string[] }                 // F50: parked `## Decisions` still unanswered, "Q1 F49 <question> - <what> waits on it"
export type AssignDraft = { id: string; kind: 'owner' | 'decide'; handle: string | null; result: string | null }
// F47 team management (T6): the Team view in the Tickets tab, and the Add person form
// (drawn in the ops-assign dialog; `back` = where a finished add returns).
export type TeamView = { selected: string | null; confirm: boolean }
export type PersonDraft = { handle: string; name: string; emails: string; result: string | null; back: 'assign' | 'team' }
declare module 'claude-code' {
  interface PluginState {
    'ops-board': {
      board: Board | null; team: Member[]; me: string | null
      tab: 'tickets' | 'runs' | 'health'; selected: string | null; expanded: string | null
      filter: Filter; filterOpen: boolean
      machine: Machine | null; usage: Usage | null; watch: Watch; notes: string[]
      runs: RunView[]; assign: AssignDraft | null; narrow: boolean
      relay: string | null   // F48 band: "RUN-0012 2/4", the first relay run not all done
      teamView: TeamView | null; person: PersonDraft | null
    }
  }
}
