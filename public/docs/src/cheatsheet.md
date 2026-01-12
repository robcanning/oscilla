---
title: Cheatsheet
layout: cheatsheet.njk
---

# OSCILLA Cheatsheet

## Quick Install

```
git clone https://github.com/robcanning/oscilla.git
cd oscilla
npm install
npm start
```
Open in browser: http://localhost:8001

## Project Structure

```
oscilla/
├─ public/
│  ├─ scores/
│  │  └─ myProject/
│  │     ├─ score.svg
│  │     ├─ audio/
│  │     ├─ pages/
│  │     └─ preferences.json
```
Only `score.svg` is required.  

## Preferences (preferences.json)

```
projectTitle, projectAuthor, projectDescription, darkMode, defaultPlaybackSpeed, defaultViewMode, defaultPage, playzoneColor, playheadColor, playheadBorder, playheadWidth, audioSync, oscOutput, overlayMode, loopPlayback
```
 

## Workflow (Inkscape → Oscilla)

```
1. Author in Inkscape
- Draw shapes, text, paths
- Save to: public/scores/myProject/score.svg
2. Add Behaviour via IDs
- Open XML Editor (Ctrl + Shift + X)
- Edit element IDs
Example: pause(dur:12, count:true)
3. Open Project http://localhost:8001 or
- http://localhost:8001/?project=myProject
4. Edit → Save → Refresh
```
 

## Timing & Navigation

```
stop(uid:s1) | stop(next:nav(End))

pause(dur:12, count:true)
pause(dur:4, next:nav(page3))

nav(page3) | nav(scroll@A) | nav(scrollPaused@B)

page(page1)
page(Pseq([page1:2,page2:2],3))
page(Prand([pageA,pageB,pageC],4))
page(Pchoose([pageA,pageB]))

stopwatch(source:new, trig:auto)
stopwatch(source:main, scroll:true)

metro(bpm:90, visual:hex, trig:auto)
```

 

## Animation — Scale

```
scale(values:[1,1.5,1], dur:2)
scale(min:1, max:1.3, dur:2, loop:0)
scale(values:[1,2,1], dur:2, tdelay:3)
scaleXY([1,1.3],[1,0.6], dur:1)
scale(Pseq([1,1.4,1],inf), dur:Prand([0.5,1],inf))
```

## Animation — Rotate

```
rotate(dir:1, dur:1)
rotate(values:[0,120,240], dur:2)
rotate(values:Pseq([0,45,10],inf), dur:Pseq([1,0.2,2],inf))
rotate(values:[0,120,240], tdelay:2)
rotate(values:Pshuf([0,180],inf), dur:1, mode:alternate)
```

## Animation — Object-to-Path (o2p)

```
o2p(path:orbitA, dur:8, tdelay:3, prestate:hide)
o2p(path:spiral, rotate:aligned, rotoffset:-90)
o2p(path:ring, start:0.2, end:0.9, mode:alt)
o2p(path:circle, rotate:spin, rotspeed:2, rotdir:-1)
o2p(path:orbitA, dur:8, loop:3)
```

## Animation — Color

```
color(uid:shape1, values:[#f00,#0f0], dur:2)
color(uid:shape2, values:[#00f,#fff,#00f], dur:4)
color(uid:bars*, values:[#f80,#08f], mode:alternate, dur:1.2)
color(uid:rect, values:Pseq([#f00,#ff0,#0ff],3), dur:3)
color(uid:bgStripe, values:[#000,#444,#888,#ccc], dur:6)
```

## Animation — Fade

```
fade(mode:out, dur:2, from:1, to:0)
fade(mode:in, dur:1, target:title)
fade(mode:pulse, dur:6, from:0.2, to:1)
```

## Animation - Text

```
text(src:foo.txt, dur:3, autostart:1)
text(src:foo.txt, order:rnd, dur:2, loop:0)
text(src:foo.txt, yslots:3, yslotmode:sequence)
```

## Audio 

```
audio(uid:a1, src:click)
audio(uid:a2, src:loop, loop:0, fade:1.2)
audio(uid:a3, src:hit, pan:rand(-1,1), pitch:rand(0.8,1.3))
audio(uid:a4, src:voice, toggle:true, fadeOut:0.3)

audioPool(uid:p1, path:sfx)
audioPool(uid:p2, path:perc, mode:rand)
audioPool(uid:p3, path:foley, amp:rand(0.4,0.9), pan:rand(-0.7,0.7))
audioPool(uid:p4, path:tones, pitch:rand(0.5,2), fade:rand(10%,40%))

audioImpulse(uid:i1, path:perc, rate:30)
audioImpulse(uid:i2, path:clicks, rate:20, jitter:0.5)
audioImpulse(uid:i3, path:metal, rate:12, pan:rand(-1,1), pitch:rand(0.7,1.4))
audioImpulse(uid:i4, path:textures, rate:6, jitter:0.8, amp:rand(0.2,0.6))
```

## Synthesis

```
synth(uid:ref, wave:sine, freq:440)
synth(uid:noise, wave:noise)
synth(uid:region, freq:220)
synth(uid:fixedDur, freq:220, dur:5)
synth(uid:persist, freq:110, lifetime:process)
synth(uid:env, freq:220, env:{a:0.5,r:1})
synth(uid:chord, freq:[440,477,644])
synth(uid:seq, freq:Pseq(220,330,440), dur:1)
synth(uid:filter, freq:330, filter:{type:lp,freq:Pseq(400,1200)})
synth(uid:osc, freq:330, osc:1, oscAddr:/synth/a)
```

## Video

```
video(file:intro.mp4, size:fs, clickable:1)
video(file:clip.webm, target:markerA, size:640x360, loop:0)
```

## OSC & External Control

```
osc(addr:voice, pitch:y, amp:size)
osc(addr:voice, pitch:hz(440))
osc(addr:voice, pitch:midi(60))
osc(addr:voice, pitch:deg(2,4), root:48)
osc(addr:voice, pitch:y, uid:v1)

oscCtrl(addr:"/fx/pan", min:-1, max:1)
oscCtrl(addr:"/fx/pan", min:-1, max:1, mode:continuous)
oscCtrl(addr:"/fx/ring/freq", min:60, max:800)
```


## Interaction & Structure

```
button(trigger:nav(page3))
button(trigger:pause(dur:12,count:true))
button(trigger:nav(scroll@A), style(size:"120x45", fontsize:36))

propagate(
  scale(values:[${1},${2}], dur:${3}),
  rnd(0.8,1.2),
  rnd(1.2,1.6),
  rnd(0.4,1.2)
)

reuse(mainMenu)
use(mainMenu)
```


## Links

```
Docs: https://robcanning.github.io/oscilla/docs/
Repo: https://github.com/robcanning/oscilla
```