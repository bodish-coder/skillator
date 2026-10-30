---
name: code-vader
description: "Pre-commit diff review replicating Claude Code /code-review (correctness & safety) and Ponytail / code-yoda (restraint, anti-bloat & shortcut debt) across all hosts (code-vader)"
---
Load the `code-vader` skill ({{SKILLS}}/code-vader/SKILL.md) and run its unified two-lens pre-commit review on this repo's diff. Arguments: whatever followed the command (optional: `--staged`, `--unstaged`, or `--auto`; default `--auto` prefers cached diff).

1. **Collect diff & debt markers** - Run `sh {{SKILLS}}/code-vader/scripts/code-vader.sh collect <args>` (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File {{SKILLS}}/code-vader/scripts/code-vader.ps1 collect <args>`). Read changed files and callers before judging.
2. **Lens 1: Correctness & Safety** - Audit the diff for flaws, edge cases, unchecked errors, null crashes, race conditions, type unsoundness, security vulnerabilities (confidence >= 80).
3. **Lens 2: Restraint & Anti-Bloat** - Audit for over-engineering, unnecessary abstractions, duplicate utilities, dead code, and shortcut/ponytail debt markers.
4. **Rank & Verdict** - Output findings ranked by severity, followed by debt ledger and net line reduction, ending with final line: `READY-TO-COMMIT: YES` or `CHANGES-REQUESTED`.