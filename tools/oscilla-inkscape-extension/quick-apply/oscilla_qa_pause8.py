#!/usr/bin/env python3
"""OSCILLA Quick Apply: Pause 8s + Count"""
import inkex

class OscillaQA_Pause8(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "pause(dur:8, count:true)")

if __name__ == "__main__":
    OscillaQA_Pause8().run()
