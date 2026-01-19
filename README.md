# OscillaScore

**OscillaScore is a browser-based framework for animated, cue-driven graphic scores**, built with SVG, JavaScript, WebSockets, and OSC.

It allows composers and performers to create scores that move, react, synchronize across devices, and optionally control external sound systems — all using open-web tools.

---

## Quick Start

### Recommended: Standalone builds

**Standalone builds available** for Linux, macOS (Intel & Apple Silicon), and Windows.  
No Node.js or npm required — download and run.

Downloads:  
https://github.com/robcanning/oscilla/releases

Download OscillaScore for your platform and launch the application.

---

### Alternative: Run from source (developer workflow)

If you prefer to run OscillaScore from source or contribute to development:

```bash
git clone https://github.com/robcanning/oscilla
cd oscilla
npm install
npm start
```

Then open:

```
http://localhost:8001
```

You can load a demo score from the splash screen and start exploring.

---

## Inkscape Extension

OscillaScore includes an **optional Inkscape extension** for authoring graphic scores and applying Oscilla namespaces directly within Inkscape.

More information about installing and using the Inkscape extension is available in the documentation:

https://robcanning.github.io/oscilla/docs/

---

## Documentation

https://robcanning.github.io/oscilla/docs/

---

## What OscillaScore is for

- Animated and spatial graphic notation
- Networked performances
- Hybrid fixed-form and open-form works
- Cue-driven timing, navigation, and media
- Optional OSC integration

---

## What OscillaScore is NOT

- a DAW
- a notation engraver (Sibelius / MuseScore)
- a collaborative score editor

---

## Requirements

- **Standalone builds:** none beyond a modern operating system
- **From source:** Node.js (LTS recommended) and a modern browser
- **Score authoring:** Inkscape (recommended)

Optional: OSC-capable audio or media environment.

---

## Project Status

OscillaScore is under active development.

Issues and feature requests:  
https://github.com/robcanning/oscilla/issues

---

## License

See `LICENSE`.
