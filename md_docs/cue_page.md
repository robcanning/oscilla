## cue:page(...) — navigate pages or scrolling positions in the score

Triggers navigation between SVG score pages or scroll positions.  
The cue can load a single page, sequence multiple pages, loop sections,  
choose randomly from options, randomize order, or define composite playlists
using the `seq:` prefix. It forms the structural backbone for cue-based
navigation and timeline control in Oscilla scores.

### Syntax
```
cue:page(<pageId>)
cue:page(loop(<page1>:<dur>,<page2>:<dur>){x:<count>})
cue:page(choose(<pageA>,<pageB>,<pageC>))
cue:page(rand(<page1>,<page2>){x:<count>})
cue:page(seq:<playlist>)
cue:page(seq:<page1>:<dur>, mode:<scroll|page>@<uid>)
```

### Arguments
| Argument | Description |
|-----------|-------------|
| **page**     | ID of a single page or scroll section to load |
| **loop(...)**| repeat a group of pages sequentially for a given number of cycles |
| **choose(...)** | randomly select one page from a defined list (per trigger) |
| **rand(...)**   | randomize the order of a group of pages across cycles |
| **seq:**    | define a composite sequence combining page, loop, choose, and rand groups |
| **x**       | repeat count for loops or random sequences (`x:0` = infinite) |
| **mode**    | switch playback display mode — usually `mode:scroll` or `mode:page` |
| **@uid**    | jump target — reference a rehearsal mark or cue ID to jump to after sequence completes |
| **:<dur>**  | optional colon-suffixed duration for a page (in seconds) |
| **control** | playback control command, e.g. `mode:scroll`, `mode:page` |
| **target**  | optional page or object ID to control directly |

### Behavior
- `cue:page(page1)` jumps immediately to a single page or scroll position.  
- `cue:page(loop(page1:2,page2:2){x:3})` loops between pages 1 and 2 three times.  
- `cue:page(choose(page1,page2,page3))` selects one page randomly per trigger.  
- `cue:page(rand(page1,page2,page3){x:4})` randomizes order four times.  
- `cue:page(seq:...)` allows advanced combinations of loops, choices, and randomization.  
- Durations can be specified using `pageId:seconds` (e.g. `page1:5` = display for 5 seconds).  
- `mode:` switches between scroll or page playback modes.  
- `@uid` jumps to a rehearsal mark or cue with that unique ID when the sequence ends.  
- All navigation is synchronized across connected clients.

### Examples
```
cue:page(page1)
cue:page(loop(page1:2,page2:2){x:3})
cue:page(choose(page3,page4,page5))
cue:page(rand(pageA,pageB,pageC){x:2})
cue:page(seq:pageIntro:5, loop(page1:3,page2:2){x:3}, mode:scroll)
cue:page(seq:pageIntro:5, loop(page1:3,page2:2){x:3}, mode:scroll@F)
cue:page(seq:loop(page1:2,page2:2){x:2}, rand(page3,page4){x:1}, mode:page@R1)
cue:page(seq:choose(pageIntro,pageAlt), loop(pageMain:4,pageEnd:3){x:3}, mode:scroll@B)
cue:page(seq:page1:2, mode:scroll@F)
```

### Notes
- Parentheses `()` are required for grouped lists (`loop(...)`, `choose(...)`, etc.).  
- Repeat counts use braces `{x:<count>}` — comma modifiers are not supported.  
- Durations follow the page name with a colon (`page1:4` = 4 s).  
- The `@` suffix jumps to a rehearsal mark or cue ID (e.g. `@F` or `@R1`) once the sequence completes.  
- All whitespace around commas and colons is optional.
