# stopwatch _(with autostart support)_

Displays a stopwatch overlay above the score.
Stopwatch overlays may show the **main stopwatch time** or create their own **independent stopwatch**.

This cue now supports **autostart**, meaning it can begin running automatically when the SVG is loaded — in both page and scroll modes — without requiring the playhead to cross.

---

### 🧭 Syntax

```
stopwatch(source:<main|new>, hold:<seconds>, scroll:<true|false>,
          offsetX:<pixels>, style:"<css rules>", trig:<auto|edge>)
```

---

### ⚙️ Arguments

| Arg | Values | Default | Behaviour |
|-----|--------|---------|-----------|
| **source** | `"main"` / `"new"` | `"main"` | Use global clock or create/reset local stopwatch |
| **hold** | seconds | `0` | When >0, overlay fades+removes at timeout |
| **scroll** | `true` / `false` | `false` | Follows scrolling score or fixed overlay |
| **offsetX** | px | `0` | X-offset from cue location |
| **style** | CSS | — | Inline CSS, use `;` separated |
| **trig** | `"auto"` / `"edge"` | `"edge"` | `auto` means autostart on load |

---

### 🪄 Behaviour

- `source:main` displays the **global** stopwatch time
- `source:new` starts (or resets) a **private timer**
- If `hold > 0`, the stopwatch fades after expiry
- If `hold = 0`, click dismisses it
- Multiple independent stopwatches can run concurrently
- Autostart requires no playhead crossing

---

## 🚀 Autostart (NEW)

Autostart activates when:

```
trig:auto
```

Example:

```
stopwatch(source:new,style:"font-size:3em;color:red",trig:auto)
```

Autostart behaviour:

- Works in **page overlay** and **scroll** modes
- Executed **after SVG and DOM are fully initialized**
- Overlay appears immediately
- Does not require playhead position
- Does not use trigger dedupe

---

### 🧪 Autostart Examples

**Main stopwatch, always visible**
```
stopwatch(source:main,style:"font-size:2.5em;",trig:auto)
```

**Independent timer with 10s hold**
```
stopwatch(source:new,hold:10,style:"font-size:2em;",trig:auto)
```

**Scrolling stopwatch**
```
stopwatch(source:new,scroll:true,trig:auto)
```

**Stylised overlay**
```
stopwatch(source:new,
          style:"font-size:4em;color:#0ff;text-shadow:0 0 5px #000;",
          trig:auto)
```

---

### 🎯 Edge-triggered Examples (non-autostart)

```
stopwatch(source:new)
stopwatch(source:main,scroll:true)
stopwatch(source:new,hold:8,offsetX:-30)
```

---

### 🎛️ Developer Notes

- Autostart runs **once**, after initialization
- Stopwatch overlay is a **DOM absolute positioned element**
- High stacking ensured using:
  ```
  div.style.zIndex = "99999"
  ```
- Autostart does not use `triggeredCues`

---

### 🚫 Known Limitations

- Overlap of multiple autostarts is a user-design choice
- Very large fonts may clip on small screens
