#!/bin/sh
# skillator plugin, SessionStart (F92). A hook cannot ask, so this only puts the
# team list and the ask into context; grayskull-power's arm asks. No team file, one
# member, no repo: silent, exit 0. The answer is kept by `ticket-meta iam`.
tm="$(dirname -- "$0")/../skills/tickets-zordon/scripts/ticket-meta.sh"
list=$(sh "$tm" team list 2>/dev/null) || exit 0
[ "$(printf '%s\n' "$list" | grep -c '^@')" -ge 2 ] || exit 0
printf 'skillator F92 - this repo'"'"'s team (.skillator/team.md):\n%s\n' "$list"
printf 'Before other work, ask once: "Who is driving this session?" - one option per member (@handle - name) plus "someone else" (AskUserQuestion). Then record it: sh "%s" iam @handle. Someone else: record nothing. Headless (claude -p, no one to answer): do not ask.\n' "$tm"
exit 0
