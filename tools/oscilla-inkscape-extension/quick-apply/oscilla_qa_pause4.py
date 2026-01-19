#!/usr/bin/env python3
"""OSCILLA Quick Apply: Pause 4s"""
import inkex

class OscillaQA_Pause4(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "pause(dur:4)")

if __name__ == "__main__":
    OscillaQA_Pause4().run()
