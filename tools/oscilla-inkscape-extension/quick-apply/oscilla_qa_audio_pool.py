#!/usr/bin/env python3
"""OSCILLA Quick Apply: Audio Pool"""
import inkex

class OscillaQA_AudioPool(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "audioPool(path:sfx, mode:rand)")

if __name__ == "__main__":
    OscillaQA_AudioPool().run()
