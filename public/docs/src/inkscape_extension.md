---
title: inkscape_extension
layout: docs_layout.njk
---

# Oscilla Inkscape Extension (Experimental)

> **Status:** Experimental / in active development  
> **Stability:** Low – interfaces and behaviour may change without notice

This Inkscape extension provides early tooling for working with **Oscilla / OscillaScore** directly inside Inkscape. It is intended to make it easier to **inspect, add, and apply Oscilla cue IDs** while drawing or editing SVG scores.

At this stage, the goal is simply to make it **possible to try the workflow**, not to provide a polished or complete feature set.


<figure class="doc-image">
  <img
    src="{{ '/docs/img/oscilla-inkscape-extension.png' | url }}"
    alt="Oscilla Inkscape Extension"
  >
  <figcaption>Oscilla Inkscape Extension panel</figcaption>
</figure>


---

## What this extension is (for now)

- A collection of Inkscape extensions (`.inx` + `.py`) related to Oscilla
- Adds **Oscilla-related menus and tools** inside Inkscape
- Includes:
  - Cue inspector
  - Toolbar / quick cue helpers
  - Quick-apply cue presets (speed, rotate, scale, audio, nav, etc.)

Think of it as a **bridge between drawing and cue authoring**, not a replacement for manual editing or understanding the Oscilla cue system.

---

## What this extension is *not*

- Not stable
- Not a full GUI for Oscilla
- Not guaranteed to match current Oscilla runtime behaviour
- Not yet documented feature-by-feature

If something behaves oddly, that is expected at this stage.

---

## Requirements

- Inkscape **1.2 or newer** (tested primarily on Linux)
- Python available to Inkscape (standard Inkscape setup)

---

## Installation

### Option 1: Install using the script (recommended first try)

From the extension directory:

```bash
./install.sh
```

This attempts to copy the extension files into Inkscape’s user extensions folder.

If this works, restart Inkscape and skip to **Finding the extension** below.

---

### Option 2: Manual installation (if the script fails)

1. Locate your Inkscape user extensions directory:

```bash
inkscape --user-extension-directory
```

Typical location on Linux:

```text
~/.config/inkscape/extensions/
```

2. Copy the entire folder:

```bash
oscilla-inkscape-extension/
```

into the extensions directory, so you end up with:

```text
~/.config/inkscape/extensions/oscilla-inkscape-extension/
```

3. Restart Inkscape

---

## Verifying installation

After restarting Inkscape:

- Open **Extensions** in the menu bar
- Look for an **Oscilla** or **Oscilla-related** submenu
- If menus appear, the extension is installed

If nothing appears:

- Check the Inkscape **Extensions → Extensions Manager → Errors**
- Verify Python files are executable
- Restart Inkscape again

---

## How to try it (basic usage)

This is intentionally minimal and exploratory.

### General idea

1. Draw or select an SVG object
2. Use an Oscilla extension entry
3. The extension will typically:
   - Inspect existing `id` values
   - Modify or append Oscilla-style cue IDs

### Typical things to try

- Apply a **quick cue** (rotate, scale, speed, pause, etc.)
- Inspect an object’s Oscilla ID
- Use quick-apply presets to generate valid cue syntax

The resulting SVG should remain **plain SVG** with `id` attributes — nothing magic or hidden.

---

## Quick Apply presets

The `quick-apply/` tools are small, single-purpose helpers that:

- Apply a predefined Oscilla cue pattern
- Are meant for **speed and experimentation**, not correctness

Examples include:

- Rotation (CW / CCW / swing)
- Scale pulse / grow
- Speed up / slow down
- Audio triggers
- Navigation (scroll / page)

These are likely to change or be replaced.

---

## Known limitations

- UI and naming may be inconsistent
- No validation against the Oscilla runtime
- No guarantee cues match current parser rules
- Error messages may be cryptic or absent

This is expected for now.

---

## Recommended workflow

- Use the extension to **sketch ideas quickly**
- Inspect the resulting SVG `id` attributes
- Refine or fix cues manually as needed
- Treat the extension as a helper, not an authority

---

## Reporting issues / feedback

Because this is experimental:

- Expect breakage
- Please report:
  - Inkscape version
  - OS
  - Which tool was used
  - What you expected vs what happened

---

## Future documentation

Once the feature set stabilises, this page will be expanded with:

- Clear feature descriptions
- Stable naming
- Screenshots
- Workflow examples

Until then, this document is intentionally light.

---

*Last updated: early experimental phase*

