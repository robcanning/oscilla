---
title: oscilla_cheatsheet
layout: docs_layout.njk
---



pause(dur:20, uid:1a)

fade(mode:out,dur:3,from:1,to:0,target:titlepage)
fade(mode:inout,dur:14,from:0,to:1, target:dedication)

o2p(path:c01, mode:rev, dur:45, loop:0, ease:linear, prestate:ghostClickable(0))

o2p(path:p03, mode:fwd, rotate:spin, rotspeed:7, rotdir:-1,  dur:55, dir:-1, start:0.6, tdelay:10, prestate:ghostClickable(18000), loop:0, ease:linear)

rotate(dir:1, dur: 120, uid:124, prestate:ghostClickable(playhead,2000,0.7))

rotate(dir:-1, dur:85, uid:123, osc:1, oscaddr:"/spat/src01", prestate:ghostClickable(playhead,10000,0.6))