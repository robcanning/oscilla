#!/usr/bin/env python3
"""
OSCILLA Cue Editor - Inkscape Extension
Generates OSCILLA DSL cue strings for SVG element IDs

Author: Generated for OSCILLA project
Version: 1.0.0
"""

import inkex
from inkex import EffectExtension


class OscillaCueEditor(EffectExtension):
    """Inkscape extension for applying OSCILLA cues to SVG elements."""

    def add_arguments(self, pars):
        """Define all extension parameters."""
        
        # Main tab selection
        pars.add_argument("--tab", type=str, default="timing")
        
        # ===== TIMING & NAVIGATION =====
        pars.add_argument("--timing_type", type=str, default="stop")
        
        # Stop
        pars.add_argument("--stop_uid", type=str, default="")
        pars.add_argument("--stop_next", type=str, default="")
        
        # Pause
        pars.add_argument("--pause_dur", type=float, default=4)
        pars.add_argument("--pause_count", type=inkex.Boolean, default=False)
        pars.add_argument("--pause_next", type=str, default="")
        
        # Speed
        pars.add_argument("--speed_value", type=float, default=1.0)
        pars.add_argument("--speed_add", type=float, default=0)
        pars.add_argument("--speed_dur", type=float, default=0)
        pars.add_argument("--speed_ease", type=str, default="")
        pars.add_argument("--speed_uid", type=str, default="")
        
        # Nav
        pars.add_argument("--nav_target", type=str, default="page1")
        pars.add_argument("--nav_paused", type=inkex.Boolean, default=False)
        pars.add_argument("--nav_repeats", type=int, default=0)
        pars.add_argument("--nav_uid", type=str, default="")
        
        # Page
        pars.add_argument("--page_name", type=str, default="page1")
        pars.add_argument("--page_pattern", type=str, default="")
        pars.add_argument("--page_list", type=str, default="")
        pars.add_argument("--page_repeats", type=int, default=1)
        
        # Stopwatch
        pars.add_argument("--sw_source", type=str, default="new")
        pars.add_argument("--sw_trig", type=str, default="auto")
        pars.add_argument("--sw_scroll", type=inkex.Boolean, default=False)
        pars.add_argument("--sw_hold", type=float, default=0)
        pars.add_argument("--sw_offsetX", type=int, default=0)
        
        # Metro
        pars.add_argument("--metro_bpm", type=int, default=120)
        pars.add_argument("--metro_beats", type=int, default=4)
        pars.add_argument("--metro_visual", type=str, default="")
        pars.add_argument("--metro_position", type=str, default="")
        pars.add_argument("--metro_trig", type=str, default="auto")
        pars.add_argument("--metro_target", type=str, default="")
        pars.add_argument("--metro_colour", type=str, default="")
        pars.add_argument("--metro_audio", type=inkex.Boolean, default=False)
        pars.add_argument("--metro_osc", type=inkex.Boolean, default=False)
        pars.add_argument("--metro_uid", type=str, default="")
        
        # ===== ANIMATION =====
        pars.add_argument("--anim_type", type=str, default="scale")
        
        # Scale
        pars.add_argument("--scale_values", type=str, default="1,1.5,1")
        pars.add_argument("--scale_min", type=float, default=1)
        pars.add_argument("--scale_max", type=float, default=1.5)
        pars.add_argument("--scale_dur", type=float, default=2)
        pars.add_argument("--scale_loop", type=int, default=0)
        pars.add_argument("--scale_tdelay", type=float, default=0)
        pars.add_argument("--scale_mode", type=str, default="")
        pars.add_argument("--scale_hold", type=float, default=0)
        pars.add_argument("--scale_osc", type=inkex.Boolean, default=False)
        pars.add_argument("--scale_oscaddr", type=str, default="")
        pars.add_argument("--scale_uid", type=str, default="")
        
        # ScaleXY
        pars.add_argument("--scalexy_x", type=str, default="1,1.3")
        pars.add_argument("--scalexy_y", type=str, default="1,0.6")
        pars.add_argument("--scalexy_dur", type=float, default=1)
        
        # Rotate
        pars.add_argument("--rotate_values", type=str, default="0,120,240")
        pars.add_argument("--rotate_dir", type=str, default="")
        pars.add_argument("--rotate_dur", type=float, default=2)
        pars.add_argument("--rotate_tdelay", type=float, default=0)
        pars.add_argument("--rotate_mode", type=str, default="")
        
        # O2P
        pars.add_argument("--o2p_path", type=str, default="orbitA")
        pars.add_argument("--o2p_dur", type=float, default=8)
        pars.add_argument("--o2p_tdelay", type=float, default=0)
        pars.add_argument("--o2p_prestate", type=str, default="")
        pars.add_argument("--o2p_rotate", type=str, default="")
        pars.add_argument("--o2p_rotoffset", type=int, default=0)
        pars.add_argument("--o2p_rotspeed", type=float, default=1)
        pars.add_argument("--o2p_rotdir", type=str, default="1")
        pars.add_argument("--o2p_start", type=float, default=0)
        pars.add_argument("--o2p_end", type=float, default=1)
        pars.add_argument("--o2p_mode", type=str, default="")
        pars.add_argument("--o2p_loop", type=int, default=0)
        
        # ===== COLOR & FADE =====
        pars.add_argument("--color_type", type=str, default="color")
        
        # Color
        pars.add_argument("--color_uid", type=str, default="")
        pars.add_argument("--color_vals", type=str, default="#f00,#0f0")
        pars.add_argument("--color_dur", type=float, default=2)
        pars.add_argument("--color_mode", type=str, default="")
        
        # Fade
        pars.add_argument("--fade_mode", type=str, default="out")
        pars.add_argument("--fade_dur", type=float, default=2)
        pars.add_argument("--fade_from", type=float, default=1)
        pars.add_argument("--fade_to", type=float, default=0)
        pars.add_argument("--fade_target", type=str, default="")
        
        # ===== TEXT =====
        pars.add_argument("--text_src_type", type=str, default="file")
        pars.add_argument("--text_src", type=str, default="foo.txt")
        pars.add_argument("--text_mode", type=str, default="")
        pars.add_argument("--text_order", type=str, default="seq")
        pars.add_argument("--text_dur", type=float, default=3)
        pars.add_argument("--text_gap", type=float, default=0)
        pars.add_argument("--text_loop", type=int, default=0)
        pars.add_argument("--text_autostart", type=inkex.Boolean, default=True)
        pars.add_argument("--text_yslots", type=int, default=1)
        pars.add_argument("--text_yslotmode", type=str, default="")
        pars.add_argument("--text_target", type=str, default="")
        pars.add_argument("--text_style", type=str, default="")
        
        # ===== AUDIO =====
        pars.add_argument("--audio_type", type=str, default="audio")
        
        # Audio single
        pars.add_argument("--audio_src", type=str, default="sound.wav")
        pars.add_argument("--audio_loop", type=int, default=0)
        pars.add_argument("--audio_amp", type=float, default=1)
        pars.add_argument("--audio_pan", type=str, default="0")
        pars.add_argument("--audio_pitch", type=str, default="1")
        pars.add_argument("--audio_fade", type=float, default=0)
        pars.add_argument("--audio_fadeout", type=float, default=0)
        pars.add_argument("--audio_uid", type=str, default="")
        
        # Audio pool/impulse
        pars.add_argument("--pool_path", type=str, default="sfx")
        pars.add_argument("--pool_mode", type=str, default="")
        pars.add_argument("--impulse_rate", type=int, default=30)
        pars.add_argument("--impulse_jitter", type=float, default=0)
        pars.add_argument("--pool_amp", type=str, default="1")
        pars.add_argument("--pool_pan", type=str, default="0")
        pars.add_argument("--pool_pitch", type=str, default="1")
        pars.add_argument("--pool_fade", type=str, default="")
        pars.add_argument("--pool_uid", type=str, default="")
        
        # ===== VIDEO =====
        pars.add_argument("--video_file", type=str, default="intro.mp4")
        pars.add_argument("--video_size", type=str, default="fs")
        pars.add_argument("--video_in", type=float, default=0)
        pars.add_argument("--video_out", type=float, default=0)
        pars.add_argument("--video_opacity", type=float, default=1)
        pars.add_argument("--video_loop", type=int, default=0)
        pars.add_argument("--video_speed", type=float, default=1)
        pars.add_argument("--video_clickable", type=inkex.Boolean, default=True)
        pars.add_argument("--video_target", type=str, default="")
        pars.add_argument("--video_location", type=str, default="")
        
        # ===== SYNTH =====
        pars.add_argument("--synth_action", type=str, default="synth")
        pars.add_argument("--synth_uid", type=str, default="synth1")
        pars.add_argument("--synth_wave", type=str, default="sine")
        pars.add_argument("--synth_freq", type=str, default="440")
        pars.add_argument("--synth_dur", type=float, default=0)
        pars.add_argument("--synth_lifetime", type=str, default="")
        pars.add_argument("--synth_env", type=str, default="")
        pars.add_argument("--synth_filter_type", type=str, default="")
        pars.add_argument("--synth_filter_freq", type=str, default="1000")
        pars.add_argument("--synth_osc", type=inkex.Boolean, default=False)
        pars.add_argument("--synth_oscaddr", type=str, default="")
        pars.add_argument("--synth_rel", type=float, default=0.5)
        
        # ===== OSC =====
        pars.add_argument("--osc_type", type=str, default="osc")
        pars.add_argument("--osc_addr", type=str, default="v1")
        pars.add_argument("--osc_pitch", type=str, default="y")
        pars.add_argument("--osc_pitch_val", type=str, default="")
        pars.add_argument("--osc_uid", type=str, default="")
        pars.add_argument("--oscctrl_addr", type=str, default="/fx/pan")
        pars.add_argument("--oscctrl_min", type=float, default=0)
        pars.add_argument("--oscctrl_max", type=float, default=1)
        pars.add_argument("--oscctrl_mode", type=str, default="")
        
        # ===== INTERACTION =====
        pars.add_argument("--int_type", type=str, default="button")
        pars.add_argument("--btn_trigger", type=str, default="nav(page1)")
        pars.add_argument("--btn_target", type=str, default="")
        pars.add_argument("--btn_size", type=str, default="")
        pars.add_argument("--btn_label", type=str, default="")
        pars.add_argument("--btn_font", type=str, default="")
        pars.add_argument("--btn_fontsize", type=int, default=16)
        pars.add_argument("--reuse_name", type=str, default="mainMenu")
        
        # ===== PROPAGATE =====
        pars.add_argument("--prop_cue_type", type=str, default="osc")
        pars.add_argument("--prop_osc_addr", type=str, default="voice")
        pars.add_argument("--prop_osc_pitch", type=str, default="y")
        pars.add_argument("--prop_osc_env", type=str, default="")
        pars.add_argument("--prop_osc_trig", type=str, default="")
        pars.add_argument("--prop_scale_randomize", type=inkex.Boolean, default=True)
        pars.add_argument("--prop_scale_min", type=float, default=0.8)
        pars.add_argument("--prop_scale_max", type=float, default=1.6)
        pars.add_argument("--prop_dur_min", type=float, default=0.4)
        pars.add_argument("--prop_dur_max", type=float, default=1.2)
        
        # ===== UTILITY =====
        pars.add_argument("--util_action", type=str, default="view")
        pars.add_argument("--custom_cue", type=str, default="")

    def build_timing_cue(self):
        """Build timing and navigation cue strings."""
        opts = self.options
        cue_type = opts.timing_type
        
        if cue_type == "stop":
            params = []
            if opts.stop_uid:
                params.append(f"uid:{opts.stop_uid}")
            if opts.stop_next:
                params.append(f"next:{opts.stop_next}")
            return f"stop({', '.join(params)})" if params else "stop()"
        
        elif cue_type == "pause":
            params = [f"dur:{opts.pause_dur}"]
            if opts.pause_count:
                params.append("count:true")
            if opts.pause_next:
                params.append(f"next:{opts.pause_next}")
            return f"pause({', '.join(params)})"
        
        elif cue_type == "speed":
            params = []
            if opts.speed_add != 0:
                params.append(f"add:{opts.speed_add}")
            else:
                params.append(f"value:{opts.speed_value}")
            if opts.speed_dur > 0:
                params.append(f"dur:{opts.speed_dur}")
            if opts.speed_ease:
                params.append(f"ease:{opts.speed_ease}")
            if opts.speed_uid:
                params.append(f"uid:{opts.speed_uid}")
            return f"speed({', '.join(params)})"
        
        elif cue_type == "nav":
            target = opts.nav_target
            if opts.nav_paused and target.startswith("scroll@"):
                target = target.replace("scroll@", "scrollPaused@")
            params = [target]
            if opts.nav_repeats > 0:
                params.append(f"repeats:{opts.nav_repeats}")
            if opts.nav_uid:
                params.append(f"uid:{opts.nav_uid}")
            if len(params) == 1:
                return f"nav({target})"
            return f"nav({params[0]}, {', '.join(params[1:])})"
        
        elif cue_type == "page":
            if opts.page_pattern:
                pages = opts.page_list if opts.page_list else opts.page_name
                if opts.page_pattern == "Pchoose":
                    return f"page({opts.page_pattern}([{pages}]))"
                return f"page({opts.page_pattern}([{pages}],{opts.page_repeats}))"
            return f"page({opts.page_name})"
        
        elif cue_type == "stopwatch":
            params = [f"source:{opts.sw_source}"]
            params.append(f"trig:{opts.sw_trig}")
            if opts.sw_scroll:
                params.append("scroll:true")
            if opts.sw_hold > 0:
                params.append(f"hold:{opts.sw_hold}")
            if opts.sw_offsetX != 0:
                params.append(f"offsetX:{opts.sw_offsetX}")
            return f"stopwatch({', '.join(params)})"
        
        elif cue_type == "metro":
            params = [f"bpm:{opts.metro_bpm}"]
            if opts.metro_beats != 4:
                params.append(f"beats:{opts.metro_beats}")
            if opts.metro_visual:
                params.append(f"visual:{opts.metro_visual}")
            if opts.metro_position:
                params.append(f"position:{opts.metro_position}")
            params.append(f"trig:{opts.metro_trig}")
            if opts.metro_target:
                params.append(f"target:{opts.metro_target}")
            if opts.metro_colour:
                params.append(f"colour:{opts.metro_colour}")
            if opts.metro_audio:
                params.append("audio:1")
            if opts.metro_osc:
                params.append("osc:1")
            if opts.metro_uid:
                params.append(f"uid:{opts.metro_uid}")
            return f"metro({', '.join(params)})"
        
        return ""

    def build_animation_cue(self):
        """Build animation cue strings."""
        opts = self.options
        anim_type = opts.anim_type
        
        if anim_type == "scale":
            params = []
            if opts.scale_mode == "alt" or (opts.scale_min != 1 or opts.scale_max != 1.5):
                # Use min/max mode
                params.append(f"min:{opts.scale_min}")
                params.append(f"max:{opts.scale_max}")
            else:
                # Use values array
                vals = opts.scale_values.strip()
                if not vals.startswith("["):
                    vals = f"[{vals}]"
                params.append(f"values:{vals}")
            
            params.append(f"dur:{opts.scale_dur}")
            
            if opts.scale_loop != 0:
                params.append(f"loop:{opts.scale_loop}")
            if opts.scale_tdelay > 0:
                params.append(f"tdelay:{opts.scale_tdelay}")
            if opts.scale_mode:
                params.append(f"mode:{opts.scale_mode}")
            if opts.scale_hold > 0:
                params.append(f"hold:{opts.scale_hold}")
            if opts.scale_osc:
                params.append("osc:1")
            if opts.scale_oscaddr:
                params.append(f'oscaddr:"{opts.scale_oscaddr}"')
            if opts.scale_uid:
                params.append(f"uid:{opts.scale_uid}")
            
            return f"scale({', '.join(params)})"
        
        elif anim_type == "scaleXY":
            x_vals = opts.scalexy_x.strip()
            y_vals = opts.scalexy_y.strip()
            if not x_vals.startswith("["):
                x_vals = f"[{x_vals}]"
            if not y_vals.startswith("["):
                y_vals = f"[{y_vals}]"
            return f"scaleXY({x_vals},{y_vals}, dur:{opts.scalexy_dur})"
        
        elif anim_type == "rotate":
            params = []
            if opts.rotate_dir:
                params.append(f"dir:{opts.rotate_dir}")
            else:
                vals = opts.rotate_values.strip()
                if not vals.startswith("["):
                    vals = f"[{vals}]"
                params.append(f"values:{vals}")
            
            params.append(f"dur:{opts.rotate_dur}")
            
            if opts.rotate_tdelay > 0:
                params.append(f"tdelay:{opts.rotate_tdelay}")
            if opts.rotate_mode:
                params.append(f"mode:{opts.rotate_mode}")
            
            return f"rotate({', '.join(params)})"
        
        elif anim_type == "o2p":
            params = [f"path:{opts.o2p_path}"]
            params.append(f"dur:{opts.o2p_dur}")
            
            if opts.o2p_tdelay > 0:
                params.append(f"tdelay:{opts.o2p_tdelay}")
            if opts.o2p_prestate:
                params.append(f"prestate:{opts.o2p_prestate}")
            if opts.o2p_rotate:
                params.append(f"rotate:{opts.o2p_rotate}")
                if opts.o2p_rotoffset != 0:
                    params.append(f"rotoffset:{opts.o2p_rotoffset}")
                if opts.o2p_rotate == "spin":
                    if opts.o2p_rotspeed != 1:
                        params.append(f"rotspeed:{opts.o2p_rotspeed}")
                    params.append(f"rotdir:{opts.o2p_rotdir}")
            if opts.o2p_start > 0:
                params.append(f"start:{opts.o2p_start}")
            if opts.o2p_end < 1:
                params.append(f"end:{opts.o2p_end}")
            if opts.o2p_mode:
                params.append(f"mode:{opts.o2p_mode}")
            if opts.o2p_loop > 0:
                params.append(f"loop:{opts.o2p_loop}")
            
            return f"o2p({', '.join(params)})"
        
        return ""

    def build_color_cue(self):
        """Build color and fade cue strings."""
        opts = self.options
        
        if opts.color_type == "color":
            params = []
            if opts.color_uid:
                params.append(f"uid:{opts.color_uid}")
            
            vals = opts.color_vals.strip()
            if not vals.startswith("["):
                vals = f"[{vals}]"
            params.append(f"vals:{vals}")
            params.append(f"dur:{opts.color_dur}")
            
            if opts.color_mode:
                params.append(f"mode:{opts.color_mode}")
            
            return f"color({', '.join(params)})"
        
        elif opts.color_type == "fade":
            params = [f"mode:{opts.fade_mode}"]
            params.append(f"dur:{opts.fade_dur}")
            params.append(f"from:{opts.fade_from}")
            params.append(f"to:{opts.fade_to}")
            
            if opts.fade_target:
                params.append(f"target:{opts.fade_target}")
            
            return f"fade({', '.join(params)})"
        
        return ""

    def build_text_cue(self):
        """Build text cue string."""
        opts = self.options
        params = []
        
        # Source
        if opts.text_src_type == "string":
            params.append(f'src:"{opts.text_src}"')
        else:
            params.append(f"src:{opts.text_src}")
        
        # Mode
        if opts.text_mode:
            params.append(f"mode:{opts.text_mode}")
        
        params.append(f"order:{opts.text_order}")
        params.append(f"dur:{opts.text_dur}")
        
        if opts.text_gap > 0:
            params.append(f"gap:{opts.text_gap}")
        if opts.text_loop > 0:
            params.append(f"loop:{opts.text_loop}")
        if opts.text_autostart:
            params.append("autostart:1")
        if opts.text_yslots > 1:
            params.append(f"yslots:{opts.text_yslots}")
        if opts.text_yslotmode:
            params.append(f"yslotmode:{opts.text_yslotmode}")
        if opts.text_target:
            params.append(f"target:{opts.text_target}")
        if opts.text_style:
            params.append(f'style:"{opts.text_style}"')
        
        return f"text({', '.join(params)})"

    def build_audio_cue(self):
        """Build audio cue strings."""
        opts = self.options
        
        if opts.audio_type == "audio":
            params = [f"src:{opts.audio_src}"]
            if opts.audio_loop > 0:
                params.append(f"loop:{opts.audio_loop}")
            if opts.audio_amp != 1:
                params.append(f"amp:{opts.audio_amp}")
            if opts.audio_pan != "0":
                params.append(f"pan:{opts.audio_pan}")
            if opts.audio_pitch != "1":
                params.append(f"pitch:{opts.audio_pitch}")
            if opts.audio_fade > 0:
                params.append(f"fade:{opts.audio_fade}")
            if opts.audio_fadeout > 0:
                params.append(f"fadeOut:{opts.audio_fadeout}")
            if opts.audio_uid:
                params.append(f"uid:{opts.audio_uid}")
            return f"audio({', '.join(params)})"
        
        elif opts.audio_type == "audioPool":
            params = [f"path:{opts.pool_path}"]
            if opts.pool_mode:
                params.append(f"mode:{opts.pool_mode}")
            if opts.pool_amp != "1":
                params.append(f"amp:{opts.pool_amp}")
            if opts.pool_pan != "0":
                params.append(f"pan:{opts.pool_pan}")
            if opts.pool_pitch != "1":
                params.append(f"pitch:{opts.pool_pitch}")
            if opts.pool_fade:
                params.append(f"fade:{opts.pool_fade}")
            if opts.pool_uid:
                params.append(f"uid:{opts.pool_uid}")
            return f"audioPool({', '.join(params)})"
        
        elif opts.audio_type == "audioImpulse":
            params = [f"path:{opts.pool_path}"]
            params.append(f"rate:{opts.impulse_rate}")
            if opts.impulse_jitter > 0:
                params.append(f"jitter:{opts.impulse_jitter}")
            if opts.pool_amp != "1":
                params.append(f"amp:{opts.pool_amp}")
            if opts.pool_pan != "0":
                params.append(f"pan:{opts.pool_pan}")
            if opts.pool_pitch != "1":
                params.append(f"pitch:{opts.pool_pitch}")
            if opts.pool_uid:
                params.append(f"uid:{opts.pool_uid}")
            return f"audioImpulse({', '.join(params)})"
        
        return ""

    def build_video_cue(self):
        """Build video cue string."""
        opts = self.options
        params = [f"file:{opts.video_file}"]
        params.append(f"size:{opts.video_size}")
        
        if opts.video_in > 0:
            params.append(f"in:{opts.video_in}")
        if opts.video_out > 0:
            params.append(f"out:{opts.video_out}")
        if opts.video_opacity != 1:
            params.append(f"opacity:{opts.video_opacity}")
        if opts.video_loop > 0:
            params.append(f"loop:{opts.video_loop}")
        if opts.video_speed != 1:
            params.append(f"speed:{opts.video_speed}")
        if opts.video_clickable:
            params.append("clickable:1")
        if opts.video_target:
            params.append(f"target:{opts.video_target}")
        if opts.video_location:
            params.append(f"location:{opts.video_location}")
        
        return f"video({', '.join(params)})"

    def build_synth_cue(self):
        """Build synth cue strings."""
        opts = self.options
        
        if opts.synth_action == "synthStop":
            params = [f"uid:{opts.synth_uid}"]
            if opts.synth_rel > 0:
                params.append(f"rel:{opts.synth_rel}")
            return f"synthStop({', '.join(params)})"
        
        # synth start
        params = [f"uid:{opts.synth_uid}"]
        params.append(f"wave:{opts.synth_wave}")
        params.append(f"freq:{opts.synth_freq}")
        
        if opts.synth_dur > 0:
            params.append(f"dur:{opts.synth_dur}")
        if opts.synth_lifetime:
            params.append(f"lifetime:{opts.synth_lifetime}")
        if opts.synth_env:
            params.append(f"env:{opts.synth_env}")
        if opts.synth_filter_type:
            params.append(f"filter:{{type:{opts.synth_filter_type},freq:{opts.synth_filter_freq}}}")
        if opts.synth_osc:
            params.append("osc:1")
        if opts.synth_oscaddr:
            params.append(f"oscAddr:{opts.synth_oscaddr}")
        
        return f"synth({', '.join(params)})"

    def build_osc_cue(self):
        """Build OSC cue strings."""
        opts = self.options
        
        if opts.osc_type == "osc":
            params = [f"addr:{opts.osc_addr}"]
            
            # Build pitch parameter
            pitch_type = opts.osc_pitch
            if pitch_type == "y":
                params.append("pitch:y")
            elif pitch_type == "hz" and opts.osc_pitch_val:
                params.append(f"pitch:hz({opts.osc_pitch_val})")
            elif pitch_type == "midi" and opts.osc_pitch_val:
                params.append(f"pitch:midi({opts.osc_pitch_val})")
            elif pitch_type == "deg" and opts.osc_pitch_val:
                params.append(f"pitch:deg({opts.osc_pitch_val})")
            else:
                params.append("pitch:y")
            
            if opts.osc_uid:
                params.append(f"uid:{opts.osc_uid}")
            
            return f"osc({', '.join(params)})"
        
        elif opts.osc_type == "oscCtrl":
            params = [f'addr:"{opts.oscctrl_addr}"']
            if opts.oscctrl_min != 0:
                params.append(f"min:{opts.oscctrl_min}")
            if opts.oscctrl_max != 1:
                params.append(f"max:{opts.oscctrl_max}")
            if opts.oscctrl_mode:
                params.append(f"mode:{opts.oscctrl_mode}")
            
            return f"oscCtrl({', '.join(params)})"
        
        return ""

    def build_interaction_cue(self):
        """Build interaction cue strings."""
        opts = self.options
        
        if opts.int_type == "button":
            params = [f"trigger:{opts.btn_trigger}"]
            
            # Build style if any style params set
            style_parts = []
            if opts.btn_size:
                style_parts.append(f'size:"{opts.btn_size}"')
            if opts.btn_label:
                style_parts.append(f'label:"{opts.btn_label}"')
            if opts.btn_font:
                style_parts.append(f'font:"{opts.btn_font}"')
            if opts.btn_fontsize != 16:
                style_parts.append(f"fontsize:{opts.btn_fontsize}")
            
            if opts.btn_target:
                params.append(f"target:{opts.btn_target}")
            if style_parts:
                params.append(f"style({', '.join(style_parts)})")
            
            return f"button({', '.join(params)})"
        
        elif opts.int_type == "reuse":
            return f"reuse({opts.reuse_name})"
        
        elif opts.int_type == "use":
            return f"use({opts.reuse_name})"
        
        return ""

    def build_propagate_cue(self):
        """Build propagate cue strings."""
        opts = self.options
        cue_type = opts.prop_cue_type
        
        if cue_type == "osc":
            inner_params = [f"addr:{opts.prop_osc_addr}"]
            
            if opts.prop_osc_pitch == "deg":
                inner_params.append("pitch:deg(${1}, 3)")
            else:
                inner_params.append(f"pitch:{opts.prop_osc_pitch}")
            
            if opts.prop_osc_env:
                inner_params.append(f"env:{opts.prop_osc_env}")
            if opts.prop_osc_trig:
                inner_params.append(f"trig:{opts.prop_osc_trig}")
            
            inner_params.append("uid:rnd123")
            inner_cue = f"osc({', '.join(inner_params)})"
            
            if opts.prop_osc_pitch == "deg":
                return f"propagate({inner_cue}, rnd([0,2,4,5,7,9,11]))"
            return f"propagate({inner_cue})"
        
        elif cue_type == "scale":
            if opts.prop_scale_randomize:
                return f"propagate(scale(values:[${{1}},${{2}}], dur:${{3}}), rnd({opts.prop_scale_min},{opts.prop_scale_max}), rnd({opts.prop_scale_min},{opts.prop_scale_max}), rnd({opts.prop_dur_min},{opts.prop_dur_max}))"
            return f"propagate(scale(values:[1,1.5,1], dur:2))"
        
        elif cue_type == "rotate":
            if opts.prop_scale_randomize:
                return f"propagate(rotate(values:[${{1}},${{2}}], dur:${{3}}), rnd(0,360), rnd(0,360), rnd({opts.prop_dur_min},{opts.prop_dur_max}))"
            return f"propagate(rotate(values:[0,180], dur:1))"
        
        elif cue_type == "color":
            return f"propagate(color(vals:[#f00,#0f0], dur:2))"
        
        elif cue_type == "fade":
            return f"propagate(fade(mode:pulse, dur:2, from:0.2, to:1))"
        
        return ""

    def effect(self):
        """Main effect method - applies cue to selected elements."""
        opts = self.options
        tab = opts.tab
        
        # Get selected elements
        if not self.svg.selection:
            inkex.errormsg("Please select at least one element.")
            return
        
        # Handle utility actions
        if tab == "utility":
            for elem in self.svg.selection.values():
                current_id = elem.get("id", "")
                
                if opts.util_action == "view":
                    inkex.errormsg(f"Current ID: {current_id}")
                    return
                
                elif opts.util_action == "clear":
                    # Generate a simple ID
                    new_id = f"element_{id(elem)}"[-8:]
                    elem.set("id", new_id)
                    continue
                
                elif opts.util_action == "custom":
                    if opts.custom_cue:
                        cue = opts.custom_cue
                    else:
                        inkex.errormsg("Please enter a custom cue string.")
                        return
                
                elif opts.util_action == "append":
                    # Will append the generated cue below
                    pass
            
            if opts.util_action in ["view", "clear"]:
                return
        
        # Build cue based on active tab
        cue = ""
        
        if tab == "timing":
            cue = self.build_timing_cue()
        elif tab == "animation":
            cue = self.build_animation_cue()
        elif tab == "color":
            cue = self.build_color_cue()
        elif tab == "text":
            cue = self.build_text_cue()
        elif tab == "audio":
            cue = self.build_audio_cue()
        elif tab == "video":
            cue = self.build_video_cue()
        elif tab == "synth":
            cue = self.build_synth_cue()
        elif tab == "osc":
            cue = self.build_osc_cue()
        elif tab == "interaction":
            cue = self.build_interaction_cue()
        elif tab == "propagate":
            cue = self.build_propagate_cue()
        elif tab == "utility" and opts.util_action == "custom":
            cue = opts.custom_cue
        
        if not cue:
            inkex.errormsg("No cue generated. Please check your settings.")
            return
        
        # Apply cue to selected elements
        for elem in self.svg.selection.values():
            current_id = elem.get("id", "")
            
            if tab == "utility" and opts.util_action == "append":
                # Append to existing ID
                if current_id:
                    new_id = f"{current_id} {cue}"
                else:
                    new_id = cue
            else:
                # Replace ID with cue
                new_id = cue
            
            elem.set("id", new_id)


if __name__ == "__main__":
    OscillaCueEditor().run()
