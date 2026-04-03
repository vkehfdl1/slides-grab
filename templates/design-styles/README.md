# Design Style Collections

slides-grab bundles 30 design collections derived from [corazzon/pptx-design-styles](https://github.com/corazzon/pptx-design-styles) (MIT).

These collections are reference directions for slide generation, not drop-in HTML slide templates.

## Recommended workflow

1. `slides-grab list-styles`
2. `slides-grab preview-styles --style <id>` when you want a richer preview
3. `slides-grab select-style <id>` before generating slides
4. Keep or update `style-config.json` as the approved design direction for the deck

The preview/select flow is intentionally simple: it keeps design approval inside the CLI and a local HTML preview page instead of adding a separate app.

## Citation

- Upstream collection: `corazzon/pptx-design-styles`
- URL: <https://github.com/corazzon/pptx-design-styles>
- Reference used in this repo: `references/styles.md`
