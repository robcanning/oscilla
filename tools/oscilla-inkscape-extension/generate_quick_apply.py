#!/usr/bin/env python3
"""
Generate individual quick-apply extensions for OSCILLA.
Each extension can be bound to a keyboard shortcut in Inkscape.

Run this script to generate all the .inx and .py files.
"""

import os

# Quick apply definitions: (id_suffix, menu_name, cue_string)
QUICK_APPLIES = [
    # Timing
    ("stop", "Stop", "stop()"),
    ("pause4", "Pause 4s", "pause(dur:4)"),
    ("pause8", "Pause 8s + Count", "pause(dur:8, count:true)"),
    ("speed_half", "Speed 0.5x", "speed(value:0.5)"),
    ("speed_double", "Speed 2x", "speed(value:2)"),
    
    # Navigation
    ("nav_page", "Nav Page1", "nav(page1)"),
    ("nav_scroll", "Nav Scroll@A", "nav(scroll@A)"),
    
    # Animation - Scale
    ("scale_pulse", "Scale Pulse", "scale(values:[1,1.3,1], dur:2, loop:0)"),
    ("scale_grow", "Scale Grow", "scale(min:1, max:1.5, dur:3)"),
    
    # Animation - Rotate
    ("rotate_cw", "Rotate CW", "rotate(dir:1, dur:2)"),
    ("rotate_ccw", "Rotate CCW", "rotate(dir:-1, dur:2)"),
    ("rotate_swing", "Rotate Swing", "rotate(values:[0,30,-30], dur:1, mode:alt)"),
    
    # Visual
    ("fade_in", "Fade In", "fade(mode:in, dur:2)"),
    ("fade_out", "Fade Out", "fade(mode:out, dur:2)"),
    ("fade_pulse", "Fade Pulse", "fade(mode:pulse, dur:3, from:0.2, to:1)"),
    ("color_cycle", "Color Cycle", "color(vals:[#f00,#ff0,#0f0,#0ff,#00f], dur:5)"),
    
    # Audio
    ("audio_file", "Audio File", "audio(src:sound.wav)"),
    ("audio_loop", "Audio Loop", "audio(src:sound.wav, loop:0)"),
    ("audio_pool", "Audio Pool", "audioPool(path:sfx, mode:rand)"),
    ("audio_impulse", "Audio Impulse", "audioImpulse(path:perc, rate:20)"),
    
    # Synth
    ("synth_sine", "Synth Sine", "synth(uid:s1, wave:sine, freq:440)"),
    ("synth_noise", "Synth Noise", "synth(uid:n1, wave:noise)"),
    ("synth_stop", "Synth Stop", "synthStop(uid:s1, rel:0.5)"),
    
    # OSC
    ("osc_pitch", "OSC Pitch Y", "osc(addr:voice, pitch:y)"),
    ("osc_ctrl", "OSC Ctrl Pan", 'oscCtrl(addr:"/pan", min:-1, max:1)'),
    
    # Metro/Stopwatch
    ("metro_120", "Metro 120", "metro(bpm:120, visual:hex, trig:playhead)"),
    ("metro_90", "Metro 90", "metro(bpm:90, visual:hex, trig:playhead)"),
    ("stopwatch", "Stopwatch", "stopwatch(source:new, trig:auto)"),
    
    # Utility
    ("clear", "Clear Cue", "__CLEAR__"),
]

INX_TEMPLATE = '''<?xml version="1.0" encoding="UTF-8"?>
<inkscape-extension xmlns="http://www.inkscape.org/namespace/inkscape/extension">
  <n>QA: {menu_name}</n>
  <id>org.oscilla.qa.{id_suffix}</id>
  <effect needs-live-preview="false">
    <object-type>all</object-type>
    <effects-menu>
      <submenu name="OSCILLA">
        <submenu name="Quick Apply"/>
      </submenu>
    </effects-menu>
  </effect>
  <script>
    <command location="inx" interpreter="python">oscilla_qa_{id_suffix}.py</command>
  </script>
</inkscape-extension>
'''

PY_TEMPLATE = '''#!/usr/bin/env python3
"""OSCILLA Quick Apply: {menu_name}"""
import inkex

class OscillaQA_{class_name}(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            elem.set("id", "{cue}")

if __name__ == "__main__":
    OscillaQA_{class_name}().run()
'''

PY_CLEAR_TEMPLATE = '''#!/usr/bin/env python3
"""OSCILLA Quick Apply: Clear Cue"""
import inkex

class OscillaQA_Clear(inkex.EffectExtension):
    def effect(self):
        if not self.svg.selection:
            return
        for elem in self.svg.selection.values():
            new_id = f"elem_{abs(hash(elem)) % 100000}"
            elem.set("id", new_id)

if __name__ == "__main__":
    OscillaQA_Clear().run()
'''


def generate_quick_applies(output_dir="quick-apply"):
    """Generate all quick-apply extension files."""
    os.makedirs(output_dir, exist_ok=True)
    
    for id_suffix, menu_name, cue in QUICK_APPLIES:
        # Generate INX
        inx_content = INX_TEMPLATE.format(
            menu_name=menu_name,
            id_suffix=id_suffix
        )
        inx_path = os.path.join(output_dir, f"oscilla_qa_{id_suffix}.inx")
        with open(inx_path, 'w') as f:
            f.write(inx_content)
        
        # Generate PY
        if cue == "__CLEAR__":
            py_content = PY_CLEAR_TEMPLATE
        else:
            class_name = ''.join(word.title() for word in id_suffix.split('_'))
            # Escape quotes in cue string for Python
            escaped_cue = cue.replace('"', '\\"')
            py_content = PY_TEMPLATE.format(
                menu_name=menu_name,
                class_name=class_name,
                cue=escaped_cue
            )
        
        py_path = os.path.join(output_dir, f"oscilla_qa_{id_suffix}.py")
        with open(py_path, 'w') as f:
            f.write(py_content)
        
        print(f"Generated: {id_suffix}")
    
    print(f"\nGenerated {len(QUICK_APPLIES)} quick-apply extensions in '{output_dir}/'")
    print("\nTo install:")
    print(f"  cp {output_dir}/*.inx {output_dir}/*.py ~/.config/inkscape/extensions/")
    print("\nThen bind keyboard shortcuts in:")
    print("  Edit → Preferences → Interface → Keyboard → search 'OSCILLA'")


if __name__ == "__main__":
    generate_quick_applies()
