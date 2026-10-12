#!/usr/bin/env node
// remote-cerebro gemini ATTACH hook - v2, SHIPPED DISABLED.
//
// Design (PLAN-remote-cli.md section 3.4): an AfterAgent hook posts the turn's
// prompt_response to the phone, then blocks (<= 5 min, the hook timeout) waiting for
// the next phone message; on one it prints {"decision":"deny","reason":"<text>"},
// which gemini sends to the agent as a new prompt. Approvals CANNOT be answered from
// the phone in this mode (gemini's Notification hook is observe-only), and the hook
// blocks the desk while it waits. Blocked on risk 4 (deny+reason as a remote feed,
// stop_hook_active, a 5-minute timeout) - none of it verified.
//
// Until risk 4 is run, this hook is inert on purpose: it always answers {} (let the
// session continue normally) and never touches a channel, whatever the environment
// says. Turning it on is a code change reviewed against the arm-token check, not a
// setting.
const ENABLED = false;

let input = "";
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", () => {
  if (!ENABLED) { process.stdout.write("{}\n"); return; }
  // v2: attachAuthorize() from cerebro-core.mjs first; no channel without a fresh arm token.
  process.stdout.write("{}\n");
});
