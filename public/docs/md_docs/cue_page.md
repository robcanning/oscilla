## cue:page(...) — navigate pages or scrolling positions in the score

Triggers navigation between SVG score pages or scroll positions.  
The cue can load a single page, sequence multiple pages, loop sections,  
choose randomly from options, randomize order, or define composite playlists
using pattern-based syntax. It forms the structural backbone for cue-based
navigation and timeline control in Oscilla scores.

### Syntax
cue:page(<pageId>)
cue:page(Pseq([<page1>:<dur>,<page2>:<dur>],<repeats>))
cue:page(Pxrand([<page1>,<page2>,<page3>],<repeats>))
cue:page(Pshuf([<page1>,<page2>,<page3>],<repeats>))
cue:page(Prand([<page1>,<page2>,<page3>],<repeats>))
cue:page(Pchoose([<page1>,<page2>,<page3>]))
cue:page(Pseq([page1:3, page2:3],1), after:mode(scroll@F))
cue:page(Pseq([Pseq([page1:2,page2:2],2),page3:4],1))

### Arguments
| Argument | Description |
|-----------|-------------|
| **page**     | ID of a single page or scroll section to load |
| **Pseq**     | sequential playback of listed pages or subpatterns |
| **Prand**    | random selection with replacement |
| **Pxrand**   | random order, reshuffled each repeat cycle |
| **Pshuf**    | random order, shuffled once and repeated as fixed order |
| **Pchoose**  | choose one random page from a list (per trigger) |
| **repeats**  | number of cycles for the pattern (`inf` = infinite) |
| **:<dur>**   | optional duration for each page (in seconds) |
| **after:**   | optional post-action (e.g. `mode(scroll@F)`) |
| **mode:**    | switch playback display mode (`scroll` or `page`) |
| **@uid**     | rehearsal mark or cue ID to jump to after sequence completes |

### Behavior
- `cue:page(page1)` jumps immediately to the given page or scroll position.  
- `cue:page(Pseq([page1:2,page2:2],3))` loops between pages 1 and 2 three times.  
- `cue:page(Prand([page1,page2,page3],5))` selects five random pages with replacement.  
- `cue:page(Pshuf([page1,page2,page3],2))` shuffles once and repeats the same order twice.  
- `cue:page(Pxrand([page1,page2,page3],2))` reshuffles the list for each repetition.  
- `cue:page(Pchoose([page1,page2,page3]))` chooses one random page each time the cue is triggered.  
- Durations can be specified using `pageId:seconds` (e.g. `page1:5`).  
- The `after:` clause defines what happens when the sequence ends (e.g. returning to scroll mode).  
- `after:mode(scroll@F)` jumps to scroll mode at rehearsal mark F and resumes playback.  
- `after:mode(scrollPaused@F)` jumps to scroll mode at mark F and stays paused.  
- All navigation is synchronized across connected clients.

### Examples
cue:page(page1)
cue:page(Pseq([page1:2,page2:2],3))
cue:page(Prand([page1,page2,page3],4))
cue:page(Pxrand([pageA,pageB,pageC],2))
cue:page(Pshuf([pageIntro,pageMid,pageEnd],1))
cue:page(Pchoose([pageA,pageB,pageC]))
cue:page(Pseq([page1:3],1), after:mode(scroll@F))
cue:page(Pseq([page1:3],1), after:mode(scrollPaused@F))
cue:page(Pseq([Pseq([page1:2,page2:2],2),page3:4],1))

### Notes
- Pattern parentheses `()` are required for lists and sequences.  
- Repetition counts follow the pattern syntax (`Pseq([...],<count>)`).  
- Durations follow the page name with a colon (`page1:4` = 4 s).  
- The `@` suffix defines a rehearsal mark or cue ID to jump to after completion.  
- `Pshuf` and `Pxrand` follow SuperCollider semantics:  
  - **Pshuf**: shuffled once, same order repeated.  
  - **Pxrand**: reshuffled on each repeat.  
- `after:` supports `scroll` and `scrollPaused` modes; `:hold(n)` extension planned.  
- All page and mode changes are fully synchronized across connected clients.