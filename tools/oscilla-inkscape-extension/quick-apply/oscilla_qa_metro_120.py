#!/usr/bin/env python3
"""OSCILLA Quick Apply: Metro 120"""
import inkex

class OscillaQA_Metro120(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "metro(bpm:120, visual:hex, trig:playhead)")

if __name__ == "__main__":
    OscillaQA_Metro120().run()
