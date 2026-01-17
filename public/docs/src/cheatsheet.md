---
title: Cheatsheet
layout: cheatsheet.njk
---

# OSCILLA Cheatsheet
### Interactive Graphic Notation

## Version
*v0.29_beta*

## Quick Install

```
git clone https://github.com/robcanning/oscilla.git
cd oscilla; npm install; npm start
Open in browser: http://localhost:8001
```

## Project Structure

```
oscilla/             # cp template dir
├─ public/           # ⟶ rename OR
│  ├─ scores/        # scroll:40000×1024
│  │  └─ myProject/  # page:1366×1024px
│  │     ├─ score.svg        ⟶ required
│  │     ├─ audio/ video/    ⟶ optional
│  │     ├─ pages/ text/     ⟶ optional
│  │     └─ preferences.json ⟶ generated
```

## Preferences (preferences.json)

```
projectTitle, projectAuthor, projectDescription, darkMode, defaultPlaybackSpeed, defaultViewMode, defaultPage, playzoneColor, playheadColor, playheadBorder, playheadWidth, audioSync, oscOutput, overlayMode, loopPlayback
```

## Workflow (Inkscape → Oscilla)

```
1. Author in Inkscape - shapes,paths etc.
- Save: public/scores/myProject/score.svg
2. Add Behaviour via IDs
- Open XML Editor (Ctrl+Shift+X)
- Edit element IDs [e.g. pause(dur:12)]
3. Open Project http://localhost:8001 or
- http://localhost:8001/?project=myProject
4. Edit → Save → Refresh
```
 
## Timing & Navigation

```
stop(uid:s1) •  stop(next:nav(End))
```
```
pause(dur:12, count:true) // with countdown
pause(dur:4, next:nav(page3)) // chaining
```
```
speed(value:0.5, uid:s2) // half speed
speed(add:0.1, uid:s3) // a bit faster
speed(value:1.3, dur:2, uid:s4) //ramp
speed(value:1.4, dur:6, ease:linear)
```
```
nav(page3) •  nav(scroll@A) // AKA Navigate  
nav(scrollPaused@B) // jump and wait
nav(Coda) // jump to object id Coda
nav(scroll@G, repeats:3, uid:g1) // repeat
```
```
page(page1) // page*.svg in pages/ dir
page(Pseq([page1:2,page2:2],3))
page(Prand([pageA,pageB,pageC],4))
page(Pchoose([pageA,pageB]))
```
```
stopwatch(source:new, trig:auto)
stopwatch(source:main, scroll:true)
stopwatch(source:new, hold:6, offsetX:-40)
```
```
metro(bpm:90, visual:hex, trig:playhead)
metro(bpm:120,position:scrolling,
  target:beat1,uid:scrollA)
```
```
metro(bpm:110,beats:3,colour:#3f9,
  audio:1,osc:1,uid:green,trig:auto)
```

## Animation — Scale | Rotate | o2p

```
scale(values:[1,1.5,1], dur:2)
scale(min:1, max:1.3, dur:2, loop:0)
scale(values:[1,2,1], dur:2, tdelay:3)
scaleXY([1,1.3],[1,0.6], dur:1)
scale(Pseq([1,1.4,1],inf), dur:Prand([0.5,1],inf))
scale([1,1.5,1],dur:12, mode:loop, osc:1, 
   oscaddr:"scale/spat/4chPan",  hold:0,  uid:aC2l)
```
```
rotate(dir:1, dur:1)
rotate(values:[0,120,240], dur:2)
rotate(values:Pseq([0,45,10],inf), dur:Pseq([1,0.2,2],inf))
rotate(values:[0,120,240], tdelay:2)
rotate(values:Pshuf([0,180],inf), dur:1, mode:alt)
```

**o2p — Object-to-Path Animation**
```
o2p(path:orbitA, dur:8, tdelay:3, prestate:hide)
o2p(path:spiral, rotate:aligned, rotoffset:-90)
o2p(path:ring, start:0.2, end:0.9, mode:alt)
o2p(path:c1, rotate:spin,rotspeed:2,rotdir:-1)
o2p(path:orbitA, dur:8, loop:3)
```

## Animation — Color | Fade | Text

