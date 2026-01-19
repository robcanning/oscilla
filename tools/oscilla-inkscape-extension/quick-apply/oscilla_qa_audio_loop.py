#!/usr/bin/env python3
"""OSCILLA Quick Apply: Audio Loop"""
import inkex

class OscillaQA_AudioLoop(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "audio(src:sound.wav, loop:0)")

if __name__ == "__main__":
    OscillaQA_AudioLoop().run()
