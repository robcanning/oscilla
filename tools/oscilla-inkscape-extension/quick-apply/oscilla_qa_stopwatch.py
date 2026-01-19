#!/usr/bin/env python3
"""OSCILLA Quick Apply: Stopwatch"""
import inkex

class OscillaQA_Stopwatch(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "stopwatch(source:new, trig:auto)")

if __name__ == "__main__":
    OscillaQA_Stopwatch().run()