```
color(uid:shape1, vals:[#f00,#0f0], dur:2)
color(uid:bars*, vals:[#f80,#08f], mode:alt, dur:1.2)
color(uid:rect, vals:Pseq([#f00,#ff0,#0ff],3), dur:3)
color(uid:bgStripe, vals:[#000,#444,#888,#ccc], dur:6)
```
**fade() any SVG element (self||target)**
```
fade(mode:out, dur:2, from:1, to:0)
fade(mode:in, dur:1, target:title)
fade(mode:pulse, dur:6, from:0.2, to:1)
```
**text() Lines,Words,Chars (File||String)**
```
text(src:foo.txt, dur:3, autostart:1)
text(src:foo.txt, order:rnd, dur:2, loop:0)
text(src:foo.txt, yslots:3, yslotmode:sequence)
text( src:"foo baz bar",
  mode:word, order:seq, dur:0.4, gap:10.1)
```
```
text( src:"ČŽŠ ĐĐĐĐĐ ŠČČ ŠĐĐ ŽŽĐ ŽŽĐ ŠĐČ ",
  mode:char, order:seq, loop:2,
  dur:0.1, gap:0.01,  target:center,
  style:"font-size:48em;color:black;")
```
## Audio | Video
**audio(...) — Play a Single File**
```
audio(src:noise.wav, 
  loop:2, amp:1, fade:1.5, uid:p8)
```  
```
audio(src:hit, pan:rand(-1,1), uid:a3, 
  pitch:rand(0.8,1.3),  fadeOut:0.3)
```
**audioPool(...) — 1-Shot Select from Dir**
```
audioPool(uid:p1, path:sfx)
audioPool(uid:p2, path:foley, mode:rand)
```
```
audioPool(uid:p3, path:perc, amp:rand(0.4,0.9), 
  pan:rand(-0.7,0.7),pitch:rand(0.5,2),fade:rand(10%,40%))
```
**audioImpulse(...) — Stochastic Process**
```
audioImpulse(uid:i1, path:perc, rate:30)
audioImpulse(uid:i2, path:clicks, rate:20)
audioImpulse(uid:i3, path:metal, rate:12, 
  pan:rand(-1,1), pitch:rand(0.7,1.4))
audioImpulse(uid:i4, path:textures, rate:6, 
  jitter:0.8, amp:rand(0.2,0.6))
```
**video(...) — In-Score Video Playback**
```
video(file:intro.mp4, size:fs, clickable:1)
```
```
video(file:lum.webm,size:500,in:4,out:12, 
  opacity:0.5, loop:0, speed:3.2, 
  target:abc123, location:scroll)
```

## Synthesis
**synth() — Web Audio Synth, FX, Filters**
```
synth(uid:ref, wave:sine, freq:440)
synth(uid:noise, wave:noise)
synth(uid:fixedDur, freq:220, dur:5)
synth(uid:p1, freq:90, lifetime:process)
synth(uid:env, freq:99, env:{a:0.5,r:1})
synth(uid:chord, freq:[440,477,644])
synth(uid:seq, freq:Pseq(220,330), dur:1)
synth(uid:filter, freq:330, 
  filter:{type:lp,freq:Pseq(400,1200)})
synth(uid:osc, freq:330, 
  osc:1, oscAddr:/synth/a)
synthStop(uid:p1, rel:0.5)
```

## OSC / External Control
**osc --- Discrete OSC Event Cue**
```
osc(addr:v1, pitch:y) // y | hz(440) | midi(60) | deg(2,4)
osc(addr:v2, pitch:y, uid:v1) // Y coord. normalised
```
**oscCtrl --- Continuous Control Lanes**
```
oscCtrl(addr:"/fx/pan") // acts like breakpoint function // default 0 → 1 
oscCtrl(addr:"/fx/pan", min:-1, max:1, mode:continuous) // mode:event
oscCtrl(addr:"/fx/ring/freq", min:60, max:800) // default 0 → 1 
```

## Interaction & Structure
**button() to Trigger any Cue in Score**
```
button(trigger:nav(page3)) 
button(trigger:pause(dur:12,count:true))
button(trigger:nav(scroll@A))
```
```
button(target:page(home, uid:12), 
  style(size:"250x50", label:"Home", 
  font:"Arial Black", fontsize:22))
```

**propagate — Group-Level Cue Propagation**

```
propagate( // need multiple cues? use this.
  scale(values:[${1},${2}], dur:${3}),
  rnd(0.8,1.2), rnd(1.2,1.6), rnd(0.4,1.2) )
  ```
  ```
propagate( // continuous random streams
  osc( // all objects in group get the cue
    addr:pontalist, 
    pitch:deg(irand(0,11), irand(0,2)),
    env:size, uid:irand1235 ))
```
```
propagate(// ------------------------
    addr:pontalist, // pitch from Y-axis
    pitch:y, env:width, 
    bright:height, density:area,
    trig:playhead ))
```
```
propagate( // ------------------------
  osc( // ramdomise inputs with ${1}
    addr:voice,
    pitch:deg(${1}, 3),
    env:size, uid:rnd123
  ), rnd([0,2,4,5,7,9,11]) )
```
**Define and Reuse Collections.**
```
reuse(mainMenu) • use(mainMenu)
reuse(audioSampBtns) • use(audioSampBtns)
```
**Combine Cues by Nesting Groups**
```
// Behaviour stacks outer → inner; shapes inherit all enclosing cues.
<g id="o2p(...)">
  <g id="rotate(...)">
    <g id="propagate( osc(...) )">
      <!-- shapes -->
    </g>
  </g>
</g>
```

## Links
```
Docs: https://robcanning.github.io/oscilla/docs/
Repo: https://github.com/robcanning/oscilla
```