#!/usr/bin/env python3
"""OSCILLA Quick Apply: OSC Pitch Y"""
import inkex

class OscillaQA_OscPitch(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "osc(addr:voice, pitch:y)")

if __name__ == "__main__":
    OscillaQA_OscPitch().run()
