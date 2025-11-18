# cue_propagate — Group-Level Parameter Propagation

`propagate(...)` is a pre-parser macro that expands a cue or animation template across all direct children of an SVG `<g>` element. Each child receives a unique instance of the template with independently evaluated parameters.

---

## Purpose

To apply variations of an animation or cue to *multiple similar objects* without manually writing separate IDs. Typical uses:

- evenly distributing random timing or values across many elements  
- giving each object slightly different speed, scale, rotation, or other parameters  
- generating unique `uid:` values for each item in a group  

`propagate(...)` runs **before cue/animation parsing** and rewrites child element IDs into fully expanded DSL strings.

---

## Syntax

```
propagate(
  TEMPLATE,
  ARG1,
  ARG2,
  ...
)
```

### • `TEMPLATE`
A **new-DSL animation or cue definition**, e.g.:

```
scale(values:[${1}, ${2}], mode:alternate, dur:${3}, uid:circs)
```

### • `${n}` placeholders
Inside the template, `${1}`, `${2}`, `${3}`, ... are replaced with the **evaluated values** of `ARG1`, `ARG2`, `ARG3`, etc.

Each **occurrence** is evaluated independently, allowing fresh randomisation.

---

## UID Handling

- If `uid:NAME` appears in the template → becomes `uid:NAME_0`, `uid:NAME_1`, …
- If no `uid:` is present → one is appended automatically:

```
uid:prop_GROUPINDEX_CHILDINDEX
```

Example: `uid:prop_3_2`

---

## Example

Group of 6 circles with unique scale range and timing between **1–2**:

```
propagate(
  scale(values:[${1}, ${2}], mode:alternate, dur:${3}, uid:circs),
  rnd(1,2),        // ${1}: min scale
  rnd(1,2),        // ${2}: max scale
  rnd(0.4,1.2)     // ${3}: duration
)
```

Possible expanded IDs:

```
scale(values:[1.14,1.92], mode:alternate, dur:0.66, uid:circs_0)
scale(values:[1.83,1.21], mode:alternate, dur:1.07, uid:circs_1)
scale(values:[1.05,1.99], mode:alternate, dur:0.48, uid:circs_2)
...
```

---

## Evaluation Rules

- Arguments (`ARG1`, `ARG2`, …) may contain:
  - `rnd(min,max)`
  - `rnd([a,b,c])`
  - numeric literals
  - string literals  
- Each `${n}` in the template triggers an independent evaluation of `ARGn`.

This enables effects like:

```
scale(values:[${1},${1}], dur:${2})
```

Where the two `${1}` occurrences receive **different random values**.

---

## Non-Recursive

Only **direct children** of the `<g id="propagate(...)">` are expanded.

Nested groups are left as-is unless you manually apply propagate to them.

---

## Execution Order

`propagate(svgElement)` must run **before any animation or cue parsing**, typically inside `initializeSVG()`:

```js
// Expand propagate(...) groups before parsing
propagate(svgElement);
```

If used in page overlays, it must run before `animationAssign(...)` and cue scanning.

---

## Supported Contexts

- Main score SVG
- Subpages / page mode SVG
- Cue-triggered dynamic page loads

---

## When to Use

Use `propagate(...)` when:

- you have many similar shapes needing slight variation
- you want per-object timing/scale/rotation differences
- you want a template-based param generator for groups
- you want unique uids for each instance automatically

---

## When Not to Use

Avoid propagate when:

- objects require coordinated timing (use shared seqdur instead)
- nested group structure must remain untouched
- ordering or indexing inside the SVG is unpredictable

---

## Notes

- `propagate(...)` is **not** parsed by the DSL directly.
- It is a *preprocessor* that rewrites IDs into pure DSL expressions.
- After expansion, each child is parsed as if you wrote it manually.

---

## Version Compatibility

This documentation refers to the **new Oscilla DSL (2025)** with:

- function-style cues
- named parameters
- canonical `uid:` handling
- no legacy `_uid(...)` microsyntax

---
