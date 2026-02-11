---
title: Working with Parts
layout: docs_layout.njk
---

# Working with Parts

Oscilla supports two approaches to per-performer parts: **separate score files** and **stacked layers within a single SVG**. Both are configured in the **Parts** tab of the preferences dialog and stored per-browser, so each performer on a shared network can independently choose their own view.

The two approaches can be combined. A project might use separate score files for radically different parts (e.g. a conductor score and a performer score) while also using layers within each file for finer distinctions (e.g. violin I and violin II sharing a string parts score).

---

## Approach 1: Separate Score Files

Each part is authored as an independent scrolling SVG. All files live in the project root alongside `score.svg`:

```text
myProject/
├── score.svg                  # full score (always present)
├── score-part-violin.svg      # violin part
├── score-part-viola.svg       # viola part
├── score-part-cello.svg       # cello part
├── score-conductor.svg        # conductor view
├── preferences.json
└── pages/
```

### Naming Convention

Files must match the pattern `score*.svg`:

- `score.svg` — the main or full score (always listed first)
- `score-part-violin.svg` — a part score
- `score-conductor.svg` — a conductor score
- `score-electronics.svg` — an electronics part

The prefix `score` is required. Everything after it becomes the display label in the preferences dialog. Hyphens become spaces: `score-part-violin.svg` appears as **part violin**.

### When to Use Separate Files

Separate files are appropriate when parts differ substantially in content, layout, or length:

- different notation for different instruments
- a conductor score with rehearsal annotations that players should not see
- an electronics part showing control data rather than musical notation
- parts at different zoom levels or page sizes
- simplified parts for less experienced performers

### Authoring

Each file is a standard Inkscape SVG. All the usual cue syntax works identically — cues are embedded in element IDs just as in `score.svg`. The scrolling playhead, transport, timing, and synchronisation all work the same regardless of which score file is loaded.

One important consideration: if you use cue IDs that reference specific elements (e.g. `nav(scroll@A)`), the rehearsal marks referenced must exist in the currently loaded score file for that performer. If mark **A** exists in `score.svg` but not in `score-part-violin.svg`, navigation cues targeting it will not work for a performer who has selected the violin part.

### Performer Selection

Each performer selects their score file in **Preferences > Parts > Score**. The selection is stored in the browser's `localStorage` and takes effect on the next project load. This means each performer on a different device (or browser) can independently choose which score file they see, while all remaining synchronised via the shared transport.

---

## Approach 2: Stacked Layers

A single `score.svg` contains all parts as Inkscape layers. Each performer can highlight their own layer and dim the others.

```text
score.svg
├── [layer] part-violin
├── [layer] part-viola
├── [layer] part-cello
├── [layer] shared-notation       ← always visible (no "part" in name)
└── [layer] background            ← always visible (no "part" in name)
```

### Naming Convention

Oscilla scans Inkscape layers (groups with `inkscape:groupmode="layer"`) and includes only those whose label contains the word **part** (case-insensitive). Layers without "part" in their name are always visible to all performers and are not affected by the filter.

This means you can freely mix filterable and non-filterable layers:

| Layer Name | Filterable? | Why |
|---|---|---|
| part-violin | Yes | contains "part" |
| part-cello | Yes | contains "part" |
| conductor-part | Yes | contains "part" |
| shared-notation | No | no "part" in name |
| background | No | no "part" in name |
| grid | No | no "part" in name |

### Creating Layers in Inkscape

1. Open `score.svg` in Inkscape
2. Open the Layers dialog: **Layer > Layers...** (or Shift+Ctrl+L)
3. Create a layer for each part, naming it with "part" in the name
4. Draw each instrument's notation on its own layer
5. Put shared elements (barlines, rehearsal marks, time signatures, background) on a layer without "part" in the name
6. Save

### When to Use Layers

Layers work well when parts share the same horizontal timeline and general layout but differ in vertical content:

- ensemble scores where all parts scroll at the same speed
- scores where performers benefit from seeing each other's parts in context
- pieces where the spatial relationship between parts is meaningful
- situations where you want a single file to maintain

### Performer Selection

Each performer selects their layer in **Preferences > Parts > My Part**. The **Other Parts** slider controls how visible the remaining part layers are (0% = invisible, 100% = fully visible). The default is 15% — enough to see the shape of other parts without them dominating the view.

Like score file selection, layer preferences are stored per-browser and apply immediately.

---

## Combining Both Approaches

A project can use both methods simultaneously. For example:

```text
myProject/
├── score.svg                  # full score with all layers
│   ├── [layer] part-violin-I
│   ├── [layer] part-violin-II
│   ├── [layer] part-viola
│   └── [layer] shared
├── score-part-cello.svg       # cello has its own score entirely
├── score-conductor.svg        # conductor view with annotations
└── preferences.json
```

Here the string players share a layered score (each highlighting their own part), while the cellist and conductor each have dedicated score files.

The Parts tab in preferences adapts to what is available: if multiple score files exist, it shows the Score dropdown. If the currently loaded score contains layers with "part" in the name, it shows the layer filter controls. If both are present, both controls appear.

---

## View Modes

The **Default View** setting in **Preferences > Settings** interacts with parts:

| Mode | Behaviour |
|---|---|
| **hybrid** (default) | Loads the selected score file for scrolling. Page navigation also available via cues or the mode toggle. |
| **scroll** | Same as hybrid. Score file is required. |
| **page** | Starts in page mode. If a score file exists, the mode toggle allows switching to scroll view. If no `score*.svg` files exist, pure page mode with no scroll option. |

In hybrid and scroll modes, the selected score file determines what scrolls. In page mode, score file selection is irrelevant unless the performer switches to scroll view.

---

## Project Structure Summary

```text
myProject/
├── score.svg                  # main scrolling score (required for scroll/hybrid)
├── score-part-*.svg           # optional per-performer score files
├── preferences.json           # project settings
├── pages/                     # page-mode SVGs (optional)
│   ├── home.svg
│   └── section-a.svg
├── audio/                     # audio files (optional)
├── texts/                     # text cue content (optional)
└── videos/                    # video files (optional)
```

---

## Quick Reference

| What you want | What to do |
|---|---|
| Different notation per instrument | Create separate `score-part-*.svg` files |
| Same notation, highlight own part | Use Inkscape layers with "part" in the name |
| Both | Combine: layers inside score files, plus separate files for very different parts |
| Shared elements visible to all | Put them on a layer without "part" in the name |
| Performer chooses their part | Each performer opens Preferences > Parts |
| Settings persist across sessions | Automatic — stored in browser localStorage |
| Settings sync across devices | They do not — each browser has its own selection, which is the intended behaviour |
