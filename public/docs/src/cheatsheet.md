---
title: oscilla_cheatsheet
layout: docs_layout.njk
---

# Oscilla Cheatsheet (Draft)

pause(dur:20, uid:1a)

cue:fade(mode:in, dur:2, from:0, to:1, target:circle1)

cue:fade(mode:pulse, dur:1.5, from:0.2, to:1)

cue:fade(mode:blink, dur:0.5, time:10)

o2p(path:c01, mode:rev, dur:45, loop:0, ease:linear, prestate:ghostClickable(0))

o2p(path:p03, mode:fwd, rotate:spin, rotspeed:7, rotdir:-1,  dur:55, dir:-1, start:0.6, tdelay:10, prestate:ghostClickable(18000), loop:0, ease:linear)

rotate(dir:1, dur: 120, uid:124, prestate:ghostClickable(playhead,2000,0.7))

rotate(dir:-1, dur:85, uid:123, osc:1, oscaddr:"/spat/src01", prestate:ghostClickable(playhead,10000,0.6))

propagate( osc( addr:pontalist, pitch:deg(irand(0,11), irand(0,2)), env:size ) )

propagate( osc( addr:pontalist, pitch:deg(${1}, ${2}), env:size, root:48 ), rnd([0,2,4,5,7,9,11]), rnd([0,1,2,3,4,5]) )

video(file:intro.mp4,size:fs,clickable:1,audio:1,fadeIn:0.5)

video(file:clip.webm,target:markerA,location:scroll,size:640x360,loop:0,opacity:0.9)

metro(bpm:90,visual:hex,trig:auto,uid:m1)

metro(bpm:120,position:scrolling,target:x1,trig:auto,uid:hex1)