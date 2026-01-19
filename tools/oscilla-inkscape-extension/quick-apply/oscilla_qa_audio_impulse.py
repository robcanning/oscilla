#!/usr/bin/env python3
"""OSCILLA Quick Apply: Audio Impulse"""
import inkex

class OscillaQA_AudioImpulse(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "audioImpulse(path:perc, rate:20)")

if __name__ == "__main__":
    OscillaQA_AudioImpulse().run()
