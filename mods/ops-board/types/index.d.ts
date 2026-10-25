export type Box = ' ' | '~' | '%' | '!' | '?' | '>' | 'x' | '-'
export type Ticket = {
  id: string; box: Box; title: string; line: string      // line = exact text after "- [b] "
  parent: string | null; indent: number; section: string // heading it sits under
  apps: string[]; decide: string | null; owner: string | null; by: string[]
  session: string | null                                 // "(@cc-4ae496)" tag, without parens
}
export type Board = { path: string; mtimeMs: number; size: number; tickets: Ticket[]; error: string | null }
export type Member = { handle: string; emails: string[]; name?: string; lead?: true }   // name: the `  name:` line under it; lead: the `lead:` line names it
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
// F77: id = the form's Ticket field as typed ('' when opened with no ticket selected),
// resolved against the board case-insensitively (ticketById); ticket-meta gets the board's ID.
export type AssignDraft = { id: string; kind: 'owner' | 'decide'; handle: string | null; result: string | null }
// F47 team management (T6): the Team view in the Tickets tab, and the Add person form
// (drawn as a form in the ops-board pane; `back` = where a finished add returns).
export type TeamView = { selected: string | null; confirm: boolean }
export type PersonDraft = { handle: string; name: string; emails: string; result: string | null; back: 'assign' | 'team' }
// F81: one line of `ticket-meta reconcile` (to === from: kept, evidence unclear) and the
// form in the pane: the proposals and the ids picked to apply.
export type Proposal = { id: string; from: Box; to: Box; why: string }
export type Reconcile = { rows: Proposal[]; picked: string[] }
// F53: the Agents and Workflows tabs. Every field is one the engine reports (design F53, findings 1-5).
// The engine's AgentStatus (claude-code d.ts 566), repeated: this contract must be self-contained (no import).
export type AgentStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'
export type AgentKind = 'subagent' | 'teammate' | 'workflow'
export type AgentRow = {
  id: string                  // AgentInfo.id (d.ts 134) = AgentSpawnResult.agentId (435)
  kind: AgentKind             // agent.spawn workflow (360) / isTeammate (347); AgentInfo.teammateId (142) / type 'teammate' (154)
  name: string | null         // AgentInfo.name (183), else agent.spawn name (401)
  description: string         // AgentInfo.description (147) / agent.spawn description (284)
  type: string                // AgentInfo.type (154) / agent.spawn subagentType (293)
  model: string | null        // AgentSpawnResult.model (427); null when its spawn was not seen
  status: AgentStatus | null  // AgentInfo.status (163) while listed, else from its loop's events; null = dropped from the list, no end seen
  startedAt: number | null    // $.clock.now() as its agent.spawn settled; null when not seen
  lastAt: number | null       // its spawn, or the last turn.start (14068) / tool.call (203) / turn.complete (13974) carrying its id
  runId: string | null        // agent.spawn workflow.runId (367)
  listed: boolean             // in the last $.agent.list()
}
export type WorkflowRow = {
  key: string                 // runId, else 'call:' + the Workflow call's tool_use_id
  runId: string | null        // Workflow answer runId (22340) / agent.spawn workflow.runId (367)
  name: string | null         // Workflow answer workflowName (22338)
  remote: boolean             // Workflow answer taskType 'remote_agent' (22336) / status 'remote_launched' (22333)
  startedAt: number           // $.clock.now() when the run was first seen (its Workflow answer or first agent.spawn)
  error: string | null        // Workflow answer error (22351), or an errored call's text
  denied: number              // its agent() spawns that agent.spawn denied (454)
}
// F66: the Messages tab. Msg is one line of teams-uhura's inbox (<repo>/.git/skillator/
// team-inbox.jsonl); TeamsCfgView is what `team.mjs config show` says - never a secret.
export type Msg = { ts: string; from: string; email: string; text: string; id: string }
export type TeamsCfgView = { path: string; token: boolean; workflowUrl: string | null; port: number; statusPosts: boolean }
// The setup form in the pane: only what is safe to hold in $.state - the field values
// live in the module (the token never reaches $.state); `rev` redraws it.
export type SetupView = { rev: number; field: string; result: string | null; confirmClear: boolean }
// F79: the Run tab - .skillator/run.json's entries (written only by live-friday's run-entries),
// the file as read (missing: no file yet, the first open scans), the confirm / rename form, one job.
export type RunEntry = {
  id: string; name: string; kind: string; target: string; args: string[]
  command: string; cwd: string; source: string; missing: boolean
}
export type RunFile = { path: string; entries: RunEntry[]; error: string | null; missing?: boolean }
export type RunForm = { mode: 'confirm' | 'rename'; id: string; name: string; result: string | null }
// B4: only the tail of the output is held (OUT_MAX).
export type Job = {
  id: string; name: string; argv: string[]; cwd: string
  started: number; ended: number | null; code: number | null
  stopped: boolean; error: string | null; out: string
}
// F75: the Explorer tab (hooks/lib/explorer.ts) - the tree's rows of open folders and
// the changes of open commits only; `open` holds the open sections, folders and commits.
export type Commit = { sha: string; short: string; date: string; author: string; subject: string }
export type Change = { status: string; path: string; from: string | null; add: number | null; del: number | null }
export type TreeRow = { path: string; name: string; depth: number; dir: boolean; count: number }
export type Explorer = {
  open: string[]; selected: string | null
  files: number | null                  // tracked files; null: not read yet
  tree: TreeRow[]; treeMore: number     // the rows drawn (open folders only); rows past MAX_TREE
  commits: Commit[] | null
  changes: Record<string, { list: Change[]; more: number }>   // open commits only
  error: string | null
}
declare module 'claude-code' {
  interface PluginState {
    'ops-board': {
      board: Board | null; team: Member[]; me: string | null
      tab: 'tickets' | 'runs' | 'health' | 'messages' | 'agents' | 'explorer' | 'run'; selected: string | null; expanded: string | null
      filter: Filter; filterOpen: boolean
      openGroups: Box[]      // F61: the open groups' boxes this session; none = all collapsed
      runsOpen: ('runs' | 'workflows')[]   // F76: the Workflows tab's open sections this session
      machine: Machine | null; usage: Usage | null; watch: Watch; notes: string[]
      runs: RunView[]; assign: AssignDraft | null; narrow: boolean
      relay: string | null   // F48 band: "RUN-0012 2/4", the first relay run not all done
      teamView: TeamView | null; person: PersonDraft | null
      reconcile: Reconcile | null   // F81: the reconcile form up in the Tickets tab
      agents: AgentRow[]; workflows: WorkflowRow[]   // F53: the Agents and Workflows tabs
      // F66: the Messages tab - the inbox (newest MSG_MAX), the read marker's id, the
      // row picked / opened, the saved config's view, the setup form's safe part
      messages: Msg[]; msgRead: string | null; msgSelected: string | null; msgExpanded: string | null
      teamsCfg: TeamsCfgView | null; setup: SetupView | null
      // F79: the Run tab - .skillator/run.json as read, the confirm / rename form, the one job (its output's tail)
      runFile: RunFile | null; runForm: RunForm | null; runJob: Job | null
      explorer: Explorer     // F75: what the Explorer tab draws, no more (B4)
    }
  }
}
