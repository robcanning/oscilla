#!/usr/bin/env python3
"""OSCILLA Quick Apply: Synth Stop"""
import inkex

class OscillaQA_SynthStop(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "synthStop(uid:s1, rel:0.5)")

if __name__ == "__main__":
    OscillaQA_SynthStop().run()
