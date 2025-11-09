# Reusable Blocks with `use(name)`

`use(name)` allows you to define a visual or interactive structure once and reuse it anywhere in the score or on any page. This avoids copy/paste in Inkscape and keeps layouts consistent.

## Defining a Reusable Block

Any SVG group whose ID begins with:

```
reuse-
```

is treated as a reusable block.

Example:

```svg
<g id="reuse-mainMenu">
   <!-- Buttons, text, shapes, animations -->
</g>
```

This block is registered automatically when its SVG is loaded.

---

## Using the Block Elsewhere

To insert the reusable block somewhere else, place a placeholder group:

```svg
<g id="use(mainMenu)"></g>
```

When the score initializes, the placeholder is replaced with a cloned instance of the reusable block, preserving:

- cueButtons
- cueText elements
- animations and object-followers
- internal transforms and visual structure

The placeholder itself is removed.

---

## Placement Modes

There are two placement modes depending on how `use()` is written:

| Syntax                | Placement Behaviour |
|----------------------|--------------------|
| `use(name)`          | Inserts the block at **its original authored coordinates** (as designed in its source SVG). |
| `use(name)@self`     | Inserts the block **at the location of the placeholder**, inheriting the placeholder’s transform. |

### Example (`@self` Placement)

```svg
<g transform="translate(300,200)">
  <g id="use(mainMenu)@self"></g>
</g>
```

Result: `mainMenu` appears exactly at `(300,200)`.

---

## Behaviour and Guarantees

- The injected block receives **unique IDs** to avoid collisions.
- The placeholder `<g id="use(...)" />` is **removed** automatically.
- Reusable blocks can be defined in **any SVG inside `/pages/`**.
- All internal behaviour is preserved, including:
  - cue triggers
  - animations (rotate, scale, obj2path)
  - cue buttons and overlays

---

## Summary

Define once:

```svg
<g id="reuse-name">…</g>
```

Use anywhere:

```svg
<g id="use(name)"></g>
```

Or place at placeholder position:

```svg
<g id="use(name)@self"></g>
```

This system keeps Oscilla scores modular, clean, and visually authored directly in Inkscape—no handwritten layout code required.
