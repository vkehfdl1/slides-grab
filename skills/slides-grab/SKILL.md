---
name: slides-grab
description: End-to-end presentation workflow for Codex. Use when making a full presentation from scratch — planning, designing slides, editing, and exporting. PDF and per-slide PNG are preferred; PPTX/Figma export is experimental / unstable.
metadata:
  short-description: Full pipeline from topic to PDF/PNG + experimental / unstable PPTX/Figma export
---

# slides-grab Skill (Codex) - Full Workflow Orchestrator

Guides you through the complete presentation pipeline from topic to exported file.

---

## Workflow

### Stage 1 — Plan

Use the installed **slides-grab-plan** skill.

1. Take user's topic, audience, and tone.
2. **Style selection (mandatory before outline):** Run `slides-grab list-styles`, analyze the topic/tone, and shortlist 2–3 bundled styles that fit. Present the shortlist with reasons. Optionally offer `slides-grab preview-styles` for visual preview. If none of the 35 bundled styles fit, propose a fully custom visual direction. **Get explicit style approval before writing the outline.**
3. Create `slide-outline.md` with the chosen style ID in the meta section (`style: <id>`).
4. Present outline to user.
5. Revise until user explicitly approves.

**Do not proceed to Stage 2 without approval of both style and outline.**

### Stage 2 — Design

Use the installed **slides-grab-design** skill.

1. Read approved `slide-outline.md` and apply the style specified in its meta section (`style: <id>`). Do not re-open style selection — the style was already approved in Stage 1.
3. Generate `slide-*.html` files in the slides workspace (default: `slides/`).
4. Run validation: `slides-grab validate --slides-dir <path>`
5. If validation fails, automatically fix the slide HTML/CSS until validation passes.
6. For bespoke slide imagery, use `slides-grab image --prompt "<prompt>" --slides-dir <path>` so the default god-tibo-imagen provider (reuses local Codex ChatGPT login — no API key required) saves a local asset under `<slides-dir>/assets/`.
7. For complex diagrams (architecture, workflows, relationship maps, multi-node concepts), prefer `tldraw` over hand-built HTML/CSS diagrams. Render the asset with `slides-grab tldraw`, store it under `<slides-dir>/assets/`, and place it in the slide with a normal `<img>`.
8. Keep local videos under `<slides-dir>/assets/`, prefer `poster="./assets/<file>"` thumbnails, and use `slides-grab fetch-video --url <youtube-url> --slides-dir <path>` (or `yt-dlp` directly) when the source starts on a supported web page.
9. The default provider, god-tibo-imagen, reuses the local Codex ChatGPT login (`~/.codex/auth.json`) — run `codex login` once; no API key required. ⚠️ god-tibo-imagen uses an unsupported private Codex backend that may break without notice. Optional alternatives: `--provider codex` (Codex/OpenAI gpt-image-2 via `OPENAI_API_KEY`; maps `--aspect-ratio` to the nearest supported OpenAI image size; `--image-size 2K|4K` is Nano Banana-only) or `--provider nano-banana` (Google `gemini-3-pro-image-preview` via `GOOGLE_API_KEY` or `GEMINI_API_KEY`; supports `--image-size 2K|4K`). If credentials are unavailable, fall back to web search/download into `<slides-dir>/assets/`.
10. Launch the interactive editor for review: `slides-grab edit --slides-dir <path>`
11. Revise slides based on user feedback via the editor, then re-run validation after each edit round.
12. When the user confirms editing is complete, suggest next steps: build the viewer (`slides-grab build-viewer --slides-dir <path>`) for a final preview, or proceed directly to Stage 3 for PDF/PPTX export.

**Do not proceed to Stage 3 without approval.**

### Stage 3 — Export

Use the installed **slides-grab-export** skill.

1. Confirm user wants conversion.
2. Pick the primary target:
   - Card-news / Instagram-style decks → `slides-grab png --slides-dir <path> --slide-mode card-news --resolution 2160p` (see `slides-grab-card-news`).
   - Widescreen decks → `slides-grab pdf --slides-dir <path> --output <name>.pdf`.
3. Per-slide PNG (any mode): `slides-grab png --slides-dir <path> --output-dir <path>/out-png --resolution 2160p`.
4. PPTX (optional, **experimental / unstable**): `slides-grab convert --slides-dir <path> --output <name>.pptx`.
5. Figma-importable PPTX (optional, **experimental / unstable**): `slides-grab figma --slides-dir <path> --output <name>-figma.pptx`.
6. Report results.

---

## Rules

1. **Always follow the stage order**: Plan → Design → Export.
2. **Get explicit user approval** before advancing to the next stage.
3. **Read each stage's SKILL.md** for detailed rules — this skill only orchestrates.
4. **Use `decks/<deck-name>/`** as the slides workspace for multi-deck projects.
5. **Call out export risk clearly**: PPTX and Figma export are experimental / unstable and must be described as best-effort output.
6. Use the stage skills as the source of truth for plan, design, and export rules.
7. When a slide needs a complex diagram, default to a `tldraw`-generated asset unless the user explicitly asks for a different approach.
8. When a slide needs bespoke imagery, prefer the default god-tibo-imagen provider via `slides-grab image` (reuses local Codex ChatGPT login — no API key required) and keep the saved asset local under `<slides-dir>/assets/`.

## Reference
- `references/presentation-workflow-reference.md` — archived end-to-end workflow guidance from the legacy skill set
