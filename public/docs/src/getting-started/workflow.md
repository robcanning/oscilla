---

title: workflow
layout: docs_layout.njk
-----------------------

# Workflow

This page describes the current OscillaScore workflow, including **creating, loading, saving, and sharing projects**. It reflects the newer project lifecycle tools available from the UI (New Project, Save As, Import / Export).

The core idea remains the same: **draw in Inkscape, perform in the browser**, but project management is now handled explicitly by Oscilla.

---

## 1. Projects and Project Structure

All Oscilla projects live inside:

```
public/scores/
```

Each project is a self-contained folder. At minimum, a project contains:

```
myProject/
└── score.svg
```

This is enough for a project to load and run.

A typical project created by Oscilla looks like:

```text
myProject/
├── score.svg                # main scrolling or hybrid score
├── preferences.json         # project preferences (auto-generated)
├── pages/                   # optional page-mode SVGs
├── audio/                   # optional local audio files
├── texts/                   # optional external text cues
└── videos/                  # optional local video files
```

You normally do **not** create this structure by hand anymore — Oscilla does it for you.

---

## 2. Creating a New Project

### Recommended method (UI)

1. Open Oscilla in your browser:

```
http://localhost:8001
```

2. Open the **hamburger menu** (top-right)
3. Choose:

```
File → New Project…
```

4. Enter a project name

Oscilla will:

* create a new project folder inside `public/scores/`
* copy the **project template** (including `score.svg` and helper files)
* load the project automatically

After creation, Oscilla shows a short hint explaining where the score file lives on disk and that it should be edited in Inkscape.

---

## 3. Editing the Score in Inkscape

Oscilla does not provide a built-in score editor. **Inkscape is the primary authoring tool.**

1. Open Inkscape
2. Open:

```
public/scores/myProject/score.svg
```

3. Draw shapes, text, paths, and layout the score visually
4. Save the file

Refresh the browser and the changes appear immediately.

### Page size conventions

Oscilla expects specific page dimensions depending on score type:

| Score Type | Width    | Height | Use Case                         |
| ---------- | -------- | ------ | -------------------------------- |
| Scrolling  | ~40000px | 1024px | Continuous horizontal scores     |
| Paged      | 1366px   | 1024px | Discrete pages (tablet-friendly) |

Set this in Inkscape via:

**File → Document Properties → Page Size**

Notes:

* 1024px height is optimized for tablet landscape display
* For scrolling scores, width directly affects playback duration
* Playback speed can be adjusted in `preferences.json`

---

## 4. Adding Behaviour Using IDs

Behaviour is encoded by editing SVG element IDs (via the XML Editor):

* **Ctrl + Shift + X** (Inkscape)

Examples:

* `pause(dur:12, count:true)`
* `audio(file:intro_theme.wav)`
* `o2p(path:p01)`
* `scale([1,1.3,1])`

### Using the Oscilla Inkscape Extension (recommended)

Editing complex IDs manually can be error‑prone. Oscilla therefore provides an **Inkscape extension** that makes working with cue and animation IDs significantly easier.

The extension:

* provides structured input fields instead of raw text editing
* helps avoid syntax errors
* exposes common cue and animation parameters
* speeds up authoring for larger or more complex scores

The extension is **optional**, but strongly recommended for regular use.

Documentation and installation instructions:

[https://robcanning.github.io/oscilla/docs/inkscape_extension/](https://robcanning.github.io/oscilla/docs/inkscape_extension/)

You can freely mix workflows:

* use the extension for most edits
* fine‑tune or experiment directly in the XML editor when needed

---

## 5. Opening and Switching Projects

You can open projects in several ways.

### From the loader

1. Visit:

```
http://localhost:8001
```

2. Select a project from the loader dialog

### Direct URL

```
http://localhost:8001/?project=myProject
```

### From the menu

Use:

```
File → Projects
```

to switch between existing projects without restarting the server.

---

## 6. Saving and Duplicating Projects

### Save As

Use:

```
File → Save Project As…
```

This:

* duplicates the current project
* assigns a new project name
* preserves all SVGs, media, and preferences

The new project is loaded automatically.

This is the recommended way to create variations or rehearsal versions.

---

## 7. Exporting and Importing Projects (.oscilla)

Oscilla supports bundling a complete project into a single file for sharing.

### Export

```
File → Export Project (.oscilla)
```

This creates a `.oscilla` file containing:

* `score.svg`
* `preferences.json`
* pages, audio, texts, and videos (if present)

You can send this file to collaborators or archive it.

### Import

```
File → Import Project (.oscilla)
```

When importing:

* you choose a **new project name**
* the project is unpacked into `public/scores/`
* the project is loaded automatically

This allows projects to be shared without manually copying folders.

---

## 8. Iteration Loop (Typical Use)

In practice, work looks like this:

1. Edit `score.svg` in Inkscape
2. Save
3. Refresh the browser
4. Test cues, timing, and layout
5. Repeat

Oscilla never locks files — the filesystem is always the source of truth.

---

## 9. Rehearsal and Performance

For rehearsal and performance:

* open the same project on all devices
* use cues for timing and navigation
* optionally synchronize multiple clients

Each performer reads from the same authored score, rendered locally in their browser.

---

## Summary

* Projects are **folders**, not opaque files
* Inkscape is the **authoring environment**
* Oscilla handles **loading, duplication, import/export, and playback**
* `.oscilla` files are for **sharing and archiving**, not daily editing

This separation keeps the system transparent, hackable, and robust.
