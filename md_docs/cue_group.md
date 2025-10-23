## cueGroup(...) — manage groups of cues or UI elements

Injects or activates predefined groups of cues, buttons, or interface elements  
defined within the SVG score. `cueGroup` is used to dynamically load reusable  
sections of the interface — such as navigation panels, menus, or overlays —  
when a page or section of the score is displayed.

### Syntax
cueGroup(<groupName>)
cueGroup(mainMenu)
cueGroup(performance)
cueGroup(instrumentA)
cueGroup(overlayControls)

sql
Copy code

### Arguments
| Argument | Description |
|-----------|-------------|
| **groupName** | The ID of a group defined in the SVG (e.g. `mainMenu`, `performance`) |
| **page** | (optional) Page context, if called within a page cue |
| **overlay** | Boolean flag determining whether the group overlays existing elements |
| **onLoad** | Optional callback to run when group is injected |

### Behavior
- `cueGroup(mainMenu)` injects the SVG group with ID `mainMenu` into the active page.  
- `cueGroup(performance)` activates a group of controls defined under `<g id="performance">`.  
- Groups are defined in the SVG by their **plain ID name** — not with `cueGroup(...)`.  
  Example:

  <g id="mainMenu">
    <rect ... />
    <text>Start</text>
  </g>

When a new page is loaded, the cue system checks for any group names requested
by cueGroup(...) and injects them automatically into the page.

Multiple groups can coexist; newly injected ones replace or overlay previous ones
depending on configuration.

All group injections and removals are synchronized across connected clients.

### Examples

cueGroup(mainMenu)
cueGroup(performance)
cueGroup(instrumentA)
cueGroup(pageOverlay)

### Notes

- Group definitions use normal SVG group IDs (e.g. <g id="mainMenu">) —
the cueGroup(<name>) syntax is used only when recalling that group.

- Each group can contain any combination of cue buttons, labels, or graphical controls.

- When a cue:page loads, the system looks for requested groups and injects them
using handleGroupCue().

- Future updates may include group-level transitions (fade in/out)
and conditional or delayed loading behavior.
