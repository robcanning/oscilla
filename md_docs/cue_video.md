## `cue:video` (Concise Reference)

**Purpose:** Spawn and control HTML5 video overlays during a score.

**Required**
- `file:` Filename with optional extension (`.mp4` default if missing). Supports `mp4|webm|ogg`.

**Placement & Positioning**
- `location:` `fixed` (default) | `scroll`
  - `fixed` → pinned to viewport.
  - `scroll` → follows target/score scroll.
- `target:` `<elementId>` — centers the video on the target (if not fullscreen).
- `offsetX:` / `offsetY:` pixel offsets applied after centering.

**Size**
- `size:` 
  - `fs` or `fullscreen` → covers viewport at `(0,0)` with `100vw×100vh` and **passes clicks through** by default.
  - `<W>` (e.g. `640`) → width in px, auto height.
  - `<W>x<H>` (e.g. `640x360`).

**Audio (Default Muted)**
- `audio:` `0|1|true|false` — **default is muted**. Set `audio:1` (or `true`) to unmute.

**Spawning / Reuse**
- By default, cues **reuse** an existing video matching the same `file + target`.
- `uid:` `<string>` or `new:1` → **force a new concurrent instance** (even if one exists).
- Every instance receives `data-uid` for tracking; `data-key` = `file_target`.

**Timing & Playback**
- `in:` seconds (seek start)
- `out:` seconds (optional fade-out scheduling; pairs well with `fadeOut`)
- `hold:` seconds (auto-remove after this duration, regardless of loop)
- `loop:` `0` = infinite; `N` = loop count; omit = play once
- `speed:` playback rate (e.g. `0.5`, `1.25`)
- `opacity:` `0..1` (default `1`)
- `fadeIn:` seconds; `fadeOut:` seconds

**Interaction**
- **Fullscreen (`size:fs`)**: uses `pointer-events:none` so the score behind remains draggable/clickable.
  - Add `clickable:1` to allow clicks **on** the fullscreen video (e.g., to close on click).
- Non-fullscreen videos remain clickable; single-click removes them by default.

**Removal**
- Ends when:
  - playback completes (no loop) **or**
  - `loop` count is reached **or**
  - `hold` expires **or**
  - user clicks (non-fs) / double-click overlay (if you implement) / explicit cue cleanup.

---

### Examples

1. **Fullscreen, pass-through clicks, but allow click-to-close**
   ```
   cue:video(file:intro.mp4,size:fs,clickable:1,audio:1,fadeIn:0.5)
   ```

2. **Windowed, anchored to a target, follows scroll, infinite loop**
   ```
   cue:video(file:clip.webm,target:markerA,location:scroll,size:640x360,loop:0,opacity:0.9)
   ```

3. **Spawn a second independent instance via `uid`**
   ```
   cue:video(file:cam.mp4,uid:stageLeft,in:5,fadeIn:1,fadeOut:1,hold:20)
   ```

4. **Force new instance without specifying uid**
   ```
   cue:video(file:teaser.mp4,new:1,in:2,out:10,fadeIn:0.5,fadeOut:0.5,speed:1.25)
   ```

> **Note:** `size:fs` always positions at `(0,0)` and ignores target geometry; all other sizes center on `target` (or the cue position) with optional `offsetX/offsetY`. Default audio is muted; use `audio:1` to unmute. By default, same `file+target` cues reuse the existing element unless `uid` or `new:1` is supplied.
