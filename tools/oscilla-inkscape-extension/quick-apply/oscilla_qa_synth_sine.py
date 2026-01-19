#!/usr/bin/env python3
"""OSCILLA Quick Apply: Synth Sine"""
import inkex

class OscillaQA_SynthSine(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "synth(uid:s1, wave:sine, freq:440)")

if __name__ == "__main__":
    OscillaQA_SynthSine().run()
