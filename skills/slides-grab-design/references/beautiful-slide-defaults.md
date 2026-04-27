# Beautiful Slide Defaults

Slide-specific art direction guidance adapted from OpenAI's frontend design guidance for GPT-5.4, with additional distilled principles from Anthropic's Claude design system guidance. Use it to make HTML slides feel deliberate, premium, and instantly scannable without breaking `slides-grab`'s export constraints.

## Working Model

Before building the deck, write three things:

- **visual thesis** — one sentence describing the mood, material, energy, and imagery treatment
- **content plan** — opener → support/proof → detail/story → close/CTA or decision
- **system declaration** — one short paragraph committing to the system you will reuse across the deck

If the style direction is still open, gather visual references or a mood board first. Define the core tokens early: `background`, `surface`, `primary text`, `muted text`, `accent`, plus typography roles for `display`, `headline`, `body`, and `caption`.

### Vocalize the System Before Designing

After the visual thesis and tokens are set, write the system declaration out loud so the deck stays consistent and iteration stays cheap. Name:

- the layout patterns you will reuse for titles, section headers, content, quotes, and closing slides
- the two background colors (max) you will use to introduce intentional rhythm between sections and content slides
- the two typefaces max, plus the one accent color that carries focus
- which slides will be image-led, which will be text-led, and where section dividers reset tempo

A deck without a declared system drifts. Committing to the system up front is the single cheapest way to make the deck feel deliberate.

## Beautiful Defaults for Slides

- Start with composition, not components.
- Treat the opening slide like a poster and make the title or brand the loudest text.
- Give each slide one job, one primary takeaway, and one dominant visual anchor.
- Keep copy short enough to scan in seconds.
- Use whitespace, alignment, scale, cropping, and contrast before adding chrome.
- Limit the system by default: two typefaces max and one accent color.
- Default to cardless layouts. Prefer sections, grids, media blocks, dividers, and strong negative space.
- Use real imagery, product views, diagrams, or data as the main visual idea. Decorative gradients and abstract filler do not count.
- Keep the first slide free of secondary clutter such as stat strips, metadata piles, or multiple competing callouts unless the brief explicitly demands them.

## Narrative Sequence for Decks

Use a narrative rhythm that feels intentional:

1. **Opener** — identity, premise, or promise
2. **Support / proof** — key evidence, context, or concrete value
3. **Detail / story** — workflow, mechanism, or deeper explanation
4. **Close / CTA** — decision, recommendation, next step, or final message

Section dividers should reset the visual tempo. Alternate dense proof slides with simpler image-led or statement-led slides so the deck keeps breathing.

## Content Discipline

Every element must earn its place. When a slide feels empty, solve it with layout, scale, whitespace, and a stronger visual anchor — never by inventing filler content.

- Do not pad slides with placeholder copy, dummy stats, or decorative iconography just to fill space.
- Avoid data slop: invented numbers, vague percentages, and stat strips whose only purpose is to look informational.
- If you believe a slide needs an extra section, example, page, or call-out beyond the approved outline, ask the user before adding it. The user knows the audience better than you do.
- Say one thousand no's for every yes. Cutting is a design tool.

## Color Discipline

- Pull every color from the approved style spec in `src/design-styles-data.js` (or the user's brand tokens when they override the bundled style). Do not invent fresh standalone hex colors mid-slide.
- If the approved palette is too restrictive for a specific slide, extend it harmonically with `oklch()` — derive neighbors from the existing accent or surface — rather than picking a fresh hex from scratch.
- Keep one accent color per deck. Two background colors max across the entire deck; use them to introduce rhythm between section dividers and content slides, not to decorate individual slides.
- Every color must trace back to the approved palette or a documented harmonic extension of it.

## AI Slop Tropes to Avoid

Common AI-generated patterns that cheapen a deck instantly. Treat these as anti-patterns unless the brief explicitly asks for them.

- Aggressive full-slide gradient backgrounds used as the primary surface treatment.
- Rounded-rectangle containers with a solid left-border accent stripe (the AI "accent card" default).
- Drawing iconography or product imagery with inline SVG shapes — use a real asset or a `data-image-placeholder` box instead.
- Overused, generic font families: Inter, Roboto, Arial, Fraunces, and OS system stacks. Prefer Pretendard or the style-specified typeface.
- Emoji as default iconography. Prefer Lucide; emoji is only for briefs that explicitly call for a playful, native-emoji tone.
- "Feature card grid" 3×2 layouts of icon + heading + two-line blurb used as the generic answer to any content slide.
- Faux chrome: drop shadows, subtle gradients, and card borders added to decorate empty space instead of carrying meaning.
- Placeholder-looking real imagery: stock photos that obviously do not match the topic, or AI-generated images with visible artifacts. Prefer a well-composed `data-image-placeholder` over a bad real image.

## Review Litmus

Before showing the deck, ask:

- Can the audience grasp the main point of each slide in 3–5 seconds?
- Does each slide have one dominant idea instead of multiple competing blocks?
- Is there one real visual anchor, not just decoration?
- Would this still feel premium without shadows, cards, or extra chrome?
- Can any line of copy, badge, or callout be removed without losing meaning?
- Does every color on the slide trace back to the approved style spec or a documented `oklch` harmonic extension of it?
- Does any slide lean on an AI slop trope? If so, replace it with composition, typography, or real imagery before review.
