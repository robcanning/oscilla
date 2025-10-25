# oscillaScore

*A score authoring and networked performance environment using SVG, WebSockets, and OSC.*

oscillaScore is a flexible, browser-based environment for creating and performing time-based and media-enhanced scores. Whether working with traditional notation, improvisation frameworks, or audiovisual compositions, users can coordinate performances across multiple devices in real time using SVG, WebSockets, and OSC (Open Sound Control).

## Table of Contents

* [Conceptual Overview](#conceptual-overview)
* [Use Cases](#use-cases)
* [Project Structure](#project-structure)
* [User Requirements](#user-requirements)
* [Developer Dependencies](#developer-dependencies)
* [Installing & Running the Server](#installing--running-the-server)
* [Workflow Overview](#workflow-overview)
* [Cue Targeting & Advanced Triggering](#cue-targeting--advanced-triggering)
* [Cue System Overview](#cue-system-overview)
* [Animation Syntax (Mini Notation)](#animation-syntax-mini-notation)
* [OSC & WebSocket Integration](#osc--websocket-integration)
* [Score Management: Rehearsal Marks & Score Annotations](#score-management-rehearsal-marks--score-annotations)
* [Playback Interface](#playback-interface)
* [Extensibility](#extensibility)
* [Background & Previous Research](#background--previous-research)
* [Status & Development](#status--development)
* [Compatibility & Tools](#compatibility--tools)

## What Kind of Software Is oscillaScore?

oscillaScore is best described as a hybrid system that sits between score playback engine, cue-based media framework, and distributed performance interface.

It is:

* A **cue-driven score playback and control system** for structured, time-based, and media-integrated works.
* A **networked playback environment** supporting multi-client synchronization via WebSockets and OSC.
* A **performance framework** for distributed setups, allowing composers and performers to coordinate audio, animation, and media in real time.
* A **score authoring platform** supporting compact mini-syntax for animation, transformation, and timing control using SVG ID conventions.

It is **not**:

* A real-time collaborative score editor.
* A DAW or audio sequencing environment.
* A full-featured notation program like MuseScore or Sibelius.

oscillaScore is designed to support composers and performers working with contemporary forms of notation, multimedia integration, and distributed coordination.

## Conceptual Overview

oscillaScore supports both **fixed-form** and **open-form** works, and can be used in isolation as a powerful environment for structuring electronic music compositions. It accommodates a range of artistic practices including:

* Animated graphic or symbolic scores.
* Distributed improvisation and comporovisation.
* Time-based cue sequences and gesture triggers.
* Media scores involving video, audio, or text prompts.
* Live networked performances and collaborative rehearsals.

It builds on the lineage of drawing-based music systems like Xenakis’s UPIC, reimagining the **score as a spatial interface** for sonic control. With support for animation and OSC, oscillaScore acts as both a form of **notation** and a **performable instrument**, allowing users to control sound through movement, timing, and visual gesture.

It operates under two main paradigms:

* A **scrolling score model**, suited for linear, horizontally-unfolding timelines.
* A **page-based or hypertextual model**, allowing spatial, nonlinear, or interactive structures.

These paradigms can **coexist within a single score**, enabling hybrid forms that mix continuous motion with branching or triggerable segments.

oscillaScore tightly integrates notation, performer cues, media triggers, and animation into a unified timing and control system. This allows complex audiovisual structures to be executed with precise coordination — ensuring seamless transitions between written material, live gestures, and multimedia elements.

Composers and performers can author complex transformations, animations, and media events using a concise SVG ID-based syntax paired with a powerful cue system.

## Use Cases

oscillaScore supports a wide range of use cases, including:

* **Solo electronic music composition**: Compose and structure media-rich or animated works within a single local environment.
* **Rehearsal and performance for ensembles**: Share synchronized, cue-driven scores with multiple musicians in real time.
* **Telematic and distributed improvisation**: Use cues and visual animations to coordinate remote performers across networks.
* **Interactive installations**: Embed visual or spatial scores in gallery contexts with OSC-driven sound interaction.
* **Mixed-media or hypermedia works**: Integrate text, video, sound, and interactivity in dynamic score designs.

---

## Project Structure

Here is an overview of the typical oscillaScore project directory:

```text
oscillaScore/
├── README.md             # Project overview and usage instructions
├── server.js              # WebSocket + OSC server backend
├── /public/               # Static frontend served to clients
│   ├── index.html         # Main launch point with playback UI
│   ├── js/                # Client-side JavaScript (e.g. app.js, anime.js, path-utils.js)
│   ├── css/               # Interface styles (e.g. desktop/mobile)
│   ├── scores/            # User-uploaded or demo SVG scores
│   ├── templates/         # Optional starter SVG score templates
│   └── docs/              # Internal documentation and usage guides
├── /config/               # Server configuration and PM2 scripts
└── /scripts/              # Deployment and utility scripts

```

This structure supports live editing, versioning of scores, and server-side deployment.

---

## User Requirements

To run oscillaScore locally and support multi-client synchronization, you will need:

* **Node.js** and **npm** — for installing and running the server
* **git** (or download a ZIP of the repository if you prefer not to use git)
* (Optional) **PM2** — for managing server processes in production

If you don't use `git`, you can download the repository as a ZIP from GitHub or GitLab, extract it, then run the setup commands from the extracted folder.

### Network Requirements

For authoring and single-client use, simply open `http://localhost:8001` on the same machine running the server.

For multi-performer setups, all clients and the host machine must be on the **same local network** (LAN) to enable real-time synchronization. A reliable setup is to connect all devices to a dedicated Wi-Fi router, with the server hosted on a laptop connected to that network.

To point client devices to the score interface, use the local IP address of the server machine (e.g., `http://192.168.0.42:8001`). You can find your local IP in your system's network settings.

Setting a **static IP address** for the server is highly recommended to ensure consistent access across sessions.

See `docs/multi-client-setup.html` for more detailed instructions on LAN setup and IP configuration.

---

## Installing & Running the Server

```bash
git clone https://github.com/YOURNAME/oscillaScore.git
cd oscillaScore
npm install
node server.js  # Starts WebSocket + OSC server
```

Then open `index.html` in your browser or navigate to the default local server address:

```
http://localhost:8001
```

The system listens for incoming OSC messages, SVG uploads, and client sync events.

---

## Workflow Overview

1. **Start with a template** by pressing  "s"  to open the score/template loader interface and download an example. Then edit it in Inkscape or another vector graphics editor using horizontal or page-based SVG layouts. The default starting point is the horizontally scrolling template. To enter a page-based paradigm, initiate a collision with a page-based cue such as `cue_anime`, `cue_choice`, or `cue_video` and continue score logic from there. It is recommended to keep the original Inkscape file as your master version, and use **Save a Copy** to create a **Plain SVG** version for use in the score player. This avoids compatibility issues related to Inkscape-specific metadata.
2. **Tag elements** using `id` attributes with cue or animation syntax. In Inkscape, select an object and press **Ctrl+Shift+X** to open the XML Editor and assign or edit its `id`.
3. **Upload your SVG** through the interface or place it in the `/scores/` folder. Press \`\` to open the score/template loader interface, which allows you to browse and select from available files.
4. **Perform the score** using time-based scroll, page navigation, or cue-triggered logic.

---

## Cue Targeting & Advanced Triggering

In some cases, such as with `cue_traverse`, you may want to trigger the animation of a secondary object when a separate, primary cue element reaches the playhead. In these cases, the primary visual object uses a standard `id`, while the functional cue name is placed in a `data-id` attribute. This structure supports **triggerable mode** via `_t(1)`, where the animation remains dormant until activated by the playhead reaching the associated cue.

---

## Cue System Overview

Cue handlers are triggered by specially named IDs embedded in the SVG. Supported types include:

* `cuePause(duration)` – pauses playback. If the duration is > 3 seconds, a visual countdown appears.
* `cueStop()` – stops playback entirely.
* `cueRepeat(s: startId, e: endId, x: repeatCount, r: resumeId)` – repeat a region for a set number of times.
* `cueTraverse(o: objectId, p: pointList)` – moves an object between defined points.
* `cueAudio(file: 'filename.wav', loop: 2, amp: 1.0)` – plays an audio sample.
* `cueVideo(file: 'clip.mp4')` – video playback trigger.
* `cueAnimation(choice: 'overlay', dur: 10)` / `cueAnimejs(choice: 'svg-file', dur: 5)` – trigger fullscreen or inline animations.
* `cueChoice(choice: 'A', dur: 8)` – user-triggered choice with optional duration.
* `cueP5(sketch: 'name')` – load an interactive P5.js sketch.
* `cueOscTrigger(value)` – sends an OSC message with a numeric trigger.
* `cueOscValue(value)` – sends a scalar OSC value.
* `cueOscSet(param, value)` – sends a key-value OSC pair.
* `cueOscRandom(min, max)` – sends a random value in a range.
* `cueOscPulse(rate, duration)` – sends repeated OSC pulses.
* `cueOscBurst(count, interval)` – sends a burst of OSC messages.

All cue types use camelCase formatting: `cueType(...)`.

Use short form `cuePause(6)` for anonymous parameters (`choice`), or `cuePause(duration: 6)` for named parameters.

### 📌 Dynamic Cue Assignment with `assignCues(...)`
You can programmatically generate cue IDs for multiple objects in a group using:
```xml
<g id="assignCues(cueOscTrigger(rnd[1,9]))">
```
This creates a randomized cue ID (e.g. `cueOscTrigger(5)`) for each child inside the group. Supported value generators include `rnd[min,max]` and `ypos[min,max]` (based on vertical position). See `assignCues()` in `app.js` for implementation details.

See `docs/cue_system.html` and `docs/cue_traverse_documentation.html` for full syntax.

## Animation Syntax (Mini Notation)

SVG elements can be animated using expressive ID-based syntax:

```svg
<g id="r_rpm(5)_deg[0,90,180]_dir(1)_ease(2)" />
<circle id="s[1.0,1.5,1.0]_seqdur(4)_ease(3)" />
```

Supported animations include:

* Rotation: `r_...` or `obj_rotate_*`
* Scale: `s[...]`, `sXY[...]`, `sX[...]`, `sY[...]`
* Path-following: `o2p(...)` or `obj2path-*`

Modifiers include:

* `rpm`, `deg`, `dir`, `ease`
* Sequence durations: `seqdur(...)`
* Triggerable mode: `_t(1)`
* Regenerating random values: `rndNx`, `rnd(...)x`

See `docs/animations.html` for full syntax and examples.

---

## OSC & WebSocket Integration

oscillaScore supports **outbound OSC** for real-time communication with audio engines such as SuperCollider, Pure Data, Max/MSP, and others. OSC messages are emitted automatically based on certain cue events and object animations.

The **incoming and outgoing OSC ports** are shown clearly in the server GUI or printed in the initial console output from `server.js`. These settings can be configured as needed for local or networked setups. with audio engines such as SuperCollider, Pure Data, Max/MSP, and others. OSC messages are emitted automatically based on cue events and object animations.

### 📤 Cue-Triggered OSC

OSC messages are emitted when explicit OSC cue IDs are used in the SVG, such as `cue_osc_trigger_12`, `cue_osc_trigger_start`, etc. These cues send OSC messages like:

```
/cue/trigger <cue_id>
/stopwatch <elapsed_time>
```

These can be mapped in synthesis environments to control playback, effects, or spatial parameters.

### 🌀 Path-Following OSC: `o2p(...)`

Objects with IDs like `o2p(path-42)_osc(1)` emit continuous OSC messages during animation as they move along SVG paths. These act as **real-time OSC data loops** that can control synthesis parameters dynamically.

**Example message:**

```
/obj2path/path-42 0.435 0.001 2.35
```

* **Address:** `/obj2path/<pathId>`
* **Arguments:**

  * `x` (normalized 0–1): horizontal position
  * `y` (normalized 0–1): vertical position
  * `angle` (in degrees): current orientation

This makes `o2p(...)` ideal for:

* Controlling filter frequency (e.g., map `x` to cutoff)
* Panning or spatialization (e.g., use `y` or `angle`)
* Modulating effects like reverb or delay dynamically

**Each path-following object becomes a loopable OSC control source.**

You can run multiple such objects in parallel, each emitting its own OSC stream, with fully customizable path shapes, motion speed, direction, and easing.

> To prevent flooding, only one client emits OSC in multi-user setups. The server assigns a primary OSC sender and suppresses duplicate streams from others. See `docs/osc-o2p.html` for full details.

---

## Score Management: Rehearsal Marks & Score Annotations

oscillaScore includes features that support flexible score navigation and rehearsal workflows:

* **Rehearsal Marks**: Defined using XML IDs such as `rehearsal_A`, `rehearsal_B`, etc., these labeled waypoints allow performers and conductors to quickly jump to specific sections. They can be used interactively during rehearsal or referenced by cue logic such as repeats or da capo.

* **Score Annotations**: SVG elements with XML IDs beginning with `note-` (e.g., `note-intro`, `note-clarinet`) define embedded annotations. These can display programme notes, instructions, or media overlays at specific times or in response to cues.

These features allow composers and performers to structure scores in ways that facilitate rehearsal, collaboration, and interactive performance.

## Playback Interface

The oscillaScore playback interface provides an intuitive and performance-ready control surface with the following features:

* **Traditional media controls**: Play, pause, rewind, and jump to cue.
* **Rehearsal mark navigation**: Quickly jump between `rehearsal_A`, `rehearsal_B`, etc., from a dropdown or shortcut interface.
* **Elapsed time**: View synchronized global time via a shared stopwatch, updated across all connected clients.
* **Client overview**: See a list of connected clients for multi-user coordination.
* **Annotation toggles**: Show or hide score annotations (defined with `note-...` IDs), programme notes, and popup overlays.
* **Score management tools**: Upload new SVG scores or score segments, download existing scores, or access prebuilt templates directly from the interface.

This interface supports both rehearsals and live performance scenarios, enabling structured and spontaneous interaction with the score.

---

## Extensibility

* **Custom cues** can be defined by editing `app.js`.
* **Media triggers** support audio, video, animation, and external tools.
* **SVG templates** included for fast prototyping.
* **Program notes and overlays** available through GUI.

---

## Background & Previous Research

oscillaScore also generalises elements from composition-specific systems developed by the author during doctoral research. These include interactive, networked, and modular approaches to notation and performance, informed by earlier works such as:

* Canning, R. (2014). *Interactive parallax scrolling score interface for composed networked improvisation*. In Proceedings of the International Conference on New Interfaces for Musical Expression (pp. 144–146).
* Canning, R. (2012). *Real-time web technologies in the networked performance environment*. Ann Arbor, MI: Michigan Publishing, University of Michigan Library.
* Canning, R. (2011). *The M2 Compositions: A Technical Overview of a Modular Work Flow Towards the Creation of a Video Score*. In Proceedings of the International Computer Music Conference (ICMC 2011), Huddersfield, UK.

oscillaScore was first used in the creation and performance of the animated graphic score *Six inches to the Mile* by Rob Canning (2025), commissioned by the Arts Council of Ireland / An Chomhairle Ealaíon for the Stuttgart-based new music ensemble **Pony Says**. The piece premiered at the **Music Current Festival** in April 2025.

## Technical Summary

oscillaScore is built on a modular architecture combining real-time browser-based rendering, cue handling, and OSC messaging.

**Core components:**

* **Client frontend:** HTML + SVG + JavaScript (served from `/public/`)
* **Server backend:** Node.js with Express and WebSocket support
* **OSC integration:** Bi-directional OSC messaging using `osc` and `ws` libraries
* **Animation engine:** Powered by `anime.js` for smooth visual transformations
* **Path handling:** Uses `svg-path-commander` to animate and analyze SVG path traversal
* **Trigger system:** Based on ID naming conventions (`cue_*`, `obj_rotate_*`, etc.) parsed at runtime

**Data model:**

* Scores are plain SVG files with embedded ID-based instructions
* Playback and cue logic is synchronized via WebSocket broadcasts
* In multi-client setups, all clients may emit OSC messages to the server, which then filters and forwards only one message back to the destination as needed. The server acts as a gatekeeper to prevent duplication, but depending on the cue type, some filtering may occur client-side or be cue-specific.

This design allows performance-ready coordination of media, animation, and interaction across distributed client devices.

---

## Status & Development

oscillaScore is under active development. Feedback, contributions, and collaboration inquiries are welcome. You can:

* Email questions, bug reports, or feature requests to [**rc@kiben.net**](mailto:rc@kiben.net)
* Submit Git pull requests via the project repository
* Join as a beta tester to help improve cross-device compatibility and cue behavior

### Developer Dependencies

oscillaScore uses the following project libraries and tools:

* **Express** — web framework for serving the frontend
* **ws** — WebSocket server for real-time synchronization
* **osc** — OSC message handling
* **anime.js** — animation engine for SVG transformations
* **svg-path-commander** — used for path manipulation and transformation flattening

### Known Limitation

The system is currently optimized for iPad Pro resolution and layout. If using laptops or desktops, use the browser’s responsive design mode (e.g., in Chrome DevTools) to emulate an iPad Pro screen. Without identical resolutions, clients will be misaligned from the outset. Resolving this display alignment issue is a high priority for the first stable release.

---

---
Cue ID Format:
- Must begin with `cue_` followed by cue type, e.g. `cue_audio`, `cue_pause`, `cue_speed`
- First parameter may be `key(value)` or just `(value)` (interpreted as `choice`)
- Additional parameters must be `key(value)`
- Example: cue_audio(file(moog-bass)_loop(3)_amp(0.8))
- All cue types and expected keys are documented in [cue_handlers.md]
