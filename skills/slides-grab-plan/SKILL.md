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
- `slide-outline.md` (must include `style: <id>` in meta section)

## Workflow
1. Analyze user goal and audience.
2. **Style selection (mandatory, before outline):** Run `slides-grab list-styles`, shortlist 2–3 styles that match the topic/tone, present the shortlist with reasons, and get explicit user approval. Optionally offer `slides-grab preview-styles` for visual preview. If no bundled style fits, propose a custom direction and get approval.
3. Create or revise `slide-outline.md` with ordered slides and key messages. Record the approved style ID in the meta section (`style: <id>`).
4. Present a concise summary to user.
5. Repeat revisions until explicit approval.

## Rules
- **Do not write the outline before the user approves a style.** Style selection comes first.
- Do not generate slide HTML (`<slides-dir>/slide-*.html`) in this stage.
- Keep scope to structure, narrative, and style selection.
- Ask for approval before moving to design.
- Assume later stages run through the packaged `slides-grab` CLI.
- Use the packaged CLI and bundled references only; do not depend on unpublished agent-specific files.

## Reference
If needed, use the bundled outline reference:
- `references/outline-format.md`
- `references/plan-workflow-reference.md` — archived detailed planning workflow and organizer-agent guidance
