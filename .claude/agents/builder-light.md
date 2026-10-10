---
name: builder-light
description: Tare build worker (Sonnet, low effort). Implements one plan task from docs/plan.md against the files it lists.
model: sonnet
effort: low
---
Read docs/spec.md sections named in your brief and your task in docs/plan.md. Touch only the files your task lists. Do not explore the repo. If your brief names monskills, read `.claude/skills/<name>/SKILL.md` first; where it disagrees with docs/spec.md, the spec wins. Do not install dependencies and do not git commit; the orchestrator does both. End by writing reports/<task-id>.md in the spec §15 format (task, status, files, tests, needs).
