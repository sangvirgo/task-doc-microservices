# CLO Internship Presentation Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and validate an 11-slide Vietnamese PPTX for a 10–15 minute internship presentation aligned to CLO1–CLO5.

**Architecture:** A single Node.js generator produces 16:9 SVG slide artwork with a dark security-first theme, rasterizes each slide with ImageMagick, and packages the images into a minimal PPTX. The deck is intentionally self-contained and does not depend on the frontend or external assets.

**Tech Stack:** Node.js ESM, SVG, ImageMagick `convert`, ZIP/XML PPTX package, LibreOffice headless validation.

---

### Task 1: Create the deck generator and visual system

**Files:**
- Create: `scripts/create-clo-internship-deck.mjs`
- Create by generator: `docs/presentations/C17-CLO-internship-presentation.pptx`

- [ ] **Step 1: Define reusable slide primitives**

Implement helpers for slide backgrounds, headings, footer/page numbers, cards, pills, arrows, badges, text wrapping, and XML escaping. Keep the canvas at 1600×900 so the output maps cleanly to 16:9.

- [ ] **Step 2: Implement the 11 slide renderers**

Use the approved structure and the exact repository-backed facts from the design spec. Keep each slide to one message: no more than 4–5 short bullets except the final CLO matrix.

- [ ] **Step 3: Implement PPTX packaging**

Generate PNG assets from SVG with ImageMagick, then write the PPTX package parts: presentation, slide master/layout, theme, slide relationships, image relationships, content types, and root relationships. Place each PNG at full-slide size.

- [ ] **Step 4: Run the generator**

Run:

```bash
node scripts/create-clo-internship-deck.mjs
```

Expected: the PPTX is created at `docs/presentations/C17-CLO-internship-presentation.pptx` and the generator reports 11 slides.

### Task 2: Validate the presentation artifact

**Files:**
- Test: generated PPTX and temporary validation output under `/tmp`

- [ ] **Step 1: Validate PPTX package structure**

Run:

```bash
unzip -t docs/presentations/C17-CLO-internship-presentation.pptx
```

Expected: no CRC or ZIP errors.

- [ ] **Step 2: Convert with LibreOffice**

Run:

```bash
mkdir -p /tmp/c17-clo-pptx-check
libreoffice --headless --convert-to pdf --outdir /tmp/c17-clo-pptx-check docs/presentations/C17-CLO-internship-presentation.pptx
pdfinfo /tmp/c17-clo-pptx-check/C17-CLO-internship-presentation.pdf | rg '^Pages:'
```

Expected: `Pages: 11` and no conversion error.

- [ ] **Step 3: Inspect slide contact sheet**

Render the PDF pages to a contact sheet with ImageMagick and inspect it for clipped text, unreadable contrast, missing arrows, and incorrect CLO labels.

### Task 3: Final handoff

- [ ] **Step 1: Run a final text/content audit**

Confirm the deck includes all five CLO labels, the 10-service architecture, the secure upload flow, Docker deployment, operation evidence, and the stated 41-suite/212-test verification.

- [ ] **Step 2: Report the output path and test results**

Provide the clickable PPTX file link and a concise note explaining that the deck is ready for a 10–15 minute presentation.
