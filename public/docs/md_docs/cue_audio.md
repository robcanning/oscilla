# Audio Cues --- `audio`, `audioPool`, `audioImpulse`

This document describes the **current behaviour implemented in code**,
without legacy underscore syntax.

Oscilla's audio system provides three related cue types:

-   **audio(...)** --- play a specific file
-   **audioPool(...)** --- select one file from a discovered folder
-   **audioImpulse(...)** --- stochastic repeated triggering from a pool

All cues use generic key:value parameter syntax.

------------------------------------------------------------------------

## 1. `audio(...)` --- Play a Single File

Lowest‑level audio playback building block.

### Example

    audio(src:kick, amp:0.9, loop:1, fade:0.3)

### Parameters

  key                meaning
  ------------------ --------------------------------------------
  `src` (required)   filename/stem, `.wav` auto‑added
  `amp`              gain 0--1 (default 1)
  `loop`             1=once, N\>1 repeats, 0=infinite
  `fade`             applies to both fadeIn/fadeOut
  `fadeIn`           fade‑in seconds
  `fadeOut`          fade‑out seconds
  `toggle`           second trigger stops instead of restarting
  `uid`              playback identity (default = src)

Files load from the project `/audio` folder, falling back to shared
`/audio`.

Playback state is tracked so UI and buttons can reflect on/off.

------------------------------------------------------------------------

## 2. `audioPool(...)` --- One‑Shot Selection From a Folder

A pool is built dynamically by scanning a folder --- you never list
filenames manually.

    audioPool(
      path:sfx/birds,
      format:wav,
      mode:shuffle,
      amp:rand(0.2,0.8),
      fadein:0.05,
      fadeout:0.2,
      poly:4,
      uid:birdsA
    )

### Behaviour

-   server enumerates files in `path:`
-   every trigger selects **one** file
-   optional randomisation per trigger
-   overlays show which file played
-   optional OSC mirror

### Parameters

  key                   meaning
  --------------------- ----------------------------------
  `path` (required)     folder inside project audio
  `glob`                optional filter hint
  `format`              extension (default wav)
  `mode`                `shuffle` or `rand`
  `amp`                 number or `rand(a,b)`
  `fadein`, `fadeout`   per‑hit fades
  `loop`                loop the selected file
  `poly`                overlapping voices (0=unlimited)
  `uid`                 identity of this pool
  `osc`, `oscaddr`      optional OSC mirroring

Polyphony applies **per pool**.

------------------------------------------------------------------------

## 3. `audioImpulse(...)` --- Stochastic Repeating Process

Uses the same pool logic, but runs autonomously and keeps firing hits.

    audioImpulse(
      path:sfx/rain,
      rate:40,
      jitter:0.4,
      amp:rand(0.1,0.5),
      fadeout:0.25,
      poly:6,
      lifetime:process
    )

### Timing

  key        meaning
  ---------- ---------------------------------------------
  `rate`     events per minute
  `jitter`   randomisation 0--1
  `poly`     overlapping voices (default 6, 0=unlimited)

### Lifetime Modes

  value       behaviour
  ----------- ----------------------------------------------------
  `process`   runs until stopped
  `region`    runs only while playhead is inside the cue element

In region mode overlays update live and disappear when leaving the
region.

OSC mirrors each hit if enabled.

------------------------------------------------------------------------

## Random Expressions

Where supported:

    amp:rand(0.2,0.9)
    fadeout:rand(0.05,0.3)

Evaluated **per hit**.

------------------------------------------------------------------------

## Stopping

-   internal stop on fade/toggle
-   region exit cleans the process
-   global helpers (where implemented):
    -   stopAudioImpulse(uid)
    -   stopAllAudio()

------------------------------------------------------------------------

## Quick Examples

    // drone
    audio(src:drone, loop:0, fade:2)

    // percussive palette
    audioPool(path:sfx/wood, mode:shuffle, poly:5)

    // rainfall texture inside a passage
    audioImpulse(path:sfx/rain, rate:30, jitter:0.5, lifetime:region)
