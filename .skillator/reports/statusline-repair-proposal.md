# Proposed profile statusLine repair

Only statusLine.command is changed. Keep every other setting and each existing -Then command. The source checkout path survives plugin version bumps. Existing ponytail commands remain verbatim; their updates are separate.

Create a timestamped sibling backup before replacing each settings.json, validate JSON before atomic replacement, and smoke-test probe with a synthetic session in a temporary directory.

## C:\Users\Ikran\.claude-bodish\settings.json

powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/plugin/skills/watch-cortana/hooks/usage-watch.ps1 -Mode probe -Then "powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/Ikran/.claude-bodish/plugins/cache/ponytail/ponytail/4.7.0/hooks/ponytail-statusline.ps1"

## C:\Users\Ikran\.claude\settings.json

powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/plugin/skills/watch-cortana/hooks/usage-watch.ps1 -Mode probe -Then "powershell -NoProfile -ExecutionPolicy Bypass -File C:/Users/Ikran/.claude/plugins/cache/ponytail/ponytail/4.7.0/hooks/ponytail-statusline.ps1"

## C:\Users\Ikran\.claude-ikran\settings.json

powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/plugin/skills/watch-cortana/hooks/usage-watch.ps1 -Mode probe

## C:\Users\Ikran\.claude-info\settings.json

powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/plugin/skills/watch-cortana/hooks/usage-watch.ps1 -Mode probe

## C:\Users\Ikran\.claude-mem\settings.json

powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/plugin/skills/watch-cortana/hooks/usage-watch.ps1 -Mode probe

## C:\Users\Ikran\.claude-vidul\settings.json

powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/plugin/skills/watch-cortana/hooks/usage-watch.ps1 -Mode probe

## C:\Users\Ikran\.claude-work\settings.json

powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/plugin/skills/watch-cortana/hooks/usage-watch.ps1 -Mode probe
