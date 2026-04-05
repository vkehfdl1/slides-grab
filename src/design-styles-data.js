/**
 * Derived from corazzon/pptx-design-styles (MIT).
 * Source references: README.md, references/styles.md, and
 * preview/modern-pptx-designs-30.html in the upstream repository.
 */

export const RAW_DESIGN_STYLES = [
  {
    "number": "01",
    "title": "Glassmorphism",
    "mood": "Premium · Tech",
    "bestFor": "SaaS, AI",
    "id": "glassmorphism",
    "background": [
      "Deep 3-color gradient: `#1A1A4E → #6B21A8 → #1E3A5F`",
      "Or deep single-tone blue: `#0F0F2D`"
    ],
    "colors": [
      {
        "role": "Title text",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Body text",
        "label": "Soft white",
        "hex": "#E0E0F0"
      }
    ],
    "fonts": [
      "Title: **Segoe UI Light / Calibri Light**, 36–44pt, bold",
      "Body: **Segoe UI**, 14–16pt, regular",
      "KPI numbers: 52–64pt bold"
    ],
    "layout": [
      "**Card-based**: use frosted-glass rectangles as content containers",
      "Rounded corners (radius 12–20px equivalent)",
      "Layer cards slightly offset and rotated ±5° for depth",
      "Add large blurred circles/ellipses behind cards for glow effect"
    ],
    "signature": [
      "Translucent card (fill 15–20%, white border 25%)",
      "Blurred glow blobs in background",
      "All containers use the same glass treatment"
    ],
    "avoid": [
      "White backgrounds (kills the effect)",
      "Fully opaque cards",
      "Bright saturated solid colors"
    ]
  },
  {
    "number": "02",
    "title": "Neo-Brutalism",
    "mood": "Bold · Startup",
    "bestFor": "Pitch decks",
    "id": "neo-brutalism",
    "background": [
      "High-saturation solid: Yellow `#F5F500`, Lime `#CCFF00`, Hot pink `#FF2D55`",
      "Or pure white `#FFFFFF`"
    ],
    "colors": [
      {
        "role": "Border & shadow",
        "label": "Pure black",
        "hex": "#000000"
      },
      {
        "role": "Text",
        "label": "Black",
        "hex": "#000000"
      }
    ],
    "fonts": [
      "Title: **Arial Black / Impact / Bebas Neue**, 40–56pt",
      "Body: **Courier New / Space Mono**, 13–16pt",
      "Numbers: 72–96pt Arial Black"
    ],
    "layout": [
      "**Thick black borders** on all elements (2–4pt solid black)",
      "**Hard offset shadow** bottom-right of every card (5–8pt, no blur)",
      "Slight intentional misalignment — tilted shapes allowed"
    ],
    "signature": [
      "Hard drop shadow (no blur, pure black offset)",
      "Thick border on every element",
      "One oversized number or word breaking the layout"
    ],
    "avoid": [
      "Soft shadows or gradients",
      "Rounded corners",
      "Pastel or muted colors"
    ]
  },
  {
    "number": "03",
    "title": "Bento Grid",
    "mood": "Modular · Structured",
    "bestFor": "Product features",
    "id": "bento-grid",
    "background": [
      "Near-white: `#F8F8F2` or `#F0F0F0`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Off-white",
        "hex": "#F8F8F2"
      },
      {
        "role": "Cell 1 (dark)",
        "label": "Deep navy",
        "hex": "#1A1A2E"
      },
      {
        "role": "Cell 2 (accent 1)",
        "label": "Bright yellow",
        "hex": "#E8FF3B"
      },
      {
        "role": "Cell 3 (accent 2)",
        "label": "Coral red",
        "hex": "#FF6B6B"
      },
      {
        "role": "Cell 4 (accent 3)",
        "label": "Teal",
        "hex": "#4ECDC4"
      },
      {
        "role": "Cell 5 (warm)",
        "label": "Warm yellow",
        "hex": "#FFE66D"
      }
    ],
    "fonts": [
      "Cell title: **SF Pro / Inter**, 18–24pt, semibold",
      "Cell body: **Inter**, 12–14pt, regular",
      "Large stat: 48–64pt bold in dark cell"
    ],
    "layout": [
      "CSS Grid-style layout: cells of different sizes spanning columns/rows",
      "Gap between cells: 8–12pt equivalent",
      "**Asymmetric merging**: one cell spans 2 columns, one spans 2 rows",
      "Each cell has one focused piece of info"
    ],
    "signature": [
      "Asymmetric multi-size grid",
      "One dark anchor cell with white text",
      "Color-coded cells for visual hierarchy"
    ],
    "avoid": [
      "Equal-sized cells (boring)",
      "Too many colors (max 5)",
      "Dense text inside cells"
    ]
  },
  {
    "number": "04",
    "title": "Dark Academia",
    "mood": "Scholarly · Refined",
    "bestFor": "Education, research",
    "id": "dark-academia",
    "background": [
      "Deep warm dark brown: `#1A1208`",
      "Or `#0E0A05` for maximum drama"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep warm brown",
        "hex": "#1A1208"
      },
      {
        "role": "Title text",
        "label": "Antique gold",
        "hex": "#C9A84C"
      },
      {
        "role": "Body text",
        "label": "Warm parchment",
        "hex": "#D4BF9A"
      },
      {
        "role": "Border / ornament",
        "label": "Dark gold",
        "hex": "#3D2E10"
      },
      {
        "role": "Accent",
        "label": "Muted gold",
        "hex": "#8A7340"
      }
    ],
    "fonts": [
      "Title: **Playfair Display Italic / Georgia Italic**, 36–48pt",
      "Body: **EB Garamond / Georgia**, 13–16pt",
      "Label: **Space Mono**, 9–11pt, wide letter-spacing"
    ],
    "layout": [
      "**Inset border frame** — thin gold border 12–20pt from slide edge",
      "Centered title with wide letter-spacing (6–10pt)",
      "Body text in serif, generous leading (1.6–1.8)",
      "Decorative horizontal rule line (thin, gold tint)"
    ],
    "signature": [
      "Double inset border (outer + inner, slightly different widths)",
      "Italic serif title in gold",
      "Monospace footnote or date in muted gold"
    ],
    "avoid": [
      "Modern sans-serif fonts",
      "Bright or saturated colors",
      "Clean minimal layouts — add texture and decoration"
    ]
  },
  {
    "number": "05",
    "title": "Gradient Mesh",
    "mood": "Artistic · Vibrant",
    "bestFor": "Brand launches",
    "id": "gradient-mesh",
    "background": [
      "Multi-point radial gradient blend (4–6 colors overlapping)",
      "Example: `#FF6EC7` + `#7B61FF` + `#00D4FF` + `#FFB347` bleeding into each other"
    ],
    "colors": [
      {
        "role": "Mesh node 1",
        "label": "Hot pink",
        "hex": "#FF6EC7"
      },
      {
        "role": "Mesh node 2",
        "label": "Violet",
        "hex": "#7B61FF"
      },
      {
        "role": "Mesh node 3",
        "label": "Cyan",
        "hex": "#00D4FF"
      },
      {
        "role": "Mesh node 4",
        "label": "Warm orange",
        "hex": "#FFB347"
      },
      {
        "role": "Text",
        "label": "Pure white",
        "hex": "#FFFFFF"
      }
    ],
    "fonts": [
      "Title: **Bebas Neue / Barlow Condensed ExtraBold**, 48–72pt",
      "Body: **Outfit / Poppins Light**, 14–16pt",
      "All text white with subtle drop shadow for legibility"
    ],
    "layout": [
      "Full-bleed gradient as background",
      "Minimal text overlay — let the gradient breathe",
      "Large centered title, small subtitle below",
      "Optional: frosted glass card for body text"
    ],
    "signature": [
      "Multi-radial gradient that feels painterly, not linear",
      "White text with drop shadow",
      "Large typographic element dominating"
    ],
    "avoid": [
      "Linear two-color gradients (too plain)",
      "Dark or muted text",
      "Overcrowded layouts"
    ]
  },
  {
    "number": "06",
    "title": "Claymorphism",
    "mood": "Friendly · 3D",
    "bestFor": "Apps, education",
    "id": "claymorphism",
    "background": [
      "Warm pastel gradient: `#FFECD2 → #FCB69F` or `#E0F7FA → #B2EBF2`"
    ],
    "colors": [
      {
        "role": "Clay element 1",
        "label": "Soft teal",
        "hex": "#A8EDEA"
      },
      {
        "role": "Clay element 2",
        "label": "Blush pink",
        "hex": "#FED6E3"
      },
      {
        "role": "Clay element 3",
        "label": "Warm yellow",
        "hex": "#FFEAA7"
      }
    ],
    "fonts": [
      "Title: **Nunito ExtraBold / Rounded Mplus**, 32–48pt",
      "Body: **Nunito / DM Sans**, 14–16pt",
      "Icon labels: 11–13pt medium"
    ],
    "layout": [
      "**3D rounded shapes** as primary containers (radius 20–32pt equivalent)",
      "Each element casts a **colored drop shadow** (same hue, shifted down, no X offset)",
      "Inner highlight on top edge (white, 30% opacity)",
      "Playful asymmetric arrangement of clay bubbles"
    ],
    "signature": [
      "Colored soft shadow (not grey) matching element color",
      "Very high border radius",
      "Inner highlight stripe at top of each element"
    ],
    "avoid": [
      "Sharp corners",
      "Grey/neutral shadows",
      "Flat design elements mixed in"
    ]
  },
  {
    "number": "07",
    "title": "Swiss International Style",
    "mood": "Functional · Corporate",
    "bestFor": "Consulting, finance",
    "id": "swiss-international-style",
    "background": [
      "Pure white: `#FFFFFF`",
      "Or off-white: `#FAFAFA`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Primary text",
        "label": "Near-black",
        "hex": "#111111"
      },
      {
        "role": "Accent bar",
        "label": "Signal red",
        "hex": "#E8000D"
      },
      {
        "role": "Secondary text",
        "label": "Dark grey",
        "hex": "#444444"
      },
      {
        "role": "Divider line",
        "label": "Light grey",
        "hex": "#DDDDDD"
      }
    ],
    "fonts": [
      "Title: **Helvetica Neue Bold / Arial Bold**, 32–44pt, tight leading",
      "Body: **Helvetica Neue / Arial**, 12–14pt",
      "Labels/captions: **Space Mono**, 9–10pt, 3–4pt letter-spacing"
    ],
    "layout": [
      "Strict **5-column or 12-column grid** — every element snaps to columns",
      "**Vertical red rule** on left edge (4–8pt wide stripe)",
      "Single horizontal divider rule at mid-slide",
      "Circle accent element (red outline) in lower-right zone"
    ],
    "signature": [
      "Left-edge vertical red bar",
      "Horizontal rule dividing title from content",
      "Grid-aligned text blocks with generous margins"
    ],
    "avoid": [
      "Decorative or illustrative elements",
      "Rounded corners",
      "More than 2 fonts"
    ]
  },
  {
    "number": "08",
    "title": "Aurora Neon Glow",
    "mood": "Futuristic · AI",
    "bestFor": "AI, cybersecurity",
    "id": "aurora-neon-glow",
    "background": [
      "Near-black deep space: `#050510` or `#020208`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep space black",
        "hex": "#050510"
      },
      {
        "role": "Glow 1",
        "label": "Neon green",
        "hex": "#00FF88"
      },
      {
        "role": "Glow 2",
        "label": "Electric violet",
        "hex": "#7B00FF"
      },
      {
        "role": "Glow 3",
        "label": "Cyan",
        "hex": "#00B4FF"
      },
      {
        "role": "Body text",
        "label": "Soft white",
        "hex": "#D0D0F0"
      }
    ],
    "fonts": [
      "Title: **Bebas Neue / Barlow Condensed**, 44–60pt, wide letter-spacing 4–8pt",
      "Body: **DM Mono / Space Mono**, 12–14pt",
      "Gradient text clip on title"
    ],
    "layout": [
      "Large blurred glow blobs (filter blur 30–50pt) in background corners",
      "Centered or left-aligned title with gradient text effect",
      "Body on semi-transparent dark panel",
      "Optional scan-line texture overlay (5% opacity)"
    ],
    "signature": [
      "Blurred neon glow circles (not sharp shapes)",
      "Gradient text (green → cyan → violet)",
      "Dark panel for body text legibility"
    ],
    "avoid": [
      "White or light backgrounds",
      "Solid non-glowing colors",
      "Dense body text without panels"
    ]
  },
  {
    "number": "09",
    "title": "Retro Y2K",
    "mood": "Nostalgic · Pop",
    "bestFor": "Events, marketing",
    "id": "retro-y2k",
    "background": [
      "Navy blue: `#000080`",
      "Or electric blue: `#0020C2`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Navy",
        "hex": "#000080"
      },
      {
        "role": "Title text",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Star accent",
        "label": "Yellow",
        "hex": "#FFFF00"
      }
    ],
    "fonts": [
      "Title: **Bebas Neue / Impact**, 36–52pt",
      "Body: **VT323 / Space Mono**, 12–14pt",
      "Double text shadow: 2px cyan + 2px magenta offset"
    ],
    "layout": [
      "**Rainbow stripe bars** top and bottom (6–8pt height)",
      "Star/sparkle icons in corners (✦ ★)",
      "Title centered with double text shadow",
      "Optional: spinning star animation placeholder"
    ],
    "signature": [
      "Rainbow gradient stripe bars",
      "Double-color text shadow (cyan + magenta)",
      "Star/sparkle motifs"
    ],
    "avoid": [
      "Minimalist layouts",
      "Muted or desaturated colors",
      "Serif fonts"
    ]
  },
  {
    "number": "10",
    "title": "Nordic Minimalism",
    "mood": "Calm · Natural",
    "bestFor": "Wellness, non-profit",
    "id": "nordic-minimalism",
    "background": [
      "Warm cream: `#F4F1EC` or `#F0EDE8`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Warm cream",
        "hex": "#F4F1EC"
      },
      {
        "role": "Organic shape",
        "label": "Warm grey",
        "hex": "#D9CFC4"
      },
      {
        "role": "Primary text",
        "label": "Dark warm brown",
        "hex": "#3D3530"
      },
      {
        "role": "Secondary text",
        "label": "Taupe",
        "hex": "#8A7A6A"
      },
      {
        "role": "Accent dot",
        "label": "Deep brown",
        "hex": "#3D3530"
      }
    ],
    "fonts": [
      "Title: **Canela / Freight Display / DM Serif Display**, 36–52pt, light weight",
      "Body: **Inter Light / Lato Light**, 13–15pt",
      "Caption: **Space Mono**, 9–10pt, 4–6pt letter-spacing"
    ],
    "layout": [
      "**Generous whitespace** — at least 40% of slide is empty",
      "One organic blob shape as background texture (low opacity, grey-beige)",
      "Minimal dot accent (3 dots in different brown tones) top-left corner",
      "Thin horizontal rule near bottom, then caption text"
    ],
    "signature": [
      "Organic blob background shape",
      "3-dot color accent",
      "Wide letter-spacing caption in monospace"
    ],
    "avoid": [
      "Bright or saturated colors",
      "Dense text or busy layouts",
      "Sans-serif display fonts (use serif or editorial)"
    ]
  },
  {
    "number": "11",
    "title": "Typographic Bold",
    "mood": "Editorial · Impact",
    "bestFor": "Brand statements",
    "id": "typographic-bold",
    "background": [
      "Off-white linen: `#F0EDE8`",
      "Or pure black: `#0A0A0A` (inverted version)"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Off-white",
        "hex": "#F0EDE8"
      },
      {
        "role": "Primary type",
        "label": "Near-black",
        "hex": "#1A1A1A"
      },
      {
        "role": "Accent word",
        "label": "Signal red",
        "hex": "#E63030"
      },
      {
        "role": "Footnote",
        "label": "Light grey",
        "hex": "#AAAAAA"
      }
    ],
    "fonts": [
      "Oversized display: **Bebas Neue / Anton**, 80–120pt, tight tracking (-2pt)",
      "Accent word: different color, same font",
      "Body (if any): **Space Mono**, 9pt, wide spacing"
    ],
    "layout": [
      "**Type fills the slide** — no illustrations or photos",
      "2–3 lines maximum, massive scale",
      "One word or phrase in accent color",
      "Tiny footnote/label bottom-right in monospace"
    ],
    "signature": [
      "Oversized type (80pt+) as the main visual",
      "Single accent color word breaking the monochrome",
      "Almost no margins — type bleeds toward edges"
    ],
    "avoid": [
      "Images or icons (type IS the design)",
      "More than 3 lines of large text",
      "Mixing multiple font families"
    ]
  },
  {
    "number": "12",
    "title": "Duotone / Color Split",
    "mood": "Dramatic · Contrast",
    "bestFor": "Strategy decks",
    "id": "duotone-color-split",
    "background": [
      "Left half: vivid orange-red `#FF4500`",
      "Right half: deep navy `#1A1A2E`"
    ],
    "colors": [
      {
        "role": "Left panel",
        "label": "Orange-red",
        "hex": "#FF4500"
      },
      {
        "role": "Right panel",
        "label": "Deep navy",
        "hex": "#1A1A2E"
      },
      {
        "role": "Divider",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Left text",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Right text",
        "label": "Matches left panel color",
        "hex": "#FF4500"
      }
    ],
    "fonts": [
      "Panel text: **Bebas Neue**, 40–56pt, vertical writing-mode optional",
      "Caption: **Space Mono**, 9pt"
    ],
    "layout": [
      "Strict **50/50 vertical split** with white divider line (2–4pt)",
      "Each panel shows one concept, one word, or one data point",
      "Text in left panel = white; text in right panel = left panel color",
      "Optional: diagonal split instead of vertical"
    ],
    "signature": [
      "Exact 50/50 split",
      "White divider line",
      "Cross-panel color echo (right text = left panel color)"
    ],
    "avoid": [
      "Three or more color panels",
      "Similar hues (needs strong contrast)",
      "Busy content — one idea per panel"
    ]
  },
  {
    "number": "13",
    "title": "Monochrome Minimal",
    "mood": "Restrained · Luxury",
    "bestFor": "Luxury brands",
    "id": "monochrome-minimal",
    "background": [
      "Near-white: `#FAFAFA`",
      "Or jet black: `#0A0A0A` (dark variant)"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Near-white",
        "hex": "#FAFAFA"
      },
      {
        "role": "Heavy type",
        "label": "Near-black",
        "hex": "#1A1A1A"
      },
      {
        "role": "Thin rule/border",
        "label": "Light grey",
        "hex": "#E0E0E0"
      },
      {
        "role": "Medium element",
        "label": "Mid grey",
        "hex": "#888888"
      },
      {
        "role": "Footnote",
        "label": "Pale grey",
        "hex": "#CCCCCC"
      }
    ],
    "fonts": [
      "Display: **Helvetica Neue Thin / Futura Light**, 24–36pt, extreme letter-spacing (8–12pt)",
      "Body: **Helvetica Neue**, 11–13pt, 150% line height",
      "Accent: **Space Mono**, 9pt"
    ],
    "layout": [
      "Single thin circle outline centered (decorative, not functional)",
      "Width-varying bars (120pt, 80pt, 40pt) as visual hierarchy stand-in",
      "All elements centered or left-aligned — never right",
      "Extreme negative space"
    ],
    "signature": [
      "Thin circle outline as focal point",
      "Descending-width bars (weight hierarchy without font changes)",
      "Monospace caption with wide spacing"
    ],
    "avoid": [
      "Any color (pure monochrome only)",
      "Decorative illustration or pattern",
      "Crowded layouts"
    ]
  },
  {
    "number": "14",
    "title": "Cyberpunk Outline",
    "mood": "HUD · Sci-Fi",
    "bestFor": "Gaming, infra",
    "id": "cyberpunk-outline",
    "background": [
      "Near-black: `#0D0D0D`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Near-black",
        "hex": "#0D0D0D"
      }
    ],
    "fonts": [
      "Title: **Bebas Neue**, 44–60pt, letter-spacing 6–8pt, **outline text** (no fill, colored stroke)",
      "Body: **Space Mono**, 9–11pt",
      "Data labels: **Space Mono**, 8pt, wider spacing"
    ],
    "layout": [
      "Subtle dot-grid or line-grid background (6% opacity)",
      "**Corner bracket markers** (L-shaped, 20pt, neon) in all 4 corners",
      "Title centered with outline stroke effect",
      "Bottom subtext label"
    ],
    "signature": [
      "Outline (stroke-only) text for title",
      "Four corner bracket markers",
      "Grid overlay background"
    ],
    "avoid": [
      "White backgrounds",
      "Filled (non-outline) title text",
      "Bright, warm colors"
    ]
  },
  {
    "number": "15",
    "title": "Editorial Magazine",
    "mood": "Magazine · Story",
    "bestFor": "Annual reviews",
    "id": "editorial-magazine",
    "background": [
      "White `#FFFFFF` with dark block"
    ],
    "colors": [
      {
        "role": "Background (main)",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Dark block",
        "label": "Near-black",
        "hex": "#1A1A1A"
      },
      {
        "role": "Title",
        "label": "Near-black",
        "hex": "#1A1A1A"
      },
      {
        "role": "Rule line",
        "label": "Signal red",
        "hex": "#E63030"
      },
      {
        "role": "Caption",
        "label": "Light grey",
        "hex": "#BBBBBB"
      }
    ],
    "fonts": [
      "Title: **Playfair Display Italic**, 34–48pt",
      "Subhead: **Space Mono**, 8–9pt, 2–3pt letter-spacing",
      "Body: **Georgia**, 11–13pt"
    ],
    "layout": [
      "**Asymmetric two-zone layout**: left 55% white with text, right 45% dark block",
      "Large italic serif title upper-left",
      "Thin red horizontal rule (2pt) below title, 60pt wide",
      "Vertical label text rotated 90° in dark zone",
      "Column-style body text bottom-left"
    ],
    "signature": [
      "Asymmetric white/dark split",
      "Short red rule line under title",
      "Rotated vertical label text in dark zone"
    ],
    "avoid": [
      "Symmetric or centered layouts",
      "Sans-serif display fonts",
      "Full-bleed colored backgrounds"
    ]
  },
  {
    "number": "16",
    "title": "Pastel Soft UI",
    "mood": "Soft · App-like",
    "bestFor": "Healthcare, beauty",
    "id": "pastel-soft-ui",
    "background": [
      "Soft tricolor gradient: `#FCE4F3 → #E8F4FF → #F0FCE4`"
    ],
    "colors": [
      {
        "role": "Dot accent 1",
        "label": "Blush pink",
        "hex": "#F9C6E8"
      },
      {
        "role": "Dot accent 2",
        "label": "Sky blue",
        "hex": "#C6E8F9"
      }
    ],
    "fonts": [
      "Title: **Nunito Bold / DM Sans Medium**, 28–36pt",
      "Body: **Nunito / DM Sans**, 13–15pt",
      "Labels: **Inter**, 11pt"
    ],
    "layout": [
      "Floating frosted-white cards on gradient background",
      "Large circle card (pill shape) as central element",
      "Small decorative blobs in opposite corners",
      "Cards have soft colored box-shadows (color-matched to blobs)"
    ],
    "signature": [
      "Frosted white card (70% opacity, white border)",
      "Pastel tricolor gradient background",
      "Soft color-matched shadows"
    ],
    "avoid": [
      "Dark backgrounds",
      "Saturated or primary colors",
      "Hard drop shadows"
    ]
  },
  {
    "number": "17",
    "title": "Dark Neon Miami",
    "mood": "Synthwave · 80s",
    "bestFor": "Entertainment",
    "id": "dark-neon-miami",
    "background": [
      "Deep purple-black: `#0A0014`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep purple-black",
        "hex": "#0A0014"
      },
      {
        "role": "Sunset semicircle",
        "label": "Orange → hot pink",
        "hex": "#FF6B35 → #FF0080"
      },
      {
        "role": "Title gradient",
        "label": "Orange → pink → purple",
        "hex": "#FF6B35 → #FF0080 → #9B00FF"
      }
    ],
    "fonts": [
      "Title: **Bebas Neue**, 36–52pt, letter-spacing 6–8pt",
      "Body: **Space Mono**, 11–13pt",
      "All text white or gradient"
    ],
    "layout": [
      "**Horizon semicircle** (sunset) in lower-center third",
      "Perspective grid lines converging toward horizon (4–6 lines)",
      "Title positioned top-center",
      "Palm tree or geometric accent in lower corners (optional)"
    ],
    "signature": [
      "Sunset semicircle gradient shape",
      "Converging perspective grid",
      "Gradient text (orange → pink → purple)"
    ],
    "avoid": [
      "Cool color palettes (blue/green dominant)",
      "Daylight or bright backgrounds",
      "Sans-serif body text"
    ]
  },
  {
    "number": "18",
    "title": "Hand-crafted Organic",
    "mood": "Natural · Eco",
    "bestFor": "Eco brands",
    "id": "hand-crafted-organic",
    "background": [
      "Craft paper warm off-white: `#FDF6EE`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Warm craft paper",
        "hex": "#FDF6EE"
      },
      {
        "role": "Dashed circle (outer)",
        "label": "Light tan",
        "hex": "#C8A882"
      },
      {
        "role": "Solid circle (inner)",
        "label": "Medium brown",
        "hex": "#A87850"
      },
      {
        "role": "Title text",
        "label": "Dark warm brown",
        "hex": "#6B4C2A"
      }
    ],
    "fonts": [
      "Title: **Playfair Display Italic / Cormorant Garamond Italic**, 22–34pt",
      "Body: **EB Garamond**, 13–15pt",
      "Caption: **Courier New**, 9pt"
    ],
    "layout": [
      "**Nested circles**: outer dashed + inner solid, slightly off-center or rotated",
      "Botanical emoji or line-art leaf accents in corners",
      "Dashed horizontal rule spanning slide",
      "Italic serif title centered within circles"
    ],
    "signature": [
      "Dashed outer circle (imperfect, rotated 5–10°)",
      "Nested solid inner circle",
      "Botanical/leaf accent elements"
    ],
    "avoid": [
      "Clean geometric shapes",
      "Bright or synthetic colors",
      "Sans-serif fonts"
    ]
  },
  {
    "number": "19",
    "title": "Isometric 3D Flat",
    "mood": "Technical · Structured",
    "bestFor": "IT architecture",
    "id": "isometric-3d-flat",
    "background": [
      "Dark navy: `#1E1E2E`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Dark navy",
        "hex": "#1E1E2E"
      },
      {
        "role": "Top face",
        "label": "Mid violet",
        "hex": "#7C6FFF"
      },
      {
        "role": "Left face",
        "label": "Dark violet",
        "hex": "#4A3FCC"
      },
      {
        "role": "Right face",
        "label": "Medium violet",
        "hex": "#6254E8"
      },
      {
        "role": "Top face 2 (highlight)",
        "label": "Light violet",
        "hex": "#A594FF"
      }
    ],
    "fonts": [
      "Labels: **Space Mono**, 10–12pt, white",
      "Title: **Bebas Neue / Barlow Condensed**, 28–40pt, white"
    ],
    "layout": [
      "Isometric (30° angle) 3D block shapes — two or three stacked cubes",
      "Blocks assembled left-center, title upper-right",
      "Thin connecting lines or arrows between blocks (for diagrams)",
      "All shapes share the same 3-face color system (top lighter, sides darker)"
    ],
    "signature": [
      "Strict isometric angle (30°/60°)",
      "3-face shading system (top, left, right faces)",
      "Dark navy background contrast"
    ],
    "avoid": [
      "Perspective 3D (use isometric only)",
      "Rounded shapes",
      "Light or white backgrounds"
    ]
  },
  {
    "number": "20",
    "title": "Vaporwave",
    "mood": "Dreamy · Subculture",
    "bestFor": "Creative agencies",
    "id": "vaporwave",
    "background": [
      "Dark purple gradient: `#1A0533 → #2D0057 → #570038`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep purple",
        "hex": "#1A0533 → #570038"
      },
      {
        "role": "Sun gradient",
        "label": "Orange → pink → violet",
        "hex": "#FF9F43 → #FF6B9D → #C44DFF"
      }
    ],
    "fonts": [
      "Ghost title: **Bebas Neue**, 38–52pt, 6pt spacing, near-invisible",
      "Gradient text: **Bebas Neue**, 24–34pt",
      "Body: **Space Mono**, 10pt"
    ],
    "layout": [
      "**Perspective grid** in lower 60% (horizontal + vertical lines converging)",
      "Semicircle sun top-center, sliced by 2 horizontal bars (background color)",
      "Ghost watermark text near sun area",
      "Gradient text at bottom"
    ],
    "signature": [
      "Sliced sunset semicircle (sun with stripes)",
      "Perspective grid floor",
      "Ghost/watermark title text"
    ],
    "avoid": [
      "Clean or corporate layouts",
      "Muted or warm earth tones",
      "Readable \"normal\" typography style"
    ]
  },
  {
    "number": "21",
    "title": "Art Deco Luxe",
    "mood": "Gold · Geometric",
    "bestFor": "Luxury, gala events",
    "id": "art-deco-luxe",
    "background": [
      "Deep black-brown: `#0E0A05`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep black-brown",
        "hex": "#0E0A05"
      },
      {
        "role": "Border / ornament",
        "label": "Antique gold",
        "hex": "#B8960C"
      },
      {
        "role": "Title text",
        "label": "Rich gold",
        "hex": "#D4AA2A"
      },
      {
        "role": "Subtitle",
        "label": "Muted gold",
        "hex": "#8A7020"
      },
      {
        "role": "Diamond accent",
        "label": "Bright gold",
        "hex": "#B8960C"
      }
    ],
    "fonts": [
      "Title: **Cormorant Garamond / Trajan / Didot**, 26–36pt, wide letter-spacing 6–10pt",
      "Caption: **Space Mono**, 9pt, 4–5pt letter-spacing",
      "All text uppercase"
    ],
    "layout": [
      "**Double inset gold border** frame (outer full, inner slightly inset)",
      "**Fan / quarter-circle ornaments** in left and right mid-edge",
      "Thin horizontal gold rule at vertical center",
      "Diamond (rotated square) at rule-center intersection",
      "Title centered, uppercase, wide-spaced"
    ],
    "signature": [
      "Double inset border frame (two concentric rectangles)",
      "Fan ornaments on sides",
      "Diamond divider at center rule",
      "ALL CAPS wide letter-spaced serif"
    ],
    "avoid": [
      "Modern sans-serif fonts",
      "Colorful or pastel tones",
      "Asymmetric layouts"
    ]
  },
  {
    "number": "22",
    "title": "Brutalist Newspaper",
    "mood": "Editorial · Raw",
    "bestFor": "Media, research",
    "id": "brutalist-newspaper",
    "background": [
      "Aged paper off-white: `#F2EFE8`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Aged paper",
        "hex": "#F2EFE8"
      },
      {
        "role": "Masthead bar",
        "label": "Deep warm black",
        "hex": "#1A1208"
      },
      {
        "role": "Masthead text",
        "label": "Off-white",
        "hex": "#F2EFE8"
      },
      {
        "role": "Body text",
        "label": "Dark warm brown",
        "hex": "#3A3020"
      },
      {
        "role": "Column divider",
        "label": "Deep warm black",
        "hex": "#1A1208"
      }
    ],
    "fonts": [
      "Masthead: **Space Mono Bold**, 12–14pt, tight",
      "Headline: **Georgia Bold / Playfair Display Bold**, 20–28pt",
      "Body: **Georgia**, 9–11pt, 1.5 line height",
      "Date/label: **Space Mono**, 7–9pt, 1pt letter-spacing"
    ],
    "layout": [
      "**Dark masthead bar** full-width at top (newspaper nameplate)",
      "Double rule lines below masthead (3pt + 1pt)",
      "**Two-column layout** with vertical divider rule",
      "Left: headline + body text; Right: photo placeholder + caption"
    ],
    "signature": [
      "Newspaper masthead bar",
      "Double rule below masthead",
      "Two-column layout with divider",
      "Italic serif headline"
    ],
    "avoid": [
      "Modern sans-serif fonts",
      "Colorful elements",
      "Clean white space (embrace density)"
    ]
  },
  {
    "number": "23",
    "title": "Stained Glass Mosaic",
    "mood": "Colorful · Artistic",
    "bestFor": "Culture, museums",
    "id": "stained-glass-mosaic",
    "background": [
      "Near-black grid frame: `#0A0A12`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Near-black (grout)",
        "hex": "#0A0A12"
      },
      {
        "role": "Cell 1",
        "label": "Deep royal blue",
        "hex": "#1A3A6E"
      },
      {
        "role": "Cell 2",
        "label": "Crimson",
        "hex": "#E63030"
      },
      {
        "role": "Cell 3",
        "label": "Golden yellow",
        "hex": "#F5D020"
      },
      {
        "role": "Cell 4",
        "label": "Forest green",
        "hex": "#2A6E1A"
      },
      {
        "role": "Cell 5",
        "label": "Deep purple",
        "hex": "#6E1A4E"
      }
    ],
    "fonts": [
      "Title overlay: **Cormorant Garamond Bold / Trajan**, 16–22pt, wide spacing",
      "Body (below mosaic): **Georgia**, 13–15pt"
    ],
    "layout": [
      "**6×4 (or similar) mosaic grid** covering full slide — 2pt dark gap between cells",
      "Cells vary in color following a stained-glass color rhythm",
      "Semi-transparent dark overlay to darken and unify",
      "Slide title rendered as overlay text at bottom (light, wide-spaced)"
    ],
    "signature": [
      "Dark \"grout\" gaps between all cells",
      "No two adjacent cells the same color",
      "Translucent overlay for text legibility"
    ],
    "avoid": [
      "Pastel or muted cell colors",
      "Large empty cells",
      "Sans-serif overlay text"
    ]
  },
  {
    "number": "24",
    "title": "Liquid Blob Morphing",
    "mood": "Fluid · Organic Tech",
    "bestFor": "Biotech, innovation",
    "id": "liquid-blob-morphing",
    "background": [
      "Deep ocean gradient: `#0F2027 → #203A43 → #2C5364`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep ocean",
        "hex": "#0F2027 → #2C5364"
      },
      {
        "role": "Title",
        "label": "White / near-white",
        "hex": "#F0FFFE"
      }
    ],
    "fonts": [
      "Title: **Bebas Neue**, 36–48pt, 6pt letter-spacing",
      "Body: **DM Mono / Space Mono**, 12–14pt",
      "All text white"
    ],
    "layout": [
      "3 large blurred blob shapes positioned asymmetrically (corners + center)",
      "Blobs overlap with `multiply` or `screen` blend mode effect",
      "Title centered with teal text glow",
      "Optional: animated morphing border-radius effect"
    ],
    "signature": [
      "Three overlapping blurred blobs (low opacity)",
      "Ocean-depth dark background",
      "Glowing white text with colored halo"
    ],
    "avoid": [
      "Sharp geometric shapes",
      "Bright or warm backgrounds",
      "Dense text content"
    ]
  },
  {
    "number": "25",
    "title": "Memphis Pop Pattern",
    "mood": "80s · Geometric",
    "bestFor": "Fashion, lifestyle",
    "id": "memphis-pop-pattern",
    "background": [
      "Warm off-white: `#FFF5E0`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Warm off-white",
        "hex": "#FFF5E0"
      },
      {
        "role": "Triangle accent",
        "label": "Crimson red",
        "hex": "#E8344A"
      },
      {
        "role": "Circle outline",
        "label": "Royal blue",
        "hex": "#1E90FF"
      },
      {
        "role": "Zigzag bar",
        "label": "Crimson red",
        "hex": "#E8344A"
      },
      {
        "role": "Dot accent",
        "label": "Mint green",
        "hex": "#22BB88"
      },
      {
        "role": "Star/triangle 2",
        "label": "Golden yellow",
        "hex": "#FFD700"
      }
    ],
    "fonts": [
      "Title: **Bebas Neue / Futura ExtraBold**, 32–44pt",
      "Body: **Futura / DM Sans**, 12–14pt"
    ],
    "layout": [
      "**Scattered geometric shapes** (triangles, circles, dots, zigzags) across slide",
      "No central focal point — distribute shapes with intentional asymmetry",
      "Title placed over a slightly cleared zone in center",
      "One zigzag bar cuts horizontally across the middle third"
    ],
    "signature": [
      "Triangles, circles, dots, and zigzag bar all present",
      "Warm off-white background (not pure white or dark)",
      "Shapes feel random but are intentionally balanced"
    ],
    "avoid": [
      "Minimalist compositions",
      "Monochromatic palettes",
      "Modern/clean fonts"
    ]
  },
  {
    "number": "26",
    "title": "Dark Forest Nature",
    "mood": "Mysterious · Atmospheric",
    "bestFor": "Eco premium",
    "id": "dark-forest-nature",
    "background": [
      "Radial dark gradient: `#0D2B14` center → `#060E08` edges"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep forest black",
        "hex": "#060E08"
      },
      {
        "role": "Stars",
        "label": "Pale green-white",
        "hex": "#D4F0B0"
      },
      {
        "role": "Title text",
        "label": "Sage-white italic",
        "hex": "rgba(200,255,180,0.85)"
      }
    ],
    "fonts": [
      "Title: **Playfair Display Italic / DM Serif Display Italic**, 20–28pt",
      "Body: **EB Garamond**, 13–15pt",
      "Caption: **Space Mono**, 9pt, wide spacing"
    ],
    "layout": [
      "**Tree silhouettes** rising from bottom — triangular/fir shapes, 3+ overlapping depths",
      "**Moon** top-right with soft radial glow",
      "Star dots scattered sparingly in upper half",
      "Mist gradient rising from bottom over trees",
      "Italic serif title near bottom (above mist)"
    ],
    "signature": [
      "Layered tree silhouettes (3+ depths)",
      "Glowing moon top-right",
      "Fog/mist gradient overlay",
      "Italic serif text in sage-white"
    ],
    "avoid": [
      "Bright greens (use near-black forest tones)",
      "Hard edges on tree shapes",
      "Sans-serif fonts"
    ]
  },
  {
    "number": "27",
    "title": "Architectural Blueprint",
    "mood": "Technical · Precise",
    "bestFor": "Architecture",
    "id": "architectural-blueprint",
    "background": [
      "Blueprint blue: `#0D2240`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Blueprint navy",
        "hex": "#0D2240"
      }
    ],
    "fonts": [
      "All text: **Space Mono**, 8–12pt (no exceptions — monospace only)",
      "Dimension annotations: 8pt",
      "Title: 11–13pt, 4pt letter-spacing",
      "Stamp: 8pt, multiline"
    ],
    "layout": [
      "**Fine grid** (20pt) + **major grid** (60pt) layered",
      "One or two geometric shapes with dimensions and annotation marks",
      "Arrow dimension lines between key points",
      "Circular stamp element (right side, mid-height)",
      "Title as full-width label at bottom"
    ],
    "signature": [
      "Dual grid (fine + major)",
      "Dimension lines with annotation text",
      "Circular blueprint stamp"
    ],
    "avoid": [
      "Color or decorative elements",
      "Non-monospace fonts",
      "Photographic elements"
    ]
  },
  {
    "number": "28",
    "title": "Maximalist Collage",
    "mood": "Energetic · Layered",
    "bestFor": "Advertising, fashion",
    "id": "maximalist-collage",
    "background": [
      "Warm antique cream: `#E8DDD0` with diagonal pattern overlay"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Antique cream",
        "hex": "#E8DDD0"
      },
      {
        "role": "Block 1",
        "label": "Bold red",
        "hex": "#E83030"
      },
      {
        "role": "Block 2",
        "label": "Near-black",
        "hex": "#1A1A1A"
      },
      {
        "role": "Block 3",
        "label": "Acid yellow",
        "hex": "#F5D020"
      },
      {
        "role": "Text on red",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Text on black",
        "label": "White",
        "hex": "#FFFFFF"
      }
    ],
    "fonts": [
      "Bold word: **Bebas Neue**, 24–34pt",
      "Secondary: **Playfair Display Italic**, 16–22pt, vertical writing",
      "Giant number: **Bebas Neue**, 64–80pt (ghost/watermark at 8% opacity)",
      "Caption: **Space Mono**, 8pt"
    ],
    "layout": [
      "**Overlapping color blocks** (3 blocks, each slightly rotated ±2–5°)",
      "Each block contains one focused element (text, word, or icon)",
      "Diagonal stripe pattern on background (3% opacity)",
      "Ghost number lower-right",
      "Circle outline accent element (outline only, one of the bold colors)"
    ],
    "signature": [
      "3+ overlapping rotated blocks",
      "Giant ghost number as texture",
      "Circle outline accent",
      "Vertical text in one block"
    ],
    "avoid": [
      "Symmetric or centered compositions",
      "Clean uncluttered layouts",
      "Muted backgrounds"
    ]
  },
  {
    "number": "29",
    "title": "SciFi Holographic Data",
    "mood": "Hologram · HUD",
    "bestFor": "AI, quantum",
    "id": "scifi-holographic-data",
    "background": [
      "Deep space black: `#03050D`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Deep space",
        "hex": "#03050D"
      },
      {
        "role": "Bar elements",
        "label": "Cyan gradient",
        "hex": "transparent → #00C8FF → transparent"
      },
      {
        "role": "Center dot",
        "label": "Bright cyan",
        "hex": "#00C8FF"
      }
    ],
    "fonts": [
      "All text: **Space Mono**, 9–11pt",
      "System labels: 10pt, 3pt letter-spacing",
      "Coordinates/data: 8pt"
    ],
    "layout": [
      "**3 concentric rings** (full circles, varying opacity increasing inward)",
      "Middle ring rotated 30° from outer ring",
      "**Horizontal scan line** animating top to bottom (or static at mid position)",
      "Horizontal bars (gradient center-glow) top and bottom",
      "Center dot at ring intersection",
      "Text labels at top-left and bottom-right"
    ],
    "signature": [
      "3 concentric circles (not uniform — one rotated)",
      "Scan line (animated or static)",
      "All elements strictly monochromatic cyan"
    ],
    "avoid": [
      "Multiple hue accents",
      "Warm or saturated colors",
      "Any decorative illustration"
    ]
  },
  {
    "number": "30",
    "title": "Risograph Print",
    "mood": "CMYK · Indie",
    "bestFor": "Publishing, art",
    "id": "risograph-print",
    "background": [
      "Aged paper: `#F7F2E8`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Aged paper",
        "hex": "#F7F2E8"
      },
      {
        "role": "Circle 1 (C)",
        "label": "Riso red",
        "hex": "#E8344A"
      },
      {
        "role": "Circle 2 (M)",
        "label": "Riso blue",
        "hex": "#0D5C9E"
      },
      {
        "role": "Circle 3 (Y)",
        "label": "Riso yellow",
        "hex": "#F5D020"
      }
    ],
    "fonts": [
      "Main title: **Bebas Neue**, 34–44pt, 4pt letter-spacing",
      "Caption: **Space Mono**, 9pt"
    ],
    "layout": [
      "**Three overlapping circles** (CMYK primary colors) in center third",
      "Each circle uses `multiply` blend mode — overlaps create secondary colors naturally",
      "**Offset ghost text** behind main title (3–4pt shift, low opacity, accent color)",
      "Main title centered above circles",
      "Monospace caption at bottom"
    ],
    "signature": [
      "Three overlapping multiply-blend circles",
      "Offset ghost title (registration mark error simulation)",
      "Warm paper background"
    ],
    "avoid": [
      "Digital-looking crisp shapes",
      "Dark backgrounds",
      "Screen-blend mode (must be multiply for authentic CMYK overlap)"
    ]
  },
  {
    "number": "31",
    "title": "Executive Minimal",
    "mood": "Refined · Business",
    "bestFor": "Business presentations",
    "id": "executive-minimal",
    "background": [
      "Warm white: `#F5F5F0`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Warm white",
        "hex": "#F5F5F0"
      },
      {
        "role": "Secondary background",
        "label": "Muted beige",
        "hex": "#E8E8E3"
      },
      {
        "role": "Primary text / accent",
        "label": "Near-black",
        "hex": "#1A1A1A"
      },
      {
        "role": "Secondary text",
        "label": "Mid grey",
        "hex": "#666666"
      },
      {
        "role": "Light text",
        "label": "Light grey",
        "hex": "#999999"
      },
      {
        "role": "Border",
        "label": "Warm grey",
        "hex": "#D4D4D0"
      }
    ],
    "fonts": [
      "Title: **Pretendard Bold**, 32–44pt",
      "Body: **Pretendard**, 14–16pt",
      "Caption: **Pretendard Light**, 10–12pt"
    ],
    "layout": [
      "Clean grid with generous whitespace",
      "Dark accent bar or block for emphasis",
      "Minimal decoration, content-first hierarchy",
      "Optional dark section (`#1A1A1A`) for contrast slides"
    ],
    "signature": [
      "Warm neutral background with black accent blocks",
      "High contrast title-body pairing",
      "No decorative elements — content speaks"
    ],
    "avoid": [
      "Bright or saturated accent colors",
      "Decorative shapes or patterns",
      "Complex multi-column layouts"
    ]
  },
  {
    "number": "32",
    "title": "Sage Professional",
    "mood": "Calm · Trustworthy",
    "bestFor": "Consulting, healthcare",
    "id": "sage-professional",
    "background": [
      "Sage green: `#B8C4B8`",
      "Or light sage: `#F8FAF8`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Sage green",
        "hex": "#B8C4B8"
      },
      {
        "role": "Secondary background",
        "label": "Deep sage",
        "hex": "#A3B0A3"
      },
      {
        "role": "Light surface",
        "label": "Near-white sage",
        "hex": "#F8FAF8"
      },
      {
        "role": "Primary text",
        "label": "Near-black",
        "hex": "#1A1A1A"
      },
      {
        "role": "Secondary text",
        "label": "Dark grey",
        "hex": "#3D3D3D"
      },
      {
        "role": "Accent",
        "label": "Charcoal",
        "hex": "#2D2D2D"
      },
      {
        "role": "Border",
        "label": "Muted sage",
        "hex": "#9AA89A"
      }
    ],
    "fonts": [
      "Title: **Pretendard SemiBold**, 32–44pt",
      "Body: **Pretendard**, 14–16pt",
      "Caption: **Pretendard Light**, 10–12pt"
    ],
    "layout": [
      "Soft-toned background with high-contrast text",
      "Cards or panels in lighter sage (`#F8FAF8`) over sage base",
      "Generous padding, calm visual rhythm",
      "Thin sage-toned borders for structure"
    ],
    "signature": [
      "Muted green-grey palette throughout",
      "Two-tone sage layering (dark sage base, light sage cards)",
      "Quiet confidence — no bold accents"
    ],
    "avoid": [
      "Bright or warm accent colors",
      "High-contrast neon elements",
      "Busy layouts or dense grids"
    ]
  },
  {
    "number": "33",
    "title": "Modern Dark",
    "mood": "High-impact · Dramatic",
    "bestFor": "Tech talks, demos",
    "id": "modern-dark",
    "background": [
      "Pure dark: `#0F0F0F`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Near-black",
        "hex": "#0F0F0F"
      },
      {
        "role": "Card / secondary",
        "label": "Dark grey",
        "hex": "#1A1A1A"
      },
      {
        "role": "Elevated surface",
        "label": "Medium dark",
        "hex": "#252525"
      },
      {
        "role": "Primary text / accent",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Secondary text",
        "label": "Light grey",
        "hex": "#B0B0B0"
      },
      {
        "role": "Border",
        "label": "Subtle grey",
        "hex": "#333333"
      }
    ],
    "fonts": [
      "Title: **Pretendard Bold**, 36–48pt",
      "Body: **Pretendard**, 14–16pt",
      "Code: **JetBrains Mono / Fira Code**, 12–14pt"
    ],
    "layout": [
      "Full dark background with layered dark surfaces for depth",
      "Card-based content on `#1A1A1A` over `#0F0F0F` base",
      "White text on dark — clean and high-contrast",
      "Thin `#333333` borders to separate sections"
    ],
    "signature": [
      "Pure dark base with subtle surface layering",
      "White-on-black typography as primary visual",
      "Monochrome palette — zero color accents"
    ],
    "avoid": [
      "Colored accents (stay monochrome)",
      "Light or white backgrounds",
      "Grey text on grey backgrounds (maintain contrast)"
    ]
  },
  {
    "number": "34",
    "title": "Corporate Blue",
    "mood": "Traditional · Professional",
    "bestFor": "Enterprise, reports",
    "id": "corporate-blue",
    "background": [
      "White: `#FFFFFF`",
      "Or light blue-grey: `#F7F9FC`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "White",
        "hex": "#FFFFFF"
      },
      {
        "role": "Secondary background",
        "label": "Light blue-grey",
        "hex": "#F7F9FC"
      },
      {
        "role": "Primary text",
        "label": "Dark navy",
        "hex": "#1E2A3A"
      },
      {
        "role": "Secondary text",
        "label": "Blue grey",
        "hex": "#5A6B7D"
      },
      {
        "role": "Accent",
        "label": "Blue",
        "hex": "#2563EB"
      },
      {
        "role": "Border",
        "label": "Light slate",
        "hex": "#E2E8F0"
      }
    ],
    "fonts": [
      "Title: **Pretendard Bold**, 32–44pt",
      "Body: **Pretendard**, 14–16pt",
      "Caption: **Pretendard Light**, 10–12pt"
    ],
    "layout": [
      "Clean white base with blue accent elements",
      "Blue highlight bar or underline for key headings",
      "Structured grid layout with ample margins",
      "Light blue-grey secondary surfaces for data sections"
    ],
    "signature": [
      "Blue accent on white — classic corporate identity",
      "Navy text with blue highlights for hierarchy",
      "Professional and readable at any distance"
    ],
    "avoid": [
      "Trendy or experimental layouts",
      "Dark mode variants",
      "Multiple accent colors"
    ]
  },
  {
    "number": "35",
    "title": "Warm Neutral",
    "mood": "Warm · Approachable",
    "bestFor": "Culture, community",
    "id": "warm-neutral",
    "background": [
      "Cream white: `#FAF8F5`"
    ],
    "colors": [
      {
        "role": "Background",
        "label": "Cream white",
        "hex": "#FAF8F5"
      },
      {
        "role": "Secondary background",
        "label": "Warm beige",
        "hex": "#F0EBE3"
      },
      {
        "role": "Primary text",
        "label": "Dark brown",
        "hex": "#2D2A26"
      },
      {
        "role": "Secondary text",
        "label": "Medium brown",
        "hex": "#6B6560"
      },
      {
        "role": "Accent",
        "label": "Terracotta",
        "hex": "#C45A3B"
      },
      {
        "role": "Border",
        "label": "Warm grey",
        "hex": "#DDD8D0"
      }
    ],
    "fonts": [
      "Title: **Pretendard SemiBold**, 32–44pt",
      "Body: **Pretendard**, 14–16pt",
      "Caption: **Pretendard Light**, 10–12pt"
    ],
    "layout": [
      "Warm cream base with terracotta accent touches",
      "Beige secondary panels for content grouping",
      "Earthy, organic feel with structured layout",
      "Generous whitespace, relaxed visual tempo"
    ],
    "signature": [
      "Cream + terracotta color story",
      "Warm brown text instead of black",
      "Approachable without being casual"
    ],
    "avoid": [
      "Cool blues or greens",
      "High-tech or futuristic aesthetics",
      "Dark mode variants"
    ]
  }
];
