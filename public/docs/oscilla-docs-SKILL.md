---
name: oscilla-docs
description: Create documentation pages for the Oscilla project. Use when the user asks you to write a new doc, help page, cue reference, or developer guide for Oscilla. Covers both user-facing cue documentation and developer architecture documentation. Also handles sidebar.njk updates when adding new pages.
---

# Oscilla Documentation Skill

Oscilla's docs are an Eleventy static site. Every page is a Markdown file rendered through `docs_layout.njk`. The sidebar navigation is a handwritten Nunjucks partial (`sidebar.njk`). There are two distinct doc types with different structures.

## Site Structure

```
docs/
├── _includes/
│   ├── docs_layout.njk       # Main layout (includes sidebar)
│   ├── sidebar.njk            # Navigation sidebar
│   └── landing.njk            # Landing page layout
├── getting-started/           # Onboarding docs
├── session/                   # Session layer (markers, annotations, etc.)
├── cues/                      # User-facing cue references
│   ├── cue_rotate.md
│   ├── cue_scale.md
│   └── ...
├── animation/                 # Animation cue references
│   ├── cue_scale.md
│   ├── cue_rotate.md
│   └── ...
├── control/                   # Control & interaction docs
├── tools/                     # Tools (Inkscape extension, etc.)
├── dev/                       # Developer architecture docs
│   ├── dev-sync-architecture.md
│   ├── dev-animation-observer.md
│   └── ...
├── style.css                  # Docs stylesheet
└── index.md                   # Docs landing
```

## Frontmatter (Required for ALL Pages)

Every doc page MUST have this exact frontmatter:

```yaml
---
title: Page Title Here
layout: docs_layout.njk
---
```

- `title` -- used in `<title>` tag and can be referenced in templates
- `layout` -- always `docs_layout.njk`, never anything else for doc pages

## Doc Type 1: User-Facing Cue Reference

These live in `cues/` or `animation/` and document a single DSL cue for composers/performers.

### Structure Template

```markdown
---
title: cue_name
layout: docs_layout.njk
---
# name() --- Short Description

One paragraph explaining what this cue does and when to use it.

------------------------------------------------------------------------

## BASIC FORMS

### Variant 1

    name(param:value)

### Variant 2

    name(param:value, param2:value2)

------------------------------------------------------------------------

## TRIGGERING

-   `auto` (page load / visibility)
-   `edge` (playhead collision)
-   cue activation

------------------------------------------------------------------------

## PARAMETERS

  Key          Description
  ------------ -----------------------------
  `param1`     what it controls
  `param2`     what it controls
  `uid`        animation identity
  `trig`       trigger mode
  `osc`        enable OSC (0/1)

------------------------------------------------------------------------

## BEHAVIOUR

Describe what happens at runtime. Use bullet lists for discrete behaviours.

------------------------------------------------------------------------

## OSC OUTPUT (if applicable)

### Payload format

  Field         Meaning
  ------------- -----------------------------
  `fieldName`   what it carries
  `uid`         animation UID
  `timestamp`   ms since epoch

------------------------------------------------------------------------

## EXAMPLES

    name(values:[1,2,3], dur:2)

    name(values:Pseq([0,90],inf), dur:1, osc:1)

------------------------------------------------------------------------

## Summary

-   key point 1
-   key point 2
-   key point 3
```

### Style Rules for Cue Docs

- Use indented code blocks (4 spaces), NOT fenced (triple backtick) for DSL examples
- Use pipe-less ASCII tables (Pandoc simple table style) for parameter lists
- Use `------------------------------------------------------------------------` (72 dashes) as section dividers
- Keep descriptions terse -- composers scan these during rehearsal
- Always include a BASIC FORMS section with copy-pasteable DSL syntax
- Show the simplest form first, then build complexity
- If the cue sends OSC, always document the payload fields
- End with a Summary section as a bullet list

## Doc Type 2: Developer Architecture Doc

These live in `dev/` and explain internal systems for contributors.

### Structure Template

