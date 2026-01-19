#!/usr/bin/env python3
"""
OSCILLA Quick Cues - Inkscape Extension
Provides preset cue templates for rapid workflow

Author: Generated for OSCILLA project
Version: 1.0.0
"""

import inkex
from inkex import EffectExtension


class OscillaQuickCues(EffectExtension):
    """Inkscape extension for applying preset OSCILLA cues."""

    # Preset templates with placeholders
    PRESETS = {
        # Timing
        "stop_basic": "stop()",
        "pause_4s": "pause(dur:4)",
        "pause_8s_count": "pause(dur:8, count:true)",
        "speed_half": "speed(value:0.5)",
        "speed_double": "speed(value:2)",
        
        # Navigation
        "nav_page": "nav({target})",
        "nav_scroll": "nav(scroll@{target})",
        "nav_coda": "nav(Coda)",
        
        # Animation - Scale
        "scale_pulse": "scale(values:[1,{v1},1], dur:{v2}, loop:0)",
        "scale_grow": "scale(min:1, max:{v1}, dur:{v2})",
        
        # Animation - Rotate
        "rotate_spin": "rotate(dir:1, dur:{v1})",
        "rotate_swing": "rotate(values:[0,{v1},0,-{v1}], dur:{v2}, mode:loop)",
        
        # Animation - O2P
        "o2p_orbit": "o2p(path:{target}, dur:{v1})",
        
        # Color/Fade
        "fade_in": "fade(mode:in, dur:{v1})",
        "fade_out": "fade(mode:out, dur:{v1})",
        "fade_pulse": "fade(mode:pulse, dur:{v1}, from:0.2, to:1)",
        "color_cycle": "color(vals:[#f00,#ff0,#0f0,#0ff,#00f,#f0f], dur:{v1})",
        
        # Audio
        "audio_oneshot": "audio(src:{v1}, amp:{v2})",
        "audio_loop": "audio(src:{v1}, loop:0, amp:{v2})",
        "audio_pool": "audioPool(path:{v1}, mode:rand)",
        "audio_impulse": "audioImpulse(path:{v1}, rate:20)",
        
        # Synth
        "synth_tone": "synth(uid:{uid}, wave:{v2}, freq:{v1})",
        "synth_noise": "synth(uid:{uid}, wave:noise)",
        "synth_chord": "synth(uid:{uid}, wave:sine, freq:[{v1},440,{v2}])",
        
        # OSC
        "osc_pitch_y": "osc(addr:{v1}, pitch:y)",
        "osc_ctrl_pan": 'oscCtrl(addr:"{v1}", min:-1, max:1)',
        
        # Interaction
        "button_nav": "button(trigger:nav({target}))",
        "button_pause": "button(trigger:pause(dur:4,count:true))",
        
        # Metro/Stopwatch
        "metro_120": "metro(bpm:120, visual:hex, trig:playhead)",
        "metro_90": "metro(bpm:{v1}, visual:hex, trig:playhead)",
        "stopwatch": "stopwatch(source:new, trig:auto)",
    }
    
    # Default values for presets
    DEFAULTS = {
        "nav_page": {"target": "page1"},
        "nav_scroll": {"target": "A"},
        "scale_pulse": {"v1": "1.3", "v2": "2"},
        "scale_grow": {"v1": "1.5", "v2": "3"},
        "rotate_spin": {"v1": "2"},
        "rotate_swing": {"v1": "30", "v2": "1"},
        "o2p_orbit": {"target": "orbitPath", "v1": "8"},
        "fade_in": {"v1": "2"},
        "fade_out": {"v1": "2"},
        "fade_pulse": {"v1": "3"},
        "color_cycle": {"v1": "6"},
        "audio_oneshot": {"v1": "sound.wav", "v2": "1"},
        "audio_loop": {"v1": "ambient.wav", "v2": "0.8"},
        "audio_pool": {"v1": "sfx"},
        "audio_impulse": {"v1": "perc"},
        "synth_tone": {"v1": "440", "v2": "sine"},
        "synth_chord": {"v1": "330", "v2": "550"},
        "osc_pitch_y": {"v1": "voice1"},
        "osc_ctrl_pan": {"v1": "/fx/pan"},
        "button_nav": {"target": "page1"},
        "metro_90": {"v1": "90"},
    }

    def add_arguments(self, pars):
        """Define extension parameters."""
        pars.add_argument("--preset", type=str, default="stop_basic")
        pars.add_argument("--custom_value1", type=str, default="")
        pars.add_argument("--custom_value2", type=str, default="")
        pars.add_argument("--custom_uid", type=str, default="")

    def effect(self):
        """Apply preset cue to selected elements."""
        opts = self.options
        preset = opts.preset
        
        if not self.svg.selection:
            inkex.errormsg("Please select at least one element.")
            return
        
        # Get template
        template = self.PRESETS.get(preset, "")
        if not template:
            inkex.errormsg(f"Unknown preset: {preset}")
            return
        
        # Get defaults for this preset
        defaults = self.DEFAULTS.get(preset, {})
        
        # Build replacement values
        replacements = {
            "target": opts.custom_value1 if opts.custom_value1 else defaults.get("target", "page1"),
            "v1": opts.custom_value1 if opts.custom_value1 else defaults.get("v1", "1"),
            "v2": opts.custom_value2 if opts.custom_value2 else defaults.get("v2", "1"),
            "uid": opts.custom_uid if opts.custom_uid else f"q{abs(hash(preset)) % 1000}",
        }
        
        # Apply replacements
        cue = template.format(**replacements)
        
        # Apply to selected elements
        for elem in self.svg.selection.values():
            elem.set("id", cue)


if __name__ == "__main__":
    OscillaQuickCues().run()
