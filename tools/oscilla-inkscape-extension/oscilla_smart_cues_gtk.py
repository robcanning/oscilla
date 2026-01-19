#!/usr/bin/env python3
"""
OSCILLA Smart Cues Editor - GTK Interface
Dynamic cue editor with context-aware parameter display.

Author: Generated for OSCILLA project
Version: 2.0.0
"""

import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, Gdk, Pango
import json
import os
import subprocess

# Temp file for communicating with Inkscape
TEMP_CUE_FILE = "/tmp/oscilla_cue.txt"
PRESETS_FILE = os.path.join(os.path.dirname(os.path.realpath(__file__)), "oscilla_presets.json")


class CueParameter:
    """Defines a single cue parameter with its widget type and constraints."""
    def __init__(self, name, label, widget_type, default=None, options=None, 
                 min_val=None, max_val=None, step=None, tooltip=None):
        self.name = name
        self.label = label
        self.widget_type = widget_type  # 'entry', 'spin', 'float', 'combo', 'check', 'color', 'file'
        self.default = default
        self.options = options or []
        self.min_val = min_val
        self.max_val = max_val
        self.step = step or 1
        self.tooltip = tooltip


# Define all cue types and their parameters
CUE_DEFINITIONS = {
    "timing": {
        "label": "Timing & Navigation",
        "cues": {
            "stop": {
                "label": "Stop",
                "params": [
                    CueParameter("uid", "UID", "entry", "", tooltip="Unique identifier"),
                    CueParameter("next", "Next Action", "entry", "", tooltip="e.g., nav(End)"),
                ]
            },
            "pause": {
                "label": "Pause",
                "params": [
                    CueParameter("dur", "Duration (sec)", "float", 4.0, min_val=0.1, max_val=999, step=0.5),
                    CueParameter("count", "Show Countdown", "check", False),
                    CueParameter("next", "Next Action", "entry", "", tooltip="e.g., nav(page2)"),
                ]
            },
            "speed": {
                "label": "Speed",
                "params": [
                    CueParameter("value", "Speed Value", "float", 1.0, min_val=0.1, max_val=10, step=0.1),
                    CueParameter("add", "Speed Add", "float", 0.0, min_val=-5, max_val=5, step=0.1, tooltip="Increment instead of set"),
                    CueParameter("dur", "Ramp Duration", "float", 0.0, min_val=0, max_val=60, step=0.5),
                    CueParameter("ease", "Easing", "combo", "", options=["", "linear", "ease", "ease-in", "ease-out"]),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
            "nav": {
                "label": "Navigate",
                "params": [
                    CueParameter("target", "Target", "entry", "page1", tooltip="page1, scroll@A, scrollPaused@B, Coda"),
                    CueParameter("repeats", "Repeats", "spin", 0, min_val=0, max_val=99),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
            "page": {
                "label": "Page",
                "params": [
                    CueParameter("name", "Page Name", "entry", "page1"),
                    CueParameter("pattern", "Pattern", "combo", "", options=["", "Pseq", "Prand", "Pchoose"]),
                    CueParameter("pages", "Pages (comma-sep)", "entry", "", tooltip="page1,page2,page3"),
                    CueParameter("repeats", "Repeats", "spin", 1, min_val=1, max_val=99),
                ]
            },
            "stopwatch": {
                "label": "Stopwatch",
                "params": [
                    CueParameter("source", "Source", "combo", "new", options=["new", "main"]),
                    CueParameter("trig", "Trigger", "combo", "auto", options=["auto", "playhead"]),
                    CueParameter("scroll", "Scroll", "check", False),
                    CueParameter("hold", "Hold (sec)", "float", 0.0, min_val=0, max_val=999, step=1),
                    CueParameter("offsetX", "Offset X (px)", "spin", 0, min_val=-500, max_val=500),
                ]
            },
            "metro": {
                "label": "Metronome",
                "params": [
                    CueParameter("bpm", "BPM", "spin", 120, min_val=20, max_val=300),
                    CueParameter("beats", "Beats", "spin", 4, min_val=1, max_val=16),
                    CueParameter("visual", "Visual", "combo", "", options=["", "hex", "circle", "bar"]),
                    CueParameter("position", "Position", "combo", "", options=["", "scrolling"]),
                    CueParameter("trig", "Trigger", "combo", "playhead", options=["playhead", "auto"]),
                    CueParameter("target", "Target Element", "entry", ""),
                    CueParameter("colour", "Colour", "color", ""),
                    CueParameter("audio", "Audio Click", "check", False),
                    CueParameter("osc", "OSC Output", "check", False),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
        }
    },
    "animation": {
        "label": "Animation",
        "cues": {
            "scale": {
                "label": "Scale",
                "params": [
                    CueParameter("values", "Values", "entry", "1,1.3,1", tooltip="e.g., 1,1.5,1"),
                    CueParameter("min", "Min (continuous)", "float", 1.0, min_val=0.1, max_val=10, step=0.1),
                    CueParameter("max", "Max (continuous)", "float", 1.5, min_val=0.1, max_val=10, step=0.1),
                    CueParameter("dur", "Duration", "float", 2.0, min_val=0.1, max_val=120, step=0.5),
                    CueParameter("loop", "Loop (-1=∞)", "spin", 0, min_val=-1, max_val=999),
                    CueParameter("tdelay", "Trigger Delay", "float", 0.0, min_val=0, max_val=120, step=0.5),
                    CueParameter("mode", "Mode", "combo", "", options=["", "loop", "alt"]),
                    CueParameter("hold", "Hold", "float", 0.0, min_val=0, max_val=60, step=0.5),
                    CueParameter("osc", "OSC Output", "check", False),
                    CueParameter("oscaddr", "OSC Address", "entry", ""),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
            "scaleXY": {
                "label": "Scale XY",
                "params": [
                    CueParameter("x", "X Values", "entry", "1,1.3"),
                    CueParameter("y", "Y Values", "entry", "1,0.8"),
                    CueParameter("dur", "Duration", "float", 2.0, min_val=0.1, max_val=120, step=0.5),
                ]
            },
            "rotate": {
                "label": "Rotate",
                "params": [
                    CueParameter("values", "Values (degrees)", "entry", "0,120,240"),
                    CueParameter("dir", "Direction", "combo", "0", options=["0", "1", "-1"], tooltip="0=values, 1=CW, -1=CCW"),
                    CueParameter("dur", "Duration", "float", 2.0, min_val=0.1, max_val=120, step=0.5),
                    CueParameter("tdelay", "Trigger Delay", "float", 0.0, min_val=0, max_val=120, step=0.5),
                    CueParameter("mode", "Mode", "combo", "", options=["", "loop", "alt"]),
                ]
            },
            "o2p": {
                "label": "Object-to-Path",
                "params": [
                    CueParameter("path", "Path ID", "entry", "orbitPath"),
                    CueParameter("dur", "Duration", "float", 8.0, min_val=0.1, max_val=999, step=1),
                    CueParameter("tdelay", "Trigger Delay", "float", 0.0, min_val=0, max_val=120, step=0.5),
                    CueParameter("prestate", "Pre-state", "combo", "", options=["", "hide", "show"]),
                    CueParameter("rotate", "Rotation", "combo", "", options=["", "aligned", "spin"]),
                    CueParameter("rotoffset", "Rot Offset (°)", "spin", 0, min_val=-180, max_val=180),
                    CueParameter("rotspeed", "Spin Speed", "float", 1.0, min_val=0.1, max_val=10, step=0.1),
                    CueParameter("rotdir", "Spin Dir", "combo", "1", options=["1", "-1"]),
                    CueParameter("start", "Start (0-1)", "float", 0.0, min_val=0, max_val=1, step=0.05),
                    CueParameter("end", "End (0-1)", "float", 1.0, min_val=0, max_val=1, step=0.05),
                    CueParameter("mode", "Mode", "combo", "", options=["", "loop", "alt"]),
                    CueParameter("loop", "Loop Count", "spin", 0, min_val=0, max_val=999),
                ]
            },
        }
    },
    "visual": {
        "label": "Visual",
        "cues": {
            "color": {
                "label": "Color",
                "params": [
                    CueParameter("vals", "Colors", "entry", "#f00,#0f0", tooltip="#f00,#ff0,#0f0"),
                    CueParameter("dur", "Duration", "float", 2.0, min_val=0.1, max_val=120, step=0.5),
                    CueParameter("mode", "Mode", "combo", "", options=["", "loop", "alt"]),
                    CueParameter("uid", "Target UID", "entry", "", tooltip="Use * for wildcard"),
                ]
            },
            "fade": {
                "label": "Fade",
                "params": [
                    CueParameter("mode", "Fade Mode", "combo", "in", options=["in", "out", "pulse"]),
                    CueParameter("dur", "Duration", "float", 2.0, min_val=0.1, max_val=120, step=0.5),
                    CueParameter("from", "From (opacity)", "float", 0.0, min_val=0, max_val=1, step=0.1),
                    CueParameter("to", "To (opacity)", "float", 1.0, min_val=0, max_val=1, step=0.1),
                    CueParameter("target", "Target Element", "entry", ""),
                ]
            },
            "text": {
                "label": "Text",
                "params": [
                    CueParameter("srctype", "Source Type", "combo", "file", options=["file", "string"]),
                    CueParameter("src", "Source", "entry", "text.txt"),
                    CueParameter("mode", "Mode", "combo", "", options=["", "word", "char"]),
                    CueParameter("order", "Order", "combo", "seq", options=["seq", "rnd"]),
                    CueParameter("dur", "Duration", "float", 2.0, min_val=0.01, max_val=60, step=0.1),
                    CueParameter("gap", "Gap", "float", 0.0, min_val=0, max_val=60, step=0.1),
                    CueParameter("loop", "Loop", "spin", 0, min_val=0, max_val=999),
                    CueParameter("autostart", "Autostart", "check", True),
                    CueParameter("yslots", "Y Slots", "spin", 1, min_val=1, max_val=20),
                    CueParameter("yslotmode", "Y Slot Mode", "combo", "", options=["", "sequence", "random"]),
                    CueParameter("target", "Target Element", "entry", ""),
                    CueParameter("style", "CSS Style", "entry", ""),
                ]
            },
        }
    },
    "audio": {
        "label": "Audio / Video",
        "cues": {
            "audio": {
                "label": "Audio (Single)",
                "params": [
                    CueParameter("src", "Source File", "file", "sound.wav"),
                    CueParameter("loop", "Loop (-1=∞)", "spin", 0, min_val=-1, max_val=999),
                    CueParameter("amp", "Amplitude", "float", 1.0, min_val=0, max_val=2, step=0.1),
                    CueParameter("pan", "Pan", "entry", "0", tooltip="-1 to 1, or rand(-1,1)"),
                    CueParameter("pitch", "Pitch", "entry", "1", tooltip="or rand(0.8,1.3)"),
                    CueParameter("fade", "Fade In", "float", 0.0, min_val=0, max_val=60, step=0.5),
                    CueParameter("fadeOut", "Fade Out", "float", 0.0, min_val=0, max_val=60, step=0.5),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
            "audioPool": {
                "label": "Audio Pool",
                "params": [
                    CueParameter("path", "Directory", "entry", "sfx"),
                    CueParameter("mode", "Mode", "combo", "", options=["", "rand"]),
                    CueParameter("amp", "Amplitude", "entry", "1", tooltip="or rand(0.4,0.9)"),
                    CueParameter("pan", "Pan", "entry", "0"),
                    CueParameter("pitch", "Pitch", "entry", "1"),
                    CueParameter("fade", "Fade", "entry", ""),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
            "audioImpulse": {
                "label": "Audio Impulse",
                "params": [
                    CueParameter("path", "Directory", "entry", "perc"),
                    CueParameter("rate", "Rate", "spin", 20, min_val=1, max_val=100),
                    CueParameter("jitter", "Jitter", "float", 0.0, min_val=0, max_val=1, step=0.1),
                    CueParameter("amp", "Amplitude", "entry", "1"),
                    CueParameter("pan", "Pan", "entry", "0"),
                    CueParameter("pitch", "Pitch", "entry", "1"),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
            "video": {
                "label": "Video",
                "params": [
                    CueParameter("file", "Video File", "file", "video.mp4"),
                    CueParameter("size", "Size", "entry", "fs", tooltip="px or 'fs' for fullscreen"),
                    CueParameter("in", "In Point (sec)", "float", 0.0, min_val=0, max_val=9999, step=1),
                    CueParameter("out", "Out Point (sec)", "float", 0.0, min_val=0, max_val=9999, step=1),
                    CueParameter("opacity", "Opacity", "float", 1.0, min_val=0, max_val=1, step=0.1),
                    CueParameter("loop", "Loop", "spin", 0, min_val=-1, max_val=999),
                    CueParameter("speed", "Speed", "float", 1.0, min_val=0.1, max_val=10, step=0.1),
                    CueParameter("clickable", "Clickable", "check", True),
                    CueParameter("target", "Target Element", "entry", ""),
                    CueParameter("location", "Location", "combo", "", options=["", "scroll", "fixed"]),
                ]
            },
        }
    },
    "synth": {
        "label": "Synth",
        "cues": {
            "synth": {
                "label": "Synth",
                "params": [
                    CueParameter("uid", "UID (required)", "entry", "s1"),
                    CueParameter("wave", "Waveform", "combo", "sine", options=["sine", "triangle", "square", "sawtooth", "noise"]),
                    CueParameter("freq", "Frequency", "entry", "440", tooltip="Hz or [440,550,660] for chord"),
                    CueParameter("dur", "Duration (0=∞)", "float", 0.0, min_val=0, max_val=999, step=1),
                    CueParameter("lifetime", "Lifetime", "combo", "", options=["", "process"]),
                    CueParameter("env", "Envelope", "entry", "", tooltip="{a:0.5,r:1}"),
                    CueParameter("filter_type", "Filter", "combo", "", options=["", "lp", "hp", "bp"]),
                    CueParameter("filter_freq", "Filter Freq", "entry", "1000"),
                    CueParameter("osc", "OSC Output", "check", False),
                    CueParameter("oscAddr", "OSC Address", "entry", ""),
                ]
            },
            "synthStop": {
                "label": "Synth Stop",
                "params": [
                    CueParameter("uid", "UID to Stop", "entry", "s1"),
                    CueParameter("rel", "Release Time", "float", 0.5, min_val=0, max_val=10, step=0.1),
                ]
            },
        }
    },
    "osc": {
        "label": "OSC",
        "cues": {
            "osc": {
                "label": "OSC Event",
                "params": [
                    CueParameter("addr", "Address", "entry", "voice1"),
                    CueParameter("pitch_type", "Pitch Type", "combo", "y", options=["y", "hz", "midi", "deg"]),
                    CueParameter("pitch_val", "Pitch Value", "entry", "", tooltip="For hz/midi/deg"),
                    CueParameter("uid", "UID", "entry", ""),
                ]
            },
            "oscCtrl": {
                "label": "OSC Control Lane",
                "params": [
                    CueParameter("addr", "Address", "entry", "/fx/pan"),
                    CueParameter("min", "Min", "float", 0.0, min_val=-9999, max_val=9999, step=0.1),
                    CueParameter("max", "Max", "float", 1.0, min_val=-9999, max_val=9999, step=0.1),
                    CueParameter("mode", "Mode", "combo", "", options=["", "continuous", "event"]),
                ]
            },
        }
    },
    "interaction": {
        "label": "Interaction",
        "cues": {
            "button": {
                "label": "Button",
                "params": [
                    CueParameter("trigger", "Trigger Cue", "entry", "nav(page1)", tooltip="e.g., nav(page2), pause(dur:8)"),
                    CueParameter("target", "Target Element", "entry", ""),
                    CueParameter("label", "Label Text", "entry", ""),
                    CueParameter("size", "Size (WxH)", "entry", "", tooltip="e.g., 200x50"),
                    CueParameter("font", "Font", "entry", ""),
                    CueParameter("fontsize", "Font Size", "spin", 16, min_val=8, max_val=72),
                ]
            },
            "reuse": {
                "label": "Reuse (Define)",
                "params": [
                    CueParameter("name", "Collection Name", "entry", "mainMenu"),
                ]
            },
            "use": {
                "label": "Use (Reference)",
                "params": [
                    CueParameter("name", "Collection Name", "entry", "mainMenu"),
                ]
            },
        }
    },
}


class OscillaSmartCuesWindow(Gtk.Window):
    """Main window for the Smart Cues editor."""
    
    def __init__(self):
        super().__init__(title="OSCILLA Smart Cues")
        self.set_default_size(400, 600)
        self.set_border_width(10)
        
        # Current state
        self.current_category = "timing"
        self.current_cue = "pause"
        self.param_widgets = {}
        self.presets = self.load_presets()
        
        # Main layout
        main_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        self.add(main_box)
        
        # Category selector
        cat_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=5)
        cat_label = Gtk.Label(label="Category:")
        cat_box.pack_start(cat_label, False, False, 0)
        
        self.cat_combo = Gtk.ComboBoxText()
        for cat_id, cat_data in CUE_DEFINITIONS.items():
            self.cat_combo.append(cat_id, cat_data["label"])
        self.cat_combo.set_active_id("timing")
        self.cat_combo.connect("changed", self.on_category_changed)
        cat_box.pack_start(self.cat_combo, True, True, 0)
        main_box.pack_start(cat_box, False, False, 0)
        
        # Cue type selector
        cue_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=5)
        cue_label = Gtk.Label(label="Cue Type:")
        cue_box.pack_start(cue_label, False, False, 0)
        
        self.cue_combo = Gtk.ComboBoxText()
        self.cue_combo.connect("changed", self.on_cue_changed)
        cue_box.pack_start(self.cue_combo, True, True, 0)
        main_box.pack_start(cue_box, False, False, 0)
        
        # Preset selector
        preset_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=5)
        preset_label = Gtk.Label(label="Preset:")
        preset_box.pack_start(preset_label, False, False, 0)
        
        self.preset_combo = Gtk.ComboBoxText()
        self.preset_combo.connect("changed", self.on_preset_changed)
        preset_box.pack_start(self.preset_combo, True, True, 0)
        main_box.pack_start(preset_box, False, False, 0)
        
        # Separator
        main_box.pack_start(Gtk.Separator(), False, False, 5)
        
        # Parameters area (scrollable)
        params_scroll = Gtk.ScrolledWindow()
        params_scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        params_scroll.set_vexpand(True)
        
        self.params_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        self.params_box.set_margin_start(5)
        self.params_box.set_margin_end(5)
        params_scroll.add(self.params_box)
        main_box.pack_start(params_scroll, True, True, 0)
        
        # Separator
        main_box.pack_start(Gtk.Separator(), False, False, 5)
        
        # Preview
        preview_label = Gtk.Label(label="Preview:")
        preview_label.set_xalign(0)
        main_box.pack_start(preview_label, False, False, 0)
        
        # Use TextView for multi-line wrapping preview
        self.preview_text = Gtk.TextView()
        self.preview_text.set_editable(False)
        self.preview_text.set_wrap_mode(Gtk.WrapMode.WORD_CHAR)
        self.preview_text.set_cursor_visible(False)
        self.preview_text.modify_font(Pango.FontDescription("monospace 10"))
        
        # Put in a frame with fixed height
        preview_frame = Gtk.Frame()
        preview_frame.set_shadow_type(Gtk.ShadowType.IN)
        self.preview_text.set_size_request(-1, 50)  # Min height for ~2 lines
        preview_frame.add(self.preview_text)
        main_box.pack_start(preview_frame, False, False, 0)
        
        # Append mode checkbox
        self.append_check = Gtk.CheckButton(label="Append to existing ID (don't replace)")
        main_box.pack_start(self.append_check, False, False, 0)
        
        # Buttons
        btn_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
        btn_box.set_halign(Gtk.Align.END)
        
        copy_btn = Gtk.Button(label="Copy to Clipboard")
        copy_btn.connect("clicked", self.on_copy_clicked)
        btn_box.pack_start(copy_btn, False, False, 0)
        
        apply_btn = Gtk.Button(label="Apply to Selection")
        apply_btn.get_style_context().add_class("suggested-action")
        apply_btn.connect("clicked", self.on_apply_clicked)
        btn_box.pack_start(apply_btn, False, False, 0)
        
        main_box.pack_start(btn_box, False, False, 0)
        
        # Status bar
        self.status_label = Gtk.Label(label="Select element in Inkscape, then click Apply")
        self.status_label.set_xalign(0)
        self.status_label.get_style_context().add_class("dim-label")
        main_box.pack_start(self.status_label, False, False, 0)
        
        # Initialize
        self.populate_cue_combo()
        self.on_cue_changed(None)
    
    def load_presets(self):
        """Load presets from JSON file."""
        if os.path.exists(PRESETS_FILE):
            try:
                with open(PRESETS_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {}
    
    def populate_cue_combo(self):
        """Populate cue type combo based on selected category."""
        self.cue_combo.remove_all()
        cat_data = CUE_DEFINITIONS.get(self.current_category, {})
        cues = cat_data.get("cues", {})
        
        for cue_id, cue_data in cues.items():
            self.cue_combo.append(cue_id, cue_data["label"])
        
        if cues:
            first_cue = list(cues.keys())[0]
            self.cue_combo.set_active_id(first_cue)
    
    def populate_preset_combo(self):
        """Populate preset combo based on selected cue type."""
        self.preset_combo.remove_all()
        self.preset_combo.append("", "-- Custom --")
        
        # Try to find presets for current cue
        cat_presets = self.presets.get(self.current_category, {})
        cue_presets = cat_presets.get(self.current_cue, [])
        
        for i, preset in enumerate(cue_presets):
            preset_name = preset.get("name", f"Preset {i+1}")
            self.preset_combo.append(str(i), preset_name)
        
        self.preset_combo.set_active_id("")
    
    def build_params_ui(self):
        """Build parameter widgets for current cue type."""
        # Clear existing
        for child in self.params_box.get_children():
            self.params_box.remove(child)
        self.param_widgets = {}
        
        # Get cue definition
        cat_data = CUE_DEFINITIONS.get(self.current_category, {})
        cues = cat_data.get("cues", {})
        cue_data = cues.get(self.current_cue, {})
        params = cue_data.get("params", [])
        
        # Create widgets for each parameter
        for param in params:
            row = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=10)
            
            # Label
            label = Gtk.Label(label=param.label + ":")
            label.set_xalign(1)
            label.set_size_request(120, -1)
            row.pack_start(label, False, False, 0)
            
            # Widget based on type
            widget = self.create_param_widget(param)
            if param.tooltip:
                widget.set_tooltip_text(param.tooltip)
            row.pack_start(widget, True, True, 0)
            
            self.param_widgets[param.name] = (param, widget)
            self.params_box.pack_start(row, False, False, 0)
        
        self.params_box.show_all()
        self.update_preview()
    
    def create_param_widget(self, param):
        """Create appropriate widget for parameter type."""
        if param.widget_type == "entry" or param.widget_type == "file":
            widget = Gtk.Entry()
            widget.set_text(str(param.default) if param.default else "")
            widget.connect("changed", lambda w: self.update_preview())
            return widget
        
        elif param.widget_type == "spin":
            adj = Gtk.Adjustment(value=param.default or 0, 
                                 lower=param.min_val or 0, 
                                 upper=param.max_val or 100,
                                 step_increment=param.step or 1)
            widget = Gtk.SpinButton(adjustment=adj)
            widget.set_digits(0)
            widget.connect("value-changed", lambda w: self.update_preview())
            return widget
        
        elif param.widget_type == "float":
            adj = Gtk.Adjustment(value=param.default or 0, 
                                 lower=param.min_val or 0, 
                                 upper=param.max_val or 100,
                                 step_increment=param.step or 0.1)
            widget = Gtk.SpinButton(adjustment=adj)
            widget.set_digits(2)
            widget.connect("value-changed", lambda w: self.update_preview())
            return widget
        
        elif param.widget_type == "combo":
            widget = Gtk.ComboBoxText()
            for opt in param.options:
                display = opt if opt else "(none)"
                widget.append(opt, display)
            widget.set_active_id(param.default if param.default else "")
            widget.connect("changed", lambda w: self.update_preview())
            return widget
        
        elif param.widget_type == "check":
            widget = Gtk.CheckButton()
            widget.set_active(param.default or False)
            widget.connect("toggled", lambda w: self.update_preview())
            return widget
        
        elif param.widget_type == "color":
            box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=5)
            entry = Gtk.Entry()
            entry.set_text(param.default or "")
            entry.connect("changed", lambda w: self.update_preview())
            box.pack_start(entry, True, True, 0)
            
            btn = Gtk.ColorButton()
            btn.connect("color-set", lambda b: self.on_color_chosen(b, entry))
            box.pack_start(btn, False, False, 0)
            
            # Store entry as the main widget for value retrieval
            box.entry = entry
            return box
        
        # Default fallback
        widget = Gtk.Entry()
        widget.set_text(str(param.default) if param.default else "")
        widget.connect("changed", lambda w: self.update_preview())
        return widget
    
    def on_color_chosen(self, button, entry):
        """Handle color picker selection."""
        color = button.get_rgba()
        hex_color = "#{:02x}{:02x}{:02x}".format(
            int(color.red * 255),
            int(color.green * 255),
            int(color.blue * 255)
        )
        entry.set_text(hex_color)
    
    def get_param_value(self, param, widget):
        """Get value from parameter widget."""
        if param.widget_type == "entry" or param.widget_type == "file":
            return widget.get_text()
        elif param.widget_type == "spin":
            return int(widget.get_value())
        elif param.widget_type == "float":
            return widget.get_value()
        elif param.widget_type == "combo":
            return widget.get_active_id() or ""
        elif param.widget_type == "check":
            return widget.get_active()
        elif param.widget_type == "color":
            return widget.entry.get_text()
        return ""
    
    def set_param_value(self, param, widget, value):
        """Set value on parameter widget."""
        if param.widget_type == "entry" or param.widget_type == "file":
            widget.set_text(str(value) if value else "")
        elif param.widget_type == "spin":
            widget.set_value(int(value) if value else 0)
        elif param.widget_type == "float":
            widget.set_value(float(value) if value else 0)
        elif param.widget_type == "combo":
            widget.set_active_id(str(value) if value else "")
        elif param.widget_type == "check":
            widget.set_active(bool(value))
        elif param.widget_type == "color":
            widget.entry.set_text(str(value) if value else "")
    
    def build_cue_string(self):
        """Build the cue string from current parameters."""
        params = []
        
        for name, (param, widget) in self.param_widgets.items():
            value = self.get_param_value(param, widget)
            
            # Skip empty/default values
            if value == "" or value is None:
                continue
            if param.widget_type == "check" and not value:
                continue
            if param.widget_type in ["spin", "float"] and value == param.default:
                # Include anyway for key params
                if name not in ["dur", "bpm", "rate", "freq"]:
                    continue
            
            # Format value
            if param.widget_type == "check":
                params.append(f"{name}:true")
            elif param.widget_type == "entry" and " " in str(value):
                params.append(f'{name}:"{value}"')
            elif name == "vals" or name == "values" or name == "freq":
                # Array values
                val_str = str(value)
                if not val_str.startswith("["):
                    val_str = f"[{val_str}]"
                params.append(f"{name}:{val_str}")
            else:
                params.append(f"{name}:{value}")
        
        # Build final cue string
        cue_name = self.current_cue
        
        # Special handling for some cues
        if cue_name == "nav":
            target = self.get_param_value(*self.param_widgets.get("target", (None, None))) if "target" in self.param_widgets else "page1"
            other_params = [p for p in params if not p.startswith("target:")]
            if other_params:
                return f"{cue_name}({target}, {', '.join(other_params)})"
            return f"{cue_name}({target})"
        
        if cue_name == "page":
            pattern = self.get_param_value(*self.param_widgets.get("pattern", (None, None))) if "pattern" in self.param_widgets else ""
            name_val = self.get_param_value(*self.param_widgets.get("name", (None, None))) if "name" in self.param_widgets else "page1"
            pages = self.get_param_value(*self.param_widgets.get("pages", (None, None))) if "pages" in self.param_widgets else ""
            repeats = self.get_param_value(*self.param_widgets.get("repeats", (None, None))) if "repeats" in self.param_widgets else 1
            
            if pattern:
                page_list = pages if pages else name_val
                if pattern == "Pchoose":
                    return f"page({pattern}([{page_list}]))"
                return f"page({pattern}([{page_list}],{repeats}))"
            return f"page({name_val})"
        
        if cue_name == "osc":
            addr = self.get_param_value(*self.param_widgets.get("addr", (None, None))) if "addr" in self.param_widgets else "voice1"
            pitch_type = self.get_param_value(*self.param_widgets.get("pitch_type", (None, None))) if "pitch_type" in self.param_widgets else "y"
            pitch_val = self.get_param_value(*self.param_widgets.get("pitch_val", (None, None))) if "pitch_val" in self.param_widgets else ""
            uid = self.get_param_value(*self.param_widgets.get("uid", (None, None))) if "uid" in self.param_widgets else ""
            
            parts = [f"addr:{addr}"]
            if pitch_type == "y":
                parts.append("pitch:y")
            elif pitch_val:
                parts.append(f"pitch:{pitch_type}({pitch_val})")
            else:
                parts.append("pitch:y")
            if uid:
                parts.append(f"uid:{uid}")
            return f"osc({', '.join(parts)})"
        
        if cue_name == "reuse" or cue_name == "use":
            name_val = self.get_param_value(*self.param_widgets.get("name", (None, None))) if "name" in self.param_widgets else "collection1"
            return f"{cue_name}({name_val})"
        
        if cue_name == "synth" and "filter_type" in self.param_widgets:
            # Handle filter specially
            filter_type = self.get_param_value(*self.param_widgets.get("filter_type", (None, None)))
            filter_freq = self.get_param_value(*self.param_widgets.get("filter_freq", (None, None)))
            
            # Remove filter params from main list
            params = [p for p in params if not p.startswith("filter_")]
            
            if filter_type:
                params.append(f"filter:{{type:{filter_type},freq:{filter_freq}}}")
        
        return f"{cue_name}({', '.join(params)})"
    
    def update_preview(self):
        """Update the preview text with current cue string."""
        cue_string = self.build_cue_string()
        self.preview_text.get_buffer().set_text(cue_string)
    
    def on_category_changed(self, combo):
        """Handle category selection change."""
        self.current_category = self.cat_combo.get_active_id()
        self.populate_cue_combo()
    
    def on_cue_changed(self, combo):
        """Handle cue type selection change."""
        self.current_cue = self.cue_combo.get_active_id()
        if self.current_cue:
            self.populate_preset_combo()
            self.build_params_ui()
    
    def on_preset_changed(self, combo):
        """Handle preset selection change."""
        preset_id = self.preset_combo.get_active_id()
        if not preset_id:
            return
        
        try:
            preset_idx = int(preset_id)
            cat_presets = self.presets.get(self.current_category, {})
            cue_presets = cat_presets.get(self.current_cue, [])
            
            if preset_idx < len(cue_presets):
                preset = cue_presets[preset_idx]
                params = preset.get("params", {})
                
                # Apply preset values
                for name, value in params.items():
                    if name in self.param_widgets:
                        param, widget = self.param_widgets[name]
                        self.set_param_value(param, widget, value)
                
                self.update_preview()
        except (ValueError, IndexError):
            pass
    
    def on_copy_clicked(self, button):
        """Copy cue string to clipboard."""
        cue_string = self.build_cue_string()
        clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
        clipboard.set_text(cue_string, -1)
        self.status_label.set_text(f"Copied: {cue_string[:40]}...")
    
    def on_apply_clicked(self, button):
        """Apply cue to Inkscape selection via temp file and trigger Inkscape."""
        cue_string = self.build_cue_string()
        
        # Add append marker if needed
        if self.append_check.get_active():
            cue_string = "APPEND:" + cue_string
        
        # Write to temp file
        try:
            with open(TEMP_CUE_FILE, 'w') as f:
                f.write(cue_string)
            
            # Also copy to clipboard
            clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
            clipboard.set_text(cue_string.replace("APPEND:", ""), -1)
            
            # Try to trigger Inkscape extension automatically
            triggered = self.trigger_inkscape_apply()
            
            if triggered:
                self.status_label.set_text(f"Applied: {cue_string[:40]}...")
            else:
                self.status_label.set_text(f"Queued: {cue_string[:35]}... (run Apply Queued Cue)")
                
        except Exception as e:
            self.status_label.set_text(f"Error: {e}")
    
    def trigger_inkscape_apply(self):
        """Try to trigger Inkscape's Apply Queued Cue extension."""
        import subprocess
        import shutil
        
        # Method 1: Try inkscape --actions (Inkscape 1.0+)
        # The action name for extensions is typically: org.inkscape.effect.{extension_id}
        try:
            # Find running Inkscape and send action via DBus or command
            result = subprocess.run(
                ['inkscape', '--action-list'],
                capture_output=True,
                text=True,
                timeout=2
            )
            # Check if our extension action exists
            if 'oscilla' in result.stdout.lower():
                subprocess.Popen(
                    ['inkscape', '--actions', 'org.oscilla.apply_cue'],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                return True
        except:
            pass
        
        # Method 2: Try xdotool to send keyboard shortcut (if user has one bound)
        if shutil.which('xdotool'):
            try:
                # First, try to focus Inkscape window
                subprocess.run(
                    ['xdotool', 'search', '--name', 'Inkscape', 'windowactivate', '--sync'],
                    timeout=2,
                    capture_output=True
                )
                # Small delay for window focus
                import time
                time.sleep(0.1)
                # Send Ctrl+Shift+Q (common binding)
                subprocess.run(
                    ['xdotool', 'key', 'ctrl+shift+q'],
                    timeout=1,
                    capture_output=True
                )
                return True
            except:
                pass
        
        return False


def main():
    win = OscillaSmartCuesWindow()
    win.connect("destroy", Gtk.main_quit)
    win.show_all()
    Gtk.main()


if __name__ == "__main__":
    main()
