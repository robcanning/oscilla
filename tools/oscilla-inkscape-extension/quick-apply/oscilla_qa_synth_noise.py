#!/usr/bin/env python3
"""OSCILLA Quick Apply: Synth Noise"""
import inkex

class OscillaQA_SynthNoise(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "synth(uid:n1, wave:noise)")

if __name__ == "__main__":
    OscillaQA_SynthNoise().run()
