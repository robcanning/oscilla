#!/usr/bin/env python3
"""
OSCILLA Toolbar - No Dialog Version
Opens directly without the Inkscape extension dialog.

This uses inkex.CallExtension which skips the parameter dialog.
"""

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk
import subprocess
import os


class OscillaToolbarWindow(Gtk.Window):
    """Floating toolbar window with OSCILLA cue buttons."""
    
    CUES = {
        "Timing": [
            ("⏹", "Stop", "stop()"),
            ("⏸", "Pause 4s", "pause(dur:4)"),
            ("⏸⏱", "Pause+Count", "pause(dur:8, count:true)"),
            ("🐢", "Half Speed", "speed(value:0.5)"),
            ("🐇", "2x Speed", "speed(value:2)"),
        ],
        "Navigation": [
            ("📄", "Nav Page", "nav(page1)"),
            ("📜", "Nav Scroll", "nav(scroll@A)"),
            ("🔁", "Nav Repeat", "nav(scroll@A, repeats:3)"),
        ],
        "Animation": [
            ("💓", "Scale Pulse", "scale(values:[1,1.3,1], dur:2, loop:0)"),
            ("📈", "Scale Grow", "scale(min:1, max:1.5, dur:3)"),
            ("🔄", "Rotate CW", "rotate(dir:1, dur:2)"),
            ("🔃", "Rotate CCW", "rotate(dir:-1, dur:2)"),
            ("🪐", "Orbit", "o2p(path:orbitPath, dur:8)"),
        ],
        "Visual": [
            ("🌅", "Fade In", "fade(mode:in, dur:2)"),
            ("🌆", "Fade Out", "fade(mode:out, dur:2)"),
            ("💫", "Fade Pulse", "fade(mode:pulse, dur:3, from:0.2, to:1)"),
            ("🌈", "Colors", "color(vals:[#f00,#ff0,#0f0,#0ff,#00f], dur:5)"),
        ],
        "Audio": [
            ("🔊", "Audio", "audio(src:sound.wav)"),
            ("🔁", "Loop", "audio(src:sound.wav, loop:0)"),
            ("🎲", "Pool", "audioPool(path:sfx, mode:rand)"),
            ("⚡", "Impulse", "audioImpulse(path:perc, rate:20)"),
        ],
        "Synth/OSC": [
            ("🎹", "Sine", "synth(uid:s1, wave:sine, freq:440)"),
            ("📻", "Noise", "synth(uid:n1, wave:noise)"),
            ("📡", "OSC Y", "osc(addr:voice, pitch:y)"),
        ],
        "Other": [
            ("🔘", "Button", "button(trigger:nav(page1))"),
            ("🥁", "Metro", "metro(bpm:120, visual:hex, trig:playhead)"),
            ("⏱", "Timer", "stopwatch(source:new, trig:auto)"),
        ],
    }

    def __init__(self):
        super().__init__(title="OSCILLA")
        self.set_default_size(260, 500)
        self.set_keep_above(True)
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)
        self.set_resizable(True)
        
        # Main container with scrolling
        scrolled = Gtk.ScrolledWindow()
        scrolled.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        self.add(scrolled)
        
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
        main_box.set_margin_start(6)
        main_box.set_margin_end(6)
        main_box.set_margin_top(6)
        main_box.set_margin_bottom(6)
        scrolled.add(main_box)
        
        # Custom cue entry
        custom_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        self.custom_entry = Gtk.Entry()
        self.custom_entry.set_placeholder_text("Custom cue...")
        self.custom_entry.connect("activate", self.on_custom_apply)
        custom_box.pack_start(self.custom_entry, True, True, 0)
        
        apply_btn = Gtk.Button(label="✓")
        apply_btn.set_tooltip_text("Apply custom cue")
        apply_btn.connect("clicked", self.on_custom_apply)
        custom_box.pack_start(apply_btn, False, False, 0)
        main_box.pack_start(custom_box, False, False, 2)
        
        # Create category sections
        for category, cues in self.CUES.items():
            # Category label
            label = Gtk.Label()
            label.set_markup(f"<small><b>{category}</b></small>")
            label.set_xalign(0)
            main_box.pack_start(label, False, False, 2)
            
            # Button grid
            flowbox = Gtk.FlowBox()
            flowbox.set_valign(Gtk.Align.START)
            flowbox.set_max_children_per_line(5)
            flowbox.set_selection_mode(Gtk.SelectionMode.NONE)
            flowbox.set_homogeneous(True)
            flowbox.set_column_spacing(2)
            flowbox.set_row_spacing(2)
            
            for icon, tooltip, cue in cues:
                btn = Gtk.Button(label=icon)
                btn.set_tooltip_text(f"{tooltip}\n{cue}")
                btn.set_size_request(42, 36)
                btn.connect("clicked", self.on_cue_click, cue)
                flowbox.add(btn)
            
            main_box.pack_start(flowbox, False, False, 0)
        
        # Utility row
        util_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=4)
        
        clear_btn = Gtk.Button(label="🗑")
        clear_btn.set_tooltip_text("Clear cue")
        clear_btn.connect("clicked", self.on_clear_click)
        util_box.pack_start(clear_btn, True, True, 0)
        
        copy_btn = Gtk.Button(label="📋")
        copy_btn.set_tooltip_text("Copy current ID")
        copy_btn.connect("clicked", self.on_copy_click)
        util_box.pack_start(copy_btn, True, True, 0)
        
        main_box.pack_start(util_box, False, False, 4)
        
        # Status
        self.status = Gtk.Label(label="Ready")
        self.status.set_line_wrap(True)
        self.status.set_max_width_chars(30)
        main_box.pack_start(self.status, False, False, 2)

    def run_inkscape_action(self, verb_or_action):
        """Run an Inkscape action via command line or D-Bus."""
        try:
            # Try using inkscape --actions (Inkscape 1.0+)
            subprocess.Popen(
                ['inkscape', '--actions', verb_or_action],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except Exception as e:
            self.status.set_text(f"Error: {e}")

    def apply_cue_via_xdotool(self, cue):
        """
        Apply cue by:
        1. Write cue to temp file
        2. Copy cue to clipboard (as backup)
        
        Then user can either:
        - Use "Apply Queued Cue" extension (bind to Ctrl+Shift+Q)
        - Paste manually into Object Properties ID field
        """
        temp_file = "/tmp/oscilla_cue.txt"
        
        try:
            # Write to temp file for "Apply Queued Cue" extension
            with open(temp_file, 'w') as f:
                f.write(cue)
            
            # Also copy to clipboard
            try:
                process = subprocess.Popen(
                    ['xclip', '-selection', 'clipboard'],
                    stdin=subprocess.PIPE
                )
                process.communicate(cue.encode())
            except FileNotFoundError:
                # xclip not available, try xsel
                try:
                    process = subprocess.Popen(
                        ['xsel', '--clipboard', '--input'],
                        stdin=subprocess.PIPE
                    )
                    process.communicate(cue.encode())
                except FileNotFoundError:
                    pass  # No clipboard tool available
            
            self.status.set_text(f"✓ {cue[:28]}...")
            
        except Exception as e:
            self.status.set_text(f"Error: {str(e)[:25]}")

    def on_cue_click(self, button, cue):
        """Handle cue button click."""
        self.apply_cue_via_xdotool(cue)

    def on_custom_apply(self, widget):
        """Apply custom cue."""
        cue = self.custom_entry.get_text().strip()
        if cue:
            self.apply_cue_via_xdotool(cue)

    def on_clear_click(self, button):
        """Copy a clear placeholder."""
        self.apply_cue_via_xdotool("element_cleared")

    def on_copy_click(self, button):
        """Show instruction to copy ID."""
        self.status.set_text("Use Ctrl+Shift+O in Inkscape")


def main():
    win = OscillaToolbarWindow()
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    Gtk.main()


if __name__ == "__main__":
    main()
