---
name: slides-grab-plan
description: Stage 1 planning skill for Codex. Build and iterate slide-outline.md until explicit user approval.
metadata:
  short-description: Create and revise slide outline before design stage
---

# slides-grab Plan Skill (Codex)

Use this when the user asks to start a new presentation from scratch.

## Goal
Produce an approved `slide-outline.md` before any slide HTML generation.

## Inputs
- Topic and intent
- Audience
- Tone and constraints
- Optional research findings

## Output
- `slide-outline.md`

## Workflow
1. Analyze user goal and audience.
2. Create or revise `slide-outline.md` with ordered slides and key messages.
3. Present a concise summary to user.
4. Repeat revisions until explicit approval.

## Rules
- Do not generate slide HTML (`<slides-dir>/slide-*.html`) in this stage.
- Keep scope to structure and narrative.
- Ask for approval before moving to design.
- Assume later stages run through the packaged `slides-grab` CLI.
- Use the packaged CLI and bundled references only; do not depend on unpublished agent-specific files.

## Reference
If needed, use the bundled outline reference:
- `references/outline-format.md`
- `references/plan-workflow-reference.md` — archived detailed planning workflow and organizer-agent guidance
