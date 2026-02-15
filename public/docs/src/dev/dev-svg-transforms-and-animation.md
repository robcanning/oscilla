# SVG Transforms and CSS Animation in Oscilla -- Developer Guide

This document covers the interaction between SVG `transform` attributes and CSS `style.transform` in the Oscilla animation layer. This is one of the most common sources of bugs when working with animated scores, and understanding the underlying mechanics is essential for maintaining and extending cue handlers.

---

## The Core Problem

Inkscape uses the SVG `transform` attribute to position elements. When you copy/paste, drag, or group objects, Inkscape records their displacement:

```xml
<g id="rotate(values:[0,90,180], dur:2)" transform="translate(500, 300)">
  <circle cx="50" cy="50" r="40"/>
</g>
```

The circle appears at (550, 350) in the viewport. But when Oscilla's animation system sets:

```js
el.style.transform = "rotate(45deg)";
```

The CSS `style.transform` property **completely overrides** the visual effect of the SVG `transform` attribute. The browser renders the element as if it only has `rotate(45deg)` -- the translate is gone. The element jumps to (50, 50).

This is not a browser bug. It follows from how CSS and SVG transform specifications interact: when both are present, CSS `style.transform` takes precedence for rendering.


## The Wrapper Pattern

Oscilla's solution is the **animation wrapper**: a child `<g>` element inserted inside the cue target. The parent keeps its SVG `transform` (positioning), while the wrapper receives CSS `style.transform` (animation). They compose naturally through the SVG hierarchy.

### Before wrapper creation

```xml
<g id="rotate(...)" transform="translate(500, 300)">
  <circle cx="50" cy="50" r="40"/>
</g>
```

### After `ensureAnimWrapper(el)`

```xml
<g id="rotate(...)" transform="translate(500, 300)">
  <g class="oscilla-anim">
    <circle cx="50" cy="50" r="40"/>
  </g>
</g>
```

Now animation targets the inner `<g class="oscilla-anim">` and the outer element's translate is preserved.

### `ensureAnimWrapper` properties

Located in `animShared.js`, line 520.

- **Idempotent**: first call creates the wrapper and caches it on `el._oscillaAnimWrapper`. Subsequent calls return the cached wrapper immediately.
- **Groups only**: returns `el` unchanged for non-`SVGGElement` elements (circles, paths, etc. that cannot have child groups).
- **DOM check**: also finds an existing `g.oscilla-anim` child if one is already present (e.g. from a previous initialization cycle).
- **Safe to call multiple times**: from `handleRotateCue` (initial value), from `handleRotateSequence` (runtime), from other handlers -- all get the same wrapper.


## How Each Cue Handler Manages Transforms

### rotate.js

**Continuous mode** (no `values:[]` array): Uses the wrapper correctly. `ensureAnimWrapper(el)` returns `animEl`, pivot is applied to `animEl`, anime.js targets `animEl`.

**Sequence mode** (`values:[0, 90, 180]`): Now also uses the wrapper. Creates wrapper before pivot, all `style.transform` writes target `wrapper`, not `el`. Initial value setting in `handleRotateCue` also targets the wrapper.

### scale.js

Same pattern as rotate.js. Both continuous and sequence modes use the wrapper. Initial scale values are applied to the wrapper via `scaleWrapper`.

### o2p.js (object-to-path)

Has its **own parallel wrapper system**: `ensureO2PWrapper(el)` creates a `<g class="oscilla-o2p-anim">` child. This is separate from the shared `ensureAnimWrapper` because o2p uses SVG `setAttribute("transform", ...)` rather than CSS `style.transform`:

```js
// o2p.js line 386
wrapper.setAttribute("transform", t);
// line 388 comment: "DO NOT touch style.transform -- that's for CSS animations"
```

This means o2p and rotate/scale can coexist on the same element hierarchy without conflicts. The o2p wrapper uses SVG attribute transforms while rotate/scale use CSS style transforms.

### color.js

No transform interaction. Only sets `style.fill` and `style.stroke`. Safe.

### fade.js

No transform interaction. Only sets `style.opacity`. Safe.

### text.js

Uses `style.transform` only on **HTML overlay layers** (div elements), not on SVG groups. No conflict with SVG positioning.

### preProcessDrag.js

Uses `el.setAttribute("transform", ...)` on the **outer** `<g>` element for drag displacement. Explicitly documented to coexist with animation wrappers:

```
TRANSFORM COEXISTENCE
Drag applies translate() on the OUTER <g> element.
Animations (scale, rotate, o2p) work on the INNER .oscilla-anim
wrapper created by ensureAnimWrapper(). No conflicts.
```

