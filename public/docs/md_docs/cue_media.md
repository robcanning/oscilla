# `cueMedia(...)` — Media Overlay Cue

The `cueMedia(...)` cue allows you to display a timed fullscreen media overlay (SVG, image, or video)
during score playback. The cue pauses the score, shows the media files in sequence, and resumes playback after a given duration or manual dismissal.

---

## 🧩 Syntax

```
cueMedia(file1,file2,...)_dur(seconds)_interval(seconds)_shuffle(1)_random(1)_loop(1)
```

| Parameter     | Description                                                             |
|---------------|-------------------------------------------------------------------------|
| `file1,...`   | Comma-separated list of media filenames (relative to `media/` folder)   |
| `_dur(N)`     | Total cue duration in seconds                                           |
| `_interval(N)`| Duration for each item (optional; default = dur / number of files)      |
| `_shuffle(1)` | Shuffle list once, then show each item once                             |
| `_random(1)`  | Randomly choose and show files repeatedly until time runs out           |
| `_loop(1)`    | Loop through list repeatedly until duration is complete                 |

---

## ✅ Examples

```xml
cueMedia(logo.svg,alert.jpg)_dur(10)_shuffle(1)
cueMedia(video.mp4)_dur(12)
cueMedia(image1.jpg,image2.jpg,image3.jpg)_dur(15)_random(1)_interval(4)
```

---

## 🛠 Behavior

- Supports `.svg`, `.jpg`, `.png`, `.gif`, `.webp`, `.mp4`, `.webm`, `.ogg`
- Auto-dismisses popup on timeout or video end
- User can dismiss with click or Escape key
- Media list is processed based on mode: `shuffle`, `random`, or `loop`
