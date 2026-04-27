#!/usr/bin/env node
/**
 * build-manifest.js
 *
 * Scans `showcase/presentations/<slug>/` directories and produces
 * `showcase/assets/manifest.json` describing each deck for the gallery
 * front-end.
 *
 * A presentation is any folder under `showcase/presentations/` that
 * contains at least one `slide-*.html` file. Optional artifacts:
 *   - viewer.html
 *   - preview-png/slide-01.png  (or slide-01.png anywhere)
 *   - slide-outline.md          (used to extract the title)
 *   - meta.json                 (override fields explicitly)
 *
 * meta.json shape (all optional):
 *   {
 *     "title": "Custom title",
 *     "description": "One-line description",
 *     "tags": ["research", "ml"],
 *     "date": "2024-12-01",
 *     "viewer": "viewer.html",        // override the link target
 *     "thumbnail": "preview-png/slide-01.png",
 *     "pdf": "deck.pdf",              // optional download link
 *     "hidden": false                  // skip from gallery if true
 *   }
 *
 * Usage:
 *   node showcase/scripts/build-manifest.js
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PRESENTATIONS_DIR = path.join(ROOT, "presentations");
const OUTPUT_FILE = path.join(ROOT, "assets", "manifest.json");

/**
 * Extract a title from slide-outline.md. Resolution order:
 *   1. YAML frontmatter `title:` field (most authoritative — set by the agent)
 *   2. First H1 heading
 *   3. null
 */
function extractTitle(markdownPath) {
  if (!fs.existsSync(markdownPath)) return null;
  const text = fs.readFileSync(markdownPath, "utf8");
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fm) {
    const titleLine = fm[1].match(/^title\s*:\s*(.+?)\s*$/m);
    if (titleLine) {
      return titleLine[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  const h1 = text.match(/^#\s+(.+?)\s*$/m);
  return h1 ? h1[1].trim() : null;
}

/** Find a likely thumbnail under a deck directory. Returns relative posix path or null. */
function findThumbnail(deckDir) {
  const candidates = [
    "preview-png/slide-01.png",
    "out-png/slide-01.png",
    "thumbnails/slide-01.png",
    "thumbnail.png",
    "thumbnail.jpg",
    "slide-01.png",
  ];
  for (const rel of candidates) {
    const abs = path.join(deckDir, rel);
    if (fs.existsSync(abs)) return rel;
  }
  return null;
}

/** Find a PDF artifact at the deck root. Returns relative posix path or null. */
function findPdf(deckDir) {
  const entries = fs.readdirSync(deckDir, { withFileTypes: true });
  const pdf = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"));
  return pdf ? pdf.name : null;
}

/** Count slide-*.html files at the deck root. */
function countSlides(deckDir) {
  const entries = fs.readdirSync(deckDir, { withFileTypes: true });
  return entries.filter(
    (e) => e.isFile() && /^slide-\d{2,}\.html$/.test(e.name)
  ).length;
}

/** Convert a slug to a readable Title Case fallback. */
function slugToTitle(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.warn(`[manifest] Failed to parse ${filePath}: ${err.message}`);
    return {};
  }
}

function buildEntry(slug) {
  const deckDir = path.join(PRESENTATIONS_DIR, slug);
  const stat = fs.statSync(deckDir);
  if (!stat.isDirectory()) return null;

  const slideCount = countSlides(deckDir);
  if (slideCount === 0) {
    console.warn(`[manifest] Skipping "${slug}" — no slide-*.html files found.`);
    return null;
  }

  const meta = readJsonSafe(path.join(deckDir, "meta.json"));
  if (meta.hidden) {
    console.log(`[manifest] Skipping "${slug}" — hidden via meta.json.`);
    return null;
  }

  const outlineTitle = extractTitle(path.join(deckDir, "slide-outline.md"));
  const viewerExists = fs.existsSync(path.join(deckDir, "viewer.html"));
  const thumbnail = meta.thumbnail || findThumbnail(deckDir);
  const pdf = meta.pdf || findPdf(deckDir);

  const base = `presentations/${slug}`;

  return {
    slug,
    title: meta.title || outlineTitle || slugToTitle(slug),
    description: meta.description || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    date: meta.date || null,
    slideCount,
    viewer: viewerExists ? `${base}/${meta.viewer || "viewer.html"}` : null,
    firstSlide: `${base}/slide-01.html`,
    thumbnail: thumbnail ? `${base}/${thumbnail}` : null,
    pdf: pdf ? `${base}/${pdf}` : null,
  };
}

function main() {
  if (!fs.existsSync(PRESENTATIONS_DIR)) {
    console.error(`[manifest] presentations directory missing: ${PRESENTATIONS_DIR}`);
    fs.mkdirSync(PRESENTATIONS_DIR, { recursive: true });
  }

  const slugs = fs
    .readdirSync(PRESENTATIONS_DIR)
    .filter((name) => {
      if (name.startsWith(".")) return false;
      try {
        return fs.statSync(path.join(PRESENTATIONS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();

  const entries = slugs
    .map(buildEntry)
    .filter(Boolean)
    .sort((a, b) => {
      // Newest first by date when available, then by title.
      if (a.date && b.date) return b.date.localeCompare(a.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.title.localeCompare(b.title);
    });

  const manifest = {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    presentations: entries,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `[manifest] Wrote ${entries.length} presentation${entries.length === 1 ? "" : "s"} → ${path.relative(process.cwd(), OUTPUT_FILE)}`
  );
}

main();