The drag system captures the element's original `transform` attribute (from Inkscape) at init time and composes drag offsets on top of it, handling `translate()`, `matrix()`, and all other SVG transform forms correctly. See the "Inkscape `matrix()` vs `translate()`" section for details.

### animation.js

Pure dispatch/registry layer. Calls individual handlers, does not manipulate transforms.


## The Transform Hierarchy

For a fully-loaded element with drag + animation + o2p, the nesting looks like:

```xml
<g transform="translate(dragX, dragY)">           <!-- drag layer (SVG attr) -->
  <g id="rotate(...)" transform="translate(inkX, inkY)">  <!-- Inkscape position (SVG attr) -->
    <g class="oscilla-anim" style="transform: rotate(45deg)">  <!-- rotate/scale (CSS) -->
      <g class="oscilla-o2p-anim" transform="translate(tx,ty) rotate(a,cx,cy)">  <!-- o2p (SVG attr) -->
        <circle cx="50" cy="50" r="40"/>
      </g>
    </g>
  </g>
</g>
```

Each layer is independent. Removing or changing one does not affect the others. This is the key architectural principle.


## The Initialization Pipeline

From `SVGInit.js`:

```
initializeSVG(svgElement)
  -> settleDomForPropagate()      // wait for layout
  -> propagate(svgElement)         // expand propagate() macros
  -> cleanupDrag()                 // remove old drag handlers
  -> preProcessDrag(svgElement)    // strip drag() tokens, attach handlers
  -> initializeScrollMode() or initializePageMode()
    -> registerReuseBlocks()       // register reuse(name) blocks
    -> storePathVariants()         // cache path data
    -> animationAssign(svgElement) // scan IDs, call cue handlers
    -> assignCues(svgElement)      // register edge-triggered cues
```

There is **no transform preprocessing step** in this pipeline. No stripping, no baking, no normalization of Inkscape transforms. The wrapper pattern handles the separation at runtime instead.


## Rules for Writing New Cue Handlers

If your new handler needs to set `style.transform` on an SVG element:

1. **Always use the wrapper pattern.** Call `ensureAnimWrapper(el)` to get the inner `<g>`, and write `style.transform` to that wrapper, never to `el` directly.

2. **Apply pivot/transform-origin to the wrapper**, not to `el`. The pivot needs to be in the wrapper's coordinate space.

3. **Initial values go on the wrapper too.** If you set an initial transform before animation starts (e.g. `rotate(0deg)` or `scale(1,1)`), that write must also target the wrapper.

4. **Read current values from the wrapper.** If you need to read `getCurrentAngle()` or similar, pass the wrapper, not `el`.

5. **Never use `el.setAttribute("transform", ...)` for CSS-style animations.** SVG attribute transforms and CSS style transforms are separate systems. Use one or the other per element, not both. The o2p handler uses SVG attributes because it needs `rotate(angle, cx, cy)` syntax which CSS `style.transform` does not support.

6. **If you need both rotation-around-point AND CSS animation**, use nested wrappers (like o2p does with `oscilla-o2p-anim` inside `oscilla-anim`).

### Template

```js
import { ensureAnimWrapper } from "./animShared.js";

export function handleMyNewCue(el, args, options = {}) {
    // ... parse config ...

    const wrapper = ensureAnimWrapper(el);

    // Set initial state on wrapper, not el
    wrapper.style.transform = "...initial...";

    // Set pivot on wrapper, not el
    wrapper.style.transformOrigin = "50% 50%";

    // Animate wrapper, not el
    anime({
        targets: wrapper,
        // ...
        update: () => {
            wrapper.style.transform = `...animated...`;
        }
    });
}
```


## Common Mistakes

### Writing `style.transform` directly on the cue element

```js
// WRONG -- overrides Inkscape translate
el.style.transform = `rotate(${angle}deg)`;

// CORRECT -- preserves parent positioning
const wrapper = ensureAnimWrapper(el);
wrapper.style.transform = `rotate(${angle}deg)`;
```

### Creating the wrapper after setting pivot

```js
// WRONG -- pivot is on el, but animation is on wrapper
applySvgPivot(el);
const wrapper = ensureAnimWrapper(el);
wrapper.style.transform = ...;

// CORRECT -- pivot and animation both on wrapper
const wrapper = ensureAnimWrapper(el);
applySvgPivot(wrapper);
wrapper.style.transform = ...;
```

### Forgetting initial value setting

The cue handler function (e.g. `handleRotateCue`) often sets an initial transform before the sequence engine calls the sequence handler. Both writes must target the wrapper:

