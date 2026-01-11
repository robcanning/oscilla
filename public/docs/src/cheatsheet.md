---
title: Cheatsheet
layout: docs_layout.njk
---

# Oscilla Cheatsheet

Compact one-line examples for rapid reference.

---

## Timing & Navigation

pause(dur:4)
pause(dur:12, count:true)
pause(dur:4, next:nav(page3))
nav(page3)
nav(scroll@A)
nav(scrollPaused@B)
stop()
stop(uid:s1)
stop(next:nav(End))
page(page1)
page(Pseq([page1:2,page2:2],3))
page(Prand([pageA,pageB,pageC],4))
page(Pshuf([page1,page2,page3],1))
page(Pchoose([pageA,pageB]))
repeat(start:A, end:C, x:3)
stopwatch(source:new, trig:auto)
stopwatch(source:main, scroll:true)
metro(bpm:90, visual:hex, trig:auto)

---

## Media & Sound

audio(file:hit.wav)
audio(file:drone.wav, loop:0)
audio(file:click.wav, amp:0.25)
video(file:intro.mp4, size:fs, clickable:1)
video(file:clip.webm, target:markerA, size:640x360, loop:0)
text(src:foo.txt, dur:3, autostart:1)
text(src:foo.txt, order:rnd, dur:2, loop:0)
text(src:foo.txt, yslots:3, yslotmode:sequence)
fade(mode:out, dur:2, from:1, to:0)
fade(mode:in, dur:1, target:title)
fade(mode:pulse, dur:6, from:0.2, to:1)

---

## OSC & External Control

osc(addr:voice, pitch:y, amp:size)
osc(addr:voice, pitch:hz(440))
osc(addr:voice, pitch:midi(60))
osc(addr:voice, pitch:deg(2,4), root:48)
osc(addr:voice, pitch:y, uid:v1)
oscCtrl(addr:"/fx/pan", min:-1, max:1)
oscCtrl(addr:"/fx/pan", min:-1, max:1, mode:continuous)
oscCtrl(addr:"/fx/ring/freq", min:60, max:800)

---

## Interaction & Structure

button(trigger:nav(page3))
button(trigger:pause(dur:12,count:true))
button(trigger:nav(scroll@A), style(size:"120x45", fontsize:36))
choice(A,B,C)
group(cueA, cueB, cueC)
propagate(scale(values:[${1},${2}], dur:${3}), rnd(0.8,1.2), rnd(1.2,1.6), rnd(0.4,1.2))
reuse(mainMenu)
use(mainMenu)
traverse(points:p1,p2,p3, dir:fwd, loop:0)

---

## Synthesis

synth(uid:pad3, freq:[440,477,644,777], env:{a:1.5})
synth(uid:pad3, freq:Pseq(400,800,1600,800), dur:0.2)
synth(uid:filt, wave:saw, freq:330, filter:{type:lp,freq:Pseq(400,800),q:0.7})
synth(uid:pad3, freq:Pseq(400,800), env:{a:4}, delay:{time:0.4,fb:0.85,mix:0.7})

---

## Animation

scale(values:[1,1.4], mode:alternate, dur:1.2)
rotate(dir:1, dur:120)
o2p(path:p01, mode:fwd, dur:45, loop:0)
color(values:[#f00,#0ff], dur:2)

---

Docs: https://robcanning.github.io/oscilla/docs/
