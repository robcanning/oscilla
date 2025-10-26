## cueNav(...) — control global navigation and playback modes

Handles mode switching, page navigation, and structural movement  
within the Oscilla score. It can toggle between scroll and page modes,  
jump to rehearsal marks, or trigger specific navigation actions such as  
pause, resume, or mode transitions. `cueNav` is the central handler used  
by after-actions (e.g. `after:mode(scroll@F)` from `cue:page`).

### Syntax
cueNav(mode(scroll))
cueNav(mode(page))
cueNav(mode(scrollPaused))
cueNav(mode(scroll@F))
cueNav(page(page2))
cueNav(jump(F))
cueNav(resume)
cueNav(pause)

### Arguments
| Argument | Description |
|-----------|-------------|
| **mode(...)** | Switch display and playback mode (`scroll`, `page`, or `scrollPaused`) |
| **page(...)** | Jump directly to a named SVG page (e.g. `page(page2)`) |
| **jump(...)** | Jump to a rehearsal mark or cue ID in scroll mode |
| **pause** | Pause global playback |
| **resume** | Resume global playback after pause or stop |
| **scroll@uid** | Combined mode change and jump to a target mark |
| **scrollPaused@uid** | Switch to scroll mode, jump to target, remain paused |

### Behavior
- `cueNav(mode(scroll))` switches the interface into scroll mode.  
- `cueNav(mode(page))` switches to page mode.  
- `cueNav(mode(scroll@F))` switches to scroll mode and jumps to rehearsal mark F.  
- `cueNav(mode(scrollPaused@F))` does the same but keeps playback paused.  
- `cueNav(page(page3))` loads a specific page directly.  
- `cueNav(pause)` pauses all synchronized playback across clients.  
- `cueNav(resume)` resumes from the last stopped or paused position.  
- All navigation and mode changes are synchronized across connected clients.  

### Examples
cueNav(mode(scroll))
cueNav(mode(scroll@A))
cueNav(mode(scrollPaused@B))
cueNav(mode(page))
cueNav(page(page1))
cueNav(jump(C))
cueNav(pause)
cueNav(resume)


### Notes
- `cueNav` commands are used internally by `cue:page` and other cues  
  to manage transitions between modes and structural sections.  
- The `@` syntax specifies a target rehearsal mark or cue ID.  
- `scrollPaused` mode allows pre-positioning the score before playback resumes.  
- All mode changes are deferred until the main container (`#scoreContainer`)  
  is ready, preventing visual or sync glitches.  
- Future extensions will include support for timed resume (e.g. `:hold(n)`)  
  and OSC-triggered navigation.