```js
// In handleRotateCue (registration phase):
const initWrapper = ensureAnimWrapper(el);
initWrapper.style.transform = `rotate(${angle}deg)`;

// In handleRotateSequence (execution phase):
const wrapper = ensureAnimWrapper(el);  // returns same wrapper
wrapper.style.transform = `rotate(${newAngle}deg)`;
```


## svg-path-commander: Status and Future

`svg-path-commander` (v2.1.10) is loaded via `<script>` tag in `index.html` as `window.SVGPathCommander`. It is **not called anywhere in the codebase** and can be safely removed.

It was originally intended for "baking" SVG transforms into path geometry (rewriting `d` attributes so that `transform` attributes become unnecessary). This would be an alternative approach to the wrapper pattern: instead of separating positioning from animation via nesting, you would eliminate positioning transforms entirely by absorbing them into the geometry.

The wrapper pattern has proven more practical for Oscilla because:

- It works with all SVG element types (groups, circles, rects), not just paths
- It does not require modifying authored SVG content
- It composes cleanly with drag, o2p, and multi-cue elements
- It is reversible (remove the wrapper and the original structure is intact)

If `svg-path-commander` is not needed for other purposes, removing it from `index.html` eliminates ~37KB of unused JavaScript.

### To remove

Delete the script tag from `index.html`:

```html
<!-- REMOVE THIS LINE -->
<script src="js/vendor/svg-path-commander.js"></script>
```

And optionally delete the file `js/vendor/svg-path-commander.js`.


## Transform Utilities in utils.js

The codebase includes several transform-related utilities that are used by the reuse/clone system, not by animation handlers:

- `stripAllTransforms(root)` -- recursively removes all `transform` attributes. Used by `preProcessReuse.js` when cloning reuse blocks to prevent double-transforms.
- `stripRootTransform(root)` -- removes only the root element's `transform`. Used for selective cleanup.
- `alignCloneAtPlaceholder_TopLeft(clone, placeholder)` -- uses screen-space math (`getBoundingClientRect`) to position a clone at a placeholder's visual location.

These serve a different purpose from the animation wrapper system. They handle the reuse block pipeline where cloned SVG fragments need to be repositioned without carrying their source transforms. The two systems do not conflict.


## Coordinate Space Mismatches: `getScreenCTM` on Root vs Element

A second class of transform bug involves pointer-to-SVG coordinate conversion. When converting screen/client coordinates to SVG space for drag interactions, the choice of which element's CTM you use determines which coordinate space you land in.

### The bug pattern

```js
// WRONG -- converts to root SVG space
const ctm = svg.getScreenCTM();
const inverse = ctm.inverse();
const svgPt = pt.matrixTransform(inverse);  // root SVG coordinates

// Then compared against path-local coordinates:
const pathPt = pathEl.getPointAtLength(len);  // path-local coordinates
Math.hypot(pathPt.x - svgPt.x, pathPt.y - svgPt.y);  // MISMATCHED SPACES
```

If the path is inside a group with `matrix(1.77, 0, 0, 1.77, 521, -894)`, the root SVG coordinates and path-local coordinates differ by scale and translation. The distance calculation produces wrong results -- the fader jumps erratically because the closest-point search is comparing apples to oranges.

### The fix

Use the **path element's** CTM, not the root SVG's:

```js
// CORRECT -- converts to path's local coordinate space
const ctm = pathEl.getScreenCTM();
const inverse = ctm.inverse();
const svgPt = pt.matrixTransform(inverse);  // path-local coordinates
```

Now `svgPt` is in the same space as `pathEl.getPointAtLength()`. No scale/translate mismatch.

### Where this applies

Any code that converts pointer coordinates for comparison with SVG geometry must use the CTM of the element whose geometry it compares against:

- `o2pTouchOverlays.js` `screenToSVG()` -- fixed, uses `pathEl.getScreenCTM()`
- `initO2PRotationDragHandler` -- check for same pattern
- `preProcessDrag.js` `getSVGPoint()` -- uses `svg.getScreenCTM()` for computing drag deltas. This is a related issue when draggable elements are inside scaled groups, but the symptom is different (drag sensitivity is scaled rather than erratic jumping).

### General rule

`el.getScreenCTM()` gives you the full transformation chain from `el`'s local coordinate space to screen pixels. Its inverse converts screen pixels back to `el`'s local space. Always match the CTM to the coordinate space you need.


## Debugging Checklist

When an animated element jumps from its expected position:

