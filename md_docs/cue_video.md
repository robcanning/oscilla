## cue:video(...) — play and control video overlays in the score

Displays and controls a video element inside the OscillaScore environment.  
The video can be positioned relative to cue elements or target objects,  
either pinned to the viewport (fixed) or following the scroll position of the score.

This cue is used for embedding time-based visual media — for instance,  
projected video, reference material for performers, or synchronized visual cues.

### Syntax
cue:video(file:<filename>[.mp4|.webm], size:<pixels|WxH|fs>,
in:<seconds>, out:<seconds>, fadeIn:<seconds>, fadeOut:<seconds>,
opacity:<0–1>, speed:<rate>, audio:<0|1>,
loop:<count|0=infinite>, hold:<seconds>,
target:<uid>, location:<fixed|scroll>,
offsetX:<px>, offsetY:<px>)


### Arguments
| Argument | Description |
|-----------|-------------|
| **file** | Video file name (relative to the project’s `/videos/` directory). Extension optional (`.mp4` by default). |
| **size** | Display size: a single pixel width (e.g. `360`), a WxH string (e.g. `640x480`), or fullscreen via `fs` / `fullscreen`. |
| **in** | Start time in seconds within the source file. |
| **out** | End time in seconds within the source file. |
| **fadeIn** | Duration of fade-in (seconds). Applied from cue start. |
| **fadeOut** | Duration of fade-out (seconds). Applied before end or out time. |
| **opacity** | Base opacity (0–1). Default = 1. |
| **speed** | Playback speed multiplier. Default = 1.0. |
| **audio** | `0` or `false` mutes playback; `1` or `true` enables sound. |
| **loop** | Number of loops to perform. `0` = infinite loop. |
| **hold** | Time in seconds before video auto-removes, overriding loop/end if shorter. |
| **target** | SVG element ID or UID to anchor the video to. The video centers on this element’s bounding box. |
| **location** | `scroll` = follow score scrolling; `fixed` = pin to viewport. |
| **offsetX / offsetY** | Optional pixel offsets relative to target or cue element. |
| **click-to-close** | Clicking the video closes it immediately. (Always enabled by default.) |

### Behavior
- The video automatically appears when the cue triggers, then removes itself when finished, held duration expires, or user clicks it.  
- If triggered again with the same `file` and `target`, the existing instance resets (reuses instead of duplicating).  
- When `location:scroll`, the video moves with the target as the score scrolls.  
- When `location:fixed`, it stays pinned to the same viewport coordinates.  
- `in:` and `out:` trim the playback range in seconds within the media file.  
- `fadeIn:` and `fadeOut:` smoothly interpolate the element’s opacity over time.  
- `opacity:` defines maximum visible opacity after fade-in.  
- `loop:` repeats playback; `loop:0` means infinite looping.  
- `hold:` removes the video after a given time regardless of playback duration.  
- `audio:0` disables sound, ideal for silent or overlay cues.  
- `target:` positions the video at the visual center of the specified SVG element.  
- If the target cannot be found, it falls back to the cue element, then to a default (100,100) position.

### Examples
cue:video(file:lum.webm, size:360, in:4, out:12, fadeIn:2, fadeOut:2, opacity:0.6,
loop:0, speed:1.5, audio:0, location:scroll, target:circle3)

cue:video(file:clip.mp4, size:fs, fadeIn:1, fadeOut:1, loop:3, audio:1, location:fixed)

cue:video(file:demo, size:640x360, speed:0.8, opacity:0.8, hold:15, target:cueMarker5)

cue:video(file:projection, size:480, fadeIn:0.5, fadeOut:0.5, audio:false, location:scroll)


### Notes
- Multiple videos can play simultaneously at different positions.  
- Re-triggering the same file and target reuses the existing instance instead of spawning a duplicate.  
- Fullscreen videos (`size:fs`) are automatically fixed to the viewport.  
- If `hold:` is longer than total playback duration, fade-out still occurs before removal.  
- Works seamlessly with network sync — clients triggering the same cue will play in sync.  
- When `audio:0`, the video is muted but still plays visually.  
- Future versions will support `blend:` modes and OSC video control hooks.
