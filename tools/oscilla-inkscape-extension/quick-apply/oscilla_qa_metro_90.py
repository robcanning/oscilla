#!/usr/bin/env python3
"""OSCILLA Quick Apply: Metro 90"""
import inkex

class OscillaQA_Metro90(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "metro(bpm:90, visual:hex, trig:playhead)")

if __name__ == "__main__":
    OscillaQA_Metro90().run()
