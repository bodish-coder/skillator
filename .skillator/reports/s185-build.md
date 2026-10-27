# RUN-0023 stage 185 / B15: no reproduction, no fix

Outcome: **STOP — B15 could not be reproduced from the installed API contract and current source.** No production change, staged change, or commit. The stage worktree remains at `90a30c081697b5cd42b78a1ccbcb5b50e5f196f1` on `run/RUN-0023-pending-f100-f104-s185`; F111 and B16 were preserved.

## Verified evidence

- `plugin/mods/ops-board/hooks/register.tsx:518-522` listens to **agent.spawn**, not PostToolUse. It awaits `next(e)`, calls `noteSpawn`, and returns the original result. `:379-382` polls every five seconds while tab `runs` is shown; `:473` polls on the command entry path. Agent tool results are not inspected by `tool.call` (`:538`), but this alone is not a defect: the API expressly states Agent invokes the spawn event.
- Installed host types `C:/tools/Projects/skillator2/plugin/mods/ops-board/.claude-plugin/types/claude-code/index.d.ts:3251-3256` say Agent starts the same `agent.spawn` event, resolving `{ model, agentId }` when started. `:412-435` says this id is shared by the loop and list. `:379-392` describes resume with the same id. Thus `agentstab.tsx:39` (`r.agentId ?? e.resume?.agentId`) accepts the documented background/resume result; it does not require agent output.
- Types `:3263-3270` explicitly include the session's model- and plugin-spawned subagents and teammates in `$.agent.list()`, until task eviction. Workflow agents are excluded and are covered by spawn events. This is verified **contract**, not an observation of the affected live process.
- `BuiltinToolResults.Agent` contains `status: 'async_launched'`, `agentId`, description/prompt/outputFile at `:17648-17661`. The installed Agent input schema at `:16706-16725` no longer exposes `run_in_background`; `AgentSpawnInput.background` remains at `:328-335`. SendMessage addresses background ids (`:17410-17416`), but its tool result is `unknown` (`:22093`). No fabricated SendMessage-result lifecycle inference was added.
- `hooks/lib/agents.ts:80` classifies kind without filtering. `listed` (`:84-98`) adds every supplied id and retains omitted rows; completed omitted rows retain completed status (`:88`). `capAgents` (`:25-34`) applies only beyond 200 rows. `agentOrder` (`:101`) sorts without dropping rows. None explains three missing agents.
- `hooks/pane.tsx:219-233` always iterates Runs, Workflows, Agents, rendering the Agents body whenever its section is open, including when relay runs are present. This is source-verified. A new combined relay-render fixture was not successfully executed: the test host refuses direct test-module state access. Existing full-suite run/pane tests passed.
- Installed `skillator@skillator` is 4.19.0 at `C:/Users/Ikran/.claude-bodish/plugins/cache/skillator/skillator/4.19.0`, commit `c391439199038a7ae598f59b9a5e58d4b41b6461`; its separately installed ops-board is 0.9.0 at the sibling `ops-board/0.9.0` path. Installed `hooks/agentstab.tsx` and `hooks/lib/agents.ts` are byte-identical to the stage. Register differs in unrelated session/ascii/explorer changes, not agent hooks/polling. Pane differs in F111 and other features; RunsAndWorkflows differs in finished-run count/status handling (F99), while the Agents iteration and rendering remain present in both.
- CodeGraph was queried first from the indexed main repo; it did not map these ops-board symbols. The stage has no .codegraph, so source reads and git grep established the caller set (agentstab, agents, register, pane).

## Executed checks

Full command: `claude plugin test C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104.s185/plugin/mods/ops-board`, using `C:/Users/Ikran/.local/bin/claude.exe` **2.1.311** and Git Unix paths first in PATH.

Final outcome: **389 pass, 0 fail, 20 files, 43.83s; exit 0**. The original 387 tests and two additional attempted reproduction cases passed. Both added cases launch three background agents, assert visible rows, complete one, poll completed status, drop that completed agent from the list, confirm its row survives, then resume the same id and confirm running status with no duplicate row. Both terminal and desktop pass on unchanged production code.

Saved output: `s185-contract.stdout.log`, `s185-contract.stderr.log`, `s185-contract.exit.json`. The exact successful test is preserved as `s185-agents-b15.test.tsx.txt`; place it at `plugin/mods/ops-board/tests/agents-b15.test.tsx` to rerun. It was removed from the worktree after the no-repro decision.

TypeScript: cached compiler `C:/Users/Ikran/AppData/Local/npm-cache/_npx/6bc7bae5c2059953/node_modules/typescript/bin/tsc -p C:/tools/Projects/skillator2/.skillator/reports/s185-tsconfig.json` **exit 0, no output**. Config matches the project's compiler options and includes stage hooks/types/tests with main installed host types. `s185-tsc.stdout.log`, `s185-tsc.stderr.log`, `s185-tsc.exit.json` persist the result. The compiler required escalation for cache read access.

There is **no B15 red/green fix result**. Earlier reproduction attempts failed only in fixture setup (test Engine has no state, duplicate session.start registration, then host state-access scanning); those are not B15 reproductions. Their complete outputs and exits remain in `s185-repro.*`, `s185-confirmed.*`, and `s185-final.*`. No production change was made in response. Initial broad TypeScript config included unrelated node/pi sources; it was corrected to the project's own include/options before the successful check.

## Exact missing runtime evidence / smallest owner diagnostic

Need one trace from the affected live Claude Code pane, covering one disappearing agent, before launch, immediately after launch, after completion, and after SendMessage resume:

1. Confirm CLI version and loaded ops-board path/version; record whether its hooks were disabled or failed to load. Local checks use 2.1.311; the report names 2.1.310. Behavior differences between these builds were **not** established, and the 2.1.310 process was not available to this seat.
2. From a temporary diagnostic hook in that **same live session**, capture `$.agent.list()` results or exception (ids, name, description, type, status, parentId, spawnedBy), plus the clock timestamp. The model's ListAgents tool output alone is useful identity evidence but is not proof of the plugin API response.
3. Capture `agent.spawn` input identity fields (`tool_use_id`, description, subagentType, background, isTeammate, resume.agentId, workflow.runId) and the settled `next(e)` result (`agentId`, model, deny). Exclude prompt/body content. Capture `turn.start` and `turn.complete` agentId/reason for that same id.
4. Capture hook failure messages and `noteSpawn`/`pollAgents` storage failures currently swallowed by their catches; compare the ops-board agents array to those list/spawn ids, plus tab and runsOpen values. If the API names the id but the stored array does not, the boundary is storage/hooks; if the array contains it but rendering does not, investigate pane state/viewport; if neither API produces it, investigate host/version behavior.

Do not install a speculative Agent-result fallback based only on absent live observations. Re-dispatch after this trace establishes the failing boundary and a faithful red test can be built.

Unrelated problem: none established. Test scaffolding and compiler sandbox/config issues are documented above, not product defects. No board or run ledgers changed; no commit or push.
