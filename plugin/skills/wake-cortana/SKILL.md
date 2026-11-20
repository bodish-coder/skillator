---
name: wake-cortana
description: Resume the named Relay run automatically after a Watch Cortana quota handoff, without waiting for user input.
---

# Wake Cortana

`/wake-cortana on | off | RUN-00xx | status`

Run `node scripts/wake.mjs <argument>` from the run's repository. The supported driver is Codex CLI. Use the same Codex profile and executable on PATH as the session doing the work. Enable with `on`, then arm exactly one run with its ID. `off` cancels the arm. This is local to the checkout's common Git directory and defaults to off.

After Watch Cortana saves a quota handoff and drains the work, the agent runs `node scripts/wake.mjs handoff <RUN-id> <handoff-path>` from the repository. Only the previously armed run can be marked ready. The detached worker waits for fresh Codex quota evidence and clears its arm when it claims the launch. It reads the run through Relay and starts a fresh Codex session with a fixed resume instruction. Normal workspace permissions still apply. Machine watchdog holds prevent launch. Keep the machine running and signed in. If the worker or launch stops, inspect `status` and the log before rearming. The worker does not survive a reboot.

This command controls automatic resume. Watch Cortana remains independently configurable.
