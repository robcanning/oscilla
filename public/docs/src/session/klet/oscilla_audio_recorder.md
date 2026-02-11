---
title: audio_recorder
layout: docs_layout.njk
---

# Audio Recorder

The **Oscilla Audio Recorder** allows performers to record short audio contributions directly inside the score, as part of the Contribution Surface. Recording is a *score‑native* action: audio is authored, contextualised, and stored within the same environment used for notation, navigation, and interaction.

Unlike a standalone recorder, the Audio Recorder is designed for *leaving material inside the score* — contributions become part of the score’s structure and can be activated using existing audio triggers.

---

## Overview

The Audio Recorder:

- operates entirely inside Oscilla (no external app or booth)
- is only available in **pen mode** (annotation authoring)
- records short, bounded audio snippets
- stores audio in **annotation‑scoped directories**
- integrates with existing audio cues (audio, pool, impulse)
- requires explicit **consent** before recording
- supports optional contributor metadata
- works on desktop and mobile browsers

This design supports **selective agency**: performers may choose when to enter the sound world, leave material, and withdraw without maintaining continuous control.

---

## Entering the Audio Recorder

### 1. Enable Pen Mode

Recording is only available while **pen mode** is active. Pen mode indicates that the user is authoring or modifying the score rather than performing playback.

### 2. Select or Create an Annotation

- Click an **existing annotation** to add audio to it, or
- Click **empty score space** to create a new annotation

The annotation context determines where the recording will be stored.

### 3. Open the Recorder

In the annotation editor’s trigger configuration section:

```
[ Upload Audio ]   [ Record ]
```

Click **Record** to open the recording dialog.

---

## Recording Dialog

The recording dialog is intentionally minimal but fully featured for safe, short‑form recording.

### Recording Controls

- Single **Record / Stop** toggle button
- Large visual timer
- Maximum duration indicator (default: 20 seconds)
- Keyboard support (Esc to cancel)

### Input Monitoring

- Live **VU meter** showing input level
- Peak dB readout
- Visual warning when input is too hot

The VU meter is for orientation only and does not affect the recording.

---

## Recording Workflow

### Start Recording

- Recording is disabled until consent is given
- On start, microphone permission is requested if needed
- Input monitoring and timer begin immediately

Recording automatically stops when the maximum duration is reached.

### Stop Recording

- Recording may be stopped manually or automatically
- The microphone stream is closed immediately
- Input monitoring stops

---

## Preview and Re‑Record

After recording completes:

- A **preview section** becomes available
- You may:
  - Play / stop the recording
  - Discard it and **record again**

Only one recording is kept at a time; re‑recording replaces the previous take.

---

## Metadata (Optional)

Before saving, contributors may optionally provide metadata:

- **Anonymous** toggle
- **Name** (hidden if anonymous)
- **Website / social link** (hidden if anonymous)

Metadata is stored alongside the contribution and may be used for attribution in documentation or performances, but is not required.

---

## Directory Selection

Each recording is saved into a directory that represents a *contribution context*.

### Default Behaviour

- When editing an existing annotation, the recorder defaults to that annotation’s directory
- When creating a new annotation, a new directory is suggested automatically

### Choosing a Directory

The dialog allows you to:

- Use the default annotation directory
- Select an **existing contribution directory**
- Create a **new custom directory**

Custom directory names are restricted to letters, numbers, and hyphens.

### Examples

```
audio/
  contributions/
    ann_4F2QK/
      voice_01.wav
    ann_9M8L2/
      anon_1712345678.webm
```

Directories represent *places in the score where material accumulates*.

---

## Consent and Licensing

### Required Consent

Before recording or uploading audio, contributors must explicitly confirm:

> **I consent to my contribution being used by the artist in performances, installations, documentation, and future works related to this project.**

- Consent is mandatory
- Recording controls remain disabled until consent is given
- Consent state is stored with the contribution

### Licensing Model

- Contributions are **not automatically public**
- No Creative Commons licence is applied by default
- This conservative model allows artist use while protecting contributors from unintended reuse

Optional Creative Commons licensing may be offered in future versions as an opt‑in choice.

---

## Saving and Uploading

When **Use Recording** is selected:

1. The recorded audio is packaged as a file
2. It is uploaded using Oscilla’s existing audio upload endpoint
3. The destination directory is created if necessary
4. The annotation’s audio source field is updated automatically

Once saved, recorded audio behaves exactly like uploaded audio files.

---

## Integration with Audio Cues

Recorded audio can be used with all existing audio mechanisms:

- playhead‑triggered audio
- audio pools and stochastic fields
- impulse and transient cues
- OSC‑controlled playback

No special trigger types are introduced for recorded audio.

---

## Mobile Support

The Audio Recorder is designed for phones and tablets:

- Large touch targets
- No file pickers required for recording
- Familiar microphone permission flow
- Short, bounded recordings

This makes it suitable for workshops, installations, and ad‑hoc participation.

---

## What the Audio Recorder Is Not

The Audio Recorder is **not**:

- a DAW or audio editor
- a multitrack recorder
- a background capture system
- a publishing or sample‑sharing platform
- a separate application

It exists solely to support *leaving sonic material inside the score*.

---

## Related Code

- `oscillaAudioRecorder.js` — recording UI, VU meter, metadata, upload
- Contribution Surface — annotation authoring and triggers
- Audio Upload API — shared audio storage pipeline

---

## Summary

The Oscilla Audio Recorder extends the Contribution Surface with a safe, minimal, score‑native way to record and leave sound. By combining explicit consent, annotation‑scoped storage, live input feedback, and optional metadata, it supports collective music‑making practices grounded in care, agency, and shared musical space.