```markdown
---
title: System Name
layout: docs_layout.njk
---
# Oscilla System Name

## Overview

One paragraph stating what this system does and why it exists.

**Core principle**: State the single most important design rule in bold.

---

## Key Terms

| Term | Definition |
|------|------------|
| `term1` | what it is |
| `term2` | what it is |

---

## How It Works

### Signal Flow / Architecture

Use ASCII diagrams for data flow:

\```
Component A ──► Component B ──► Component C
                    │
                    ▼
              Component D
\```

### Key Algorithm / Logic

Explain the core logic with code examples:

\```javascript
// Annotated code showing the critical path
function coreThing() {
    // explain each step
}
\```

---

## Integration Points

Describe where this system connects to others:
- What calls it
- What it calls
- When in the lifecycle it runs

---

## File Reference

| File | Role |
|------|------|
| `file1.js` | what it does |
| `file2.js` | what it does |

---

## Debugging

### Quick Health Check

\```javascript
// Paste-into-console diagnostic code
console.log("check something");
\```

### Common Issues

| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| thing breaks | reason | what to look at |
| other thing | reason | what to look at |
```

### Style Rules for Dev Docs

- Use fenced code blocks (triple backtick) with language tags for all code
- Use GFM pipe tables (not simple tables) for structured data
- Use `---` (3 dashes) as section dividers (not 72-dash lines)
- Always include a "Core principle" bold callout in the Overview
- Always include a Key Terms table
- Always include a File Reference table
- Always include a Debugging section with paste-into-console code
- Always include a Common Issues table
- Use ASCII box/arrow diagrams for architecture -- never Mermaid
- Code examples should be real, working snippets from the codebase
- Explain the "why" not just the "what" -- developers need design rationale

## Sidebar Updates

When creating a new doc, ALWAYS update `sidebar.njk`. The sidebar uses this structure:

```html
<nav class="sidebar" aria-label="Documentation navigation">
  <details>
    <summary>Section Name</summary>
    <ul>
      <li><a href="{{ '/path/to/page/' | url }}">Display Name</a></li>
    </ul>
  </details>
</nav>
```

### Rules

- The first `<details>` ("Getting Started") has `open` attribute; all others do not
- URL paths use Eleventy's `| url` filter
- Cue docs go in the "Cues" or "Animation" section depending on type
- Developer docs go in the "Developer" section
- Session/interaction docs go in "Session Layer"
- Control docs go in "Control & Interaction"
- Place new entries in logical order near related pages
- The sidebar drives prev/next keyboard navigation (arrow keys), so ordering matters

### Adding a New Developer Doc

```html
<!-- In the Developer <details> section -->
<li><a href="{{ '/dev/dev-my-new-system/' | url }}">My New System</a></li>
```

The filename should be `dev-my-new-system.md` in the `dev/` directory.

### Adding a New Cue Doc

```html
<!-- In the Cues or Animation <details> section -->
<li><a href="{{ '/cues/cue_myNewCue/' | url }}">myNewCue()</a></li>
```

Cue entries in the sidebar show the function-call form: `name()`.

## Naming Conventions

| Doc Type | Filename Pattern | URL Pattern | Example |
|----------|-----------------|-------------|---------|
| Cue reference | `cue_name.md` | `/cues/cue_name/` | `cue_rotate.md` |
| Animation cue | `cue_name.md` | `/animation/cue_name/` | `cue_scale.md` |
| Developer doc | `dev-system-name.md` | `/dev/dev-system-name/` | `dev-sync-architecture.md` |
| Session doc | `feature-name.md` | `/session/feature-name/` | `markers.md` |
| Getting started | `name.md` | `/getting-started/name/` | `QUICKSTART.md` |

## Checklist

Before delivering a new doc:

- [ ] Frontmatter has `title` and `layout: docs_layout.njk`
- [ ] Correct doc type structure followed (cue vs dev)
- [ ] Section dividers match type (`---` for dev, `--------...` for cue)
- [ ] Code block style matches type (indented for DSL, fenced for JS)
- [ ] Table style matches type (simple for cue params, GFM for dev)
- [ ] sidebar.njk updated with new entry in correct section
- [ ] Filename matches naming convention
- [ ] Debugging/console snippets included (dev docs)
- [ ] Examples section included (cue docs)
- [ ] File Reference table included (dev docs)
