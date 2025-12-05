# nav() — Navigation and Structural Movement

Navigates to a page, rehearsal mark, or scroll mode location.

## Syntax
```
nav(<actionOrPage>[ @ <target> ], repeats:<N>?, uid:<id>?)
```

The first argument determines the navigation behavior. It may be:
- `scroll`         = switch to scrolling mode and continue playback
- `scrollPaused`   = switch to scrolling mode but do not resume playback
- `<pagename>`     = jump directly to a page or rehearsal mark

The optional `@<target>` is used when scroll mode needs to jump to a specific place.

## Parameters
| Parameter     | Description |
|---------------|-------------|
| `actionOrPage`| `"scroll"`, `"scrollPaused"`, or a page/rehearsal name (e.g., `page3`, `Coda`) |
| `target`      | Optional rehearsal/page anchor used only with scroll modes |
| `repeats`     | Optional number of times to re-trigger a scroll jump before traversal continues |
| `uid`         | Unique cue identifier required for repeats; recommended whenever nav() may re-trigger |

## Examples
```
// direct page navigation
nav(page3)
nav(page3, uid:p3)
nav(Coda)

// scroll navigation
nav(scroll@A)
nav(scrollPaused@B)
nav(scroll)
nav(scrollPaused)

// repeatable scroll navigation
nav(scroll@G, repeats:3, uid:g1)
// jump to G three times; afterwards traversal continues normally
```

## UID rule
UID is optional unless repeats are used or multiple identical `nav()` expressions appear.
It uniquely identifies navigation state across jump cycles.

## Notes
- The performer sees only the visual cue symbol in the score.
- The microsyntax remains in the SVG id and is not shown in the visible notation.