1. **Check the SVG source.** Does the element or any ancestor have a `transform` attribute? It might be `translate(x,y)` or `matrix(a,b,c,d,e,f)`. Inkscape uses `matrix` form after rotations, certain group operations, and sometimes after simple moves depending on the version. Open browser DevTools, inspect the element, look at the attribute.

2. **Check `style.transform`.** Is anything writing `style.transform` directly on the element with the `transform` attribute? Search for `el.style.transform` in the relevant handler.

3. **Check wrapper creation.** Is `ensureAnimWrapper` being called? Is the returned wrapper actually being used for animation, or is the code still writing to `el`?

4. **Check pivot target.** Is `applySvgPivot` being called on the wrapper or on `el`? If on `el`, the pivot will be in the wrong coordinate space after the wrapper absorbs the children.

5. **Check propagate expansion.** If the element is inside a `propagate()` group, the parent's transform may be inherited by children in unexpected ways. Inspect the DOM after propagate runs to see the actual structure.

6. **Check nesting order.** If both rotate/scale and o2p are active on the same element, verify the wrapper hierarchy is correct: `oscilla-anim` should contain `oscilla-o2p-anim`, not the reverse.

7. **Check coordinate space in drag handlers.** If a draggable/touchable element inside a transformed group behaves erratically, check whether `screenToSVG` or similar conversion uses `svg.getScreenCTM()` (root space) vs `targetEl.getScreenCTM()` (local space). They must match the space that `getPointAtLength()` or `getBBox()` returns.


## Inkscape `matrix()` vs `translate()` Transforms

Inkscape writes element positions using two forms interchangeably:

```xml
<!-- Simple displacement -->
<g transform="translate(500, 300)">

<!-- Same displacement as matrix -->
<g transform="matrix(1,0,0,1,500,300)">

<!-- Displacement + rotation (45 degrees) -->
<g transform="matrix(0.7071,-0.7071,0.7071,0.7071,500,300)">
```

The `matrix(a,b,c,d,e,f)` form encodes translate, rotate, scale, and skew in a single 2x3 affine matrix. Inkscape uses it after rotating elements, after certain group operations, and sometimes after simple moves depending on the version. You cannot predict which form Inkscape will use.

### The wrapper pattern handles both forms

The wrapper approach is entirely transform-type agnostic. It never reads, parses, or modifies the parent's `transform` attribute. It does not matter whether the parent has `translate(...)`, `matrix(...)`, or a chain of multiple transforms. The parent positions the group in SVG space; the inner wrapper animates within that positioned space. They compose through the SVG hierarchy.

Key functions that are also agnostic:

- `applySvgPivot(el)` uses `el.getBBox()`, which returns coordinates in the element's **local** coordinate space. It does not read the `transform` attribute.
- `getCurrentAngle(el)` reads `el.style.transform` (CSS), not the SVG `transform` attribute. It only looks for CSS rotate values.
- `captureOriginalCenter(wrapper)` in o2p.js uses `wrapper.getBBox()` -- same local-space approach.
- `ensureAnimWrapper(el)` does not touch any transform attributes.

### Drag system: base transform preservation

`preProcessDrag.js` composes drag offsets with the element's original Inkscape transform. At init time, `attachDrag` captures the element's `transform` attribute string into `el._dragBaseTransform`. The `applyTranslate` function then always writes `translate(dx, dy) {baseTransform}` -- no regex stripping, no transform-type assumptions. This correctly handles `translate()`, `matrix()`, chained transforms, and empty transforms uniformly.

Previously, `applyTranslate` used a regex to strip `translate(...)` tokens, which destroyed Inkscape's authored positioning (the `translate` case) while accidentally working for `matrix()` form (where the regex didn't match). See the fix details above.

### Fixed: drag + authored transforms

`preProcessDrag.js` previously used a regex to strip `translate(...)` tokens from the element's transform string before prepending the drag offset:

```js
// OLD (broken) — stripped Inkscape's authored translate
const withoutTranslate = current
    .replace(/translate\([^)]*\)\s*/g, "")
    .trim();
```

This had two problems. For `translate()` form, it destroyed the Inkscape-authored positioning -- the element jumped to near-origin on first drag. For `matrix()` form, the regex didn't match, so the matrix was preserved and drag accidentally composed correctly.

The fix captures the element's original `transform` attribute once in `attachDrag` (stored on `el._dragBaseTransform`), then always writes `translate(dx, dy) {base}` without any stripping. This works uniformly for `translate()`, `matrix()`, chained transforms, or no transform at all. On reset (dx=0, dy=0), just the base transform is written back, restoring the authored position.

Cleanup in `cleanupDrag` deletes `el._dragBaseTransform` so a fresh `attachDrag` on the same element re-captures correctly.
