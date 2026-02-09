---
title: parts-layers
layout: docs_layout.njk
---
## Parts & Layers -- per-performer layer filtering

Allows each performer to select their own instrumental part from the
Inkscape layers in a score, dimming other parts to a configurable opacity.
This is a client-side, per-browser preference -- each device remembers its
own part selection independently.

### Authoring in Inkscape

Organise your score using Inkscape's layer system. Each layer represents
one instrumental part or section of the ensemble. Layer names become the
labels shown in the Oscilla preferences dialog.

```
Layer panel in Inkscape:

  Part 1 Violin    <-- inkscape:label="Part 1 Violin"
  Part 2 Viola     <-- inkscape:label="Part 2 Viola"
  Part 3 Cello     <-- inkscape:label="Part 3 Cello"
  Shared            <-- shared notation, always visible
```

Each layer corresponds to a `<g>` element in the SVG with Inkscape's
layer attributes:

```xml
<g inkscape:groupmode="layer"
   inkscape:label="Part 1 Violin"
   id="layer1">
  <!-- score content for violin -->
</g>
```

### Layer detection

When a score is loaded, Oscilla scans the SVG for all `<g>` elements
with `inkscape:groupmode="layer"` and reads their `inkscape:label`
attribute. These are stored in `window.scoreLayers` and used to populate
the preferences UI. Only top-level Inkscape layers are detected --
sublayers and plain `<g>` groups are ignored.

### Preferences UI

The "Parts" section appears automatically in the Preferences dialog
when a score contains Inkscape layers. It provides two controls:

| Control | Description |
|---------|-------------|
| **My Part** | Dropdown listing all detected layers, plus "All (no filter)" |
| **Other Parts** | Opacity slider (0--100%) for non-selected layers |

Changes apply immediately as a live preview. The setting is also saved
when the Preferences dialog Save button is pressed.

### Behavior

- Selecting a part sets that layer to full opacity and all other layers
  to the configured "Other Parts" opacity.
- When a part is selected, all layers are forced to `display:inline`,
  overriding any Inkscape visibility state. This ensures hidden layers
  become visible (at reduced opacity) so the performer sees the full
  score context.
- Selecting "All (no filter)" restores all layers to their authored
  visibility and clears any opacity overrides.
- The opacity slider at 0% fully hides other parts. At 100% all parts
  are equally visible (useful for rehearsal or conducting).

### Storage

Layer filter preferences are stored in `localStorage`, keyed per project:

```
oscilla_layerFilter_<projectName>
```

This means each browser or device maintains its own part selection.
A violinist's tablet remembers "Part 1 Violin" while the cellist's
tablet remembers "Part 3 Cello", even when viewing the same score.

The preference is not saved to `preferences.json` on the server and
does not affect other connected clients.

### Authoring tips

- Use clear, descriptive layer names in Inkscape -- these appear directly
  in the dropdown (e.g. "Violin I" rather than "layer1").
- Place shared notation (rehearsal marks, structural cues, tempo markings)
  on a dedicated layer so performers always see it regardless of their
  part selection.
- Layer ordering in Inkscape determines rendering order in the SVG.
  Place shared/background layers below part layers.
- Cue elements (animations, navigation, audio triggers) work normally
  regardless of layer filtering -- opacity changes are purely visual.
- If a layer is hidden in Inkscape (`display:none`), it will remain
  hidden until a performer actively selects a part, at which point all
  layers become visible at their respective opacities.

### Technical details

The feature is implemented in `layerFilter.js` with integration points
in `projectLoader.js` (layer scanning on score load) and
`oscillaPreferences.js` (UI section in preferences dialog).

Layer detection uses both namespace-aware attribute access
(`getAttributeNS`) and a plain attribute fallback
(`getAttribute("inkscape:groupmode")`) to handle differences in how
browsers resolve XML namespaces when SVG is embedded in an HTML document.

### Notes

- Only Inkscape layers are detected. Plain SVG `<g>` groups without
  `inkscape:groupmode="layer"` are not affected by the filter.
- The filter applies to scroll mode. Page mode loads individual SVG
  files which may have their own layer structure.
- All animations, cue triggers, and OSC output continue to function
  normally on filtered layers -- the filter only affects visual opacity.
