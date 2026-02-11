# Oscilla Contribution Recorder
**Complete Feature Specification (Client, Server, Licensing)**

---

## 1. Purpose

The Contribution Recorder enables performers to **record short audio contributions directly within Oscilla**, as part of the existing Contribution Surface. Recording is treated as a method of *material acquisition* that occurs entirely within the score environment.

There is no separate recording application, booth, or mode. The score itself is the site of listening, contribution, recording, and activation.

---

## 2. Design Principles

- **Score-native**  
  All contribution actions occur inside Oscilla and are spatially anchored to the score.

- **Pen-mode bound**  
  Recording is only available when pen mode (annotation authoring) is active.

- **Ephemeral action**  
  Recording is a momentary act, not a persistent state or mode.

- **Minimal UI**  
  No waveform editing, trimming, or multitrack features.

- **Directory-scoped ownership**  
  Audio contributions belong to annotation-defined directories.

- **Conservative consent model**  
  Contributions are licensed explicitly for artist use by default.

- **Phone-first**  
  Interaction must work cleanly on mobile browsers.

---

## 3. Scope

### In scope
- Recording audio via browser microphone
- Uploading recorded audio to the project
- Attaching recordings to annotations
- Directory-based organisation of contributions
- Optional sharing of contributions via existing trigger logic
- Explicit consent collection

### Out of scope
- Audio editing or post-processing
- Continuous or background recording
- Separate “recording mode”
- Server-side audio streaming
- Automatic public licensing
- User accounts or attribution enforcement

---

## 4. Interaction Context & Directory Semantics

### Core rule

> **The destination directory for a recording is determined by the annotation context at the moment of recording.**

---

### 4.1 Case A — Recording inside an existing annotation

**User action**
- Clicks an existing annotation in pen mode
- Opens annotation editor
- Clicks **Record**

**Behaviour**
- Recording is stored in the annotation’s existing audio directory
- No new directory is created

**Example**
```
audio/
  ann_4F2QK/
    impulse.wav
    voice_01.wav
```

**Meaning**
- Performer is adding material to an existing contribution node

---

### 4.2 Case B — Recording outside any existing annotation

**User action**
- Clicks empty score space in pen mode
- New annotation is created
- Clicks **Record**

**Behaviour**
- Client generates a new annotation ID
- Server creates a new directory lazily on upload
- Recording is stored inside that directory

**Example**
```
audio/
  ann_9M8L2/
    recording_01.wav
```

**Meaning**
- Performer is leaving a new contribution

---

### 4.3 Case C — Recording into an explicitly chosen directory (optional)

**User action**
- Creates a new annotation
- Selects an existing contribution directory
- Clicks **Record**

**Behaviour**
- Recording is stored in the chosen directory
- No new directory is created

**Meaning**
- Performer is joining a shared sonic space

(This case is optional for initial implementation.)

---

## 5. Client-Side Behaviour

### 5.1 Entry Conditions
- Pen mode is active
- Annotation editor is open (existing or new)

---

### 5.2 UI Placement

Within the annotation editor’s trigger configuration:

```
[ ⬆ Upload Audio ]   [ ⏺ Record ]
```

No new tabs or configuration panels are introduced.

---

### 5.3 Recording Modal

Clicking **Record** opens a minimal modal dialog.

**Modal contents**
- Title: *Record audio*
- Single primary control:
  - ⏺ Record → ⏹ Stop
- Visual timer with max duration
- Optional playback preview
- Actions:
  - **Use recording**
  - Cancel

---

### 5.4 Recording Constraints
- Maximum duration: configurable (default 10–20 seconds)
- One recording per invocation
- Microphone permission requested on first use only
- Cancelled recordings are discarded

---

### 5.5 Save Behaviour

On **Use recording**:
1. Audio Blob is produced via `MediaRecorder`
2. Blob is uploaded to the server using the existing upload endpoint
3. Target directory is provided explicitly by the client
4. Server returns a relative file path
5. Annotation editor updates its source field with that path

From this point on, recorded audio is indistinguishable from uploaded audio.

---

## 6. Server-Side Behaviour

### 6.1 Core principle

> **The server treats recorded audio as standard audio uploads.**

The server does not:
- infer annotation context
- distinguish recording vs upload
- manage UI state

---

### 6.2 Upload Endpoint

Existing endpoint is reused:

```
POST /api/upload-audio/:project?subdir=<relative_dir>
```

No new endpoints are introduced.

---

### 6.3 File Acceptance

The server must accept:
- standard audio extensions (`.wav`, `.ogg`, `.mp3`, etc.)
- common MediaRecorder MIME types (`audio/webm`, `audio/ogg`, `audio/wav`)

Validation should allow MIME **or** extension.

---

### 6.4 Directory Creation

- Directories are created lazily on successful upload
- Only paths under:
  ```
  public/scores/<project>/audio/
  ```
  are permitted
- Path traversal and absolute paths are rejected

---

### 6.5 Filename Handling

- Filenames should be collision-safe and opaque
- Server-side override is permitted and recommended:
  ```
  ann_<id>_<timestamp>.wav
  ```

---

### 6.6 Network Behaviour

- Annotation metadata is synchronised as usual
- Audio files are not streamed or replicated
- All clients must have access to the project directory

---

## 7. Licensing & Consent

### 7.1 Core licensing principle

> **Contributions are licensed explicitly for artist use by default.**  
> They are not automatically made public or open for derivative works.

---

### 7.2 Mandatory Consent (Required)

Before recording or uploading audio, the user must check:

> ☐ I consent to my contribution being used by the artist in performances, installations, documentation, and future works related to this project.

- This checkbox is mandatory
- Recording/upload is disabled until consent is given
- Consent state is stored with the annotation metadata

---

### 7.3 Optional Openness (Future Extension)

Optionally, contributors may choose to apply a Creative Commons licence.

This is **opt-in**, never default.

Example options:
- Artist use only (default)
- CC BY-SA 4.0
- CC BY 4.0

Licence choice, if any, is stored with the annotation.

---

### 7.4 Rationale

- Avoids accidental public licensing
- Supports conservative, trust-based participation
- Aligns with *What You Leave* as an act of offering, not publishing
- Allows future openness without forcing it

---

## 8. Conceptual Framing

The Contribution Recorder is described as:

> A score-native mechanism for leaving sonic material within the score, rather than a recording or performance tool.

Recording is framed as **leaving a trace**, not producing a finished work.

---

## 9. Selective Agency

- Pen mode = entering agency
- Recording = leaving material
- Exiting pen mode = withdrawing agency

Contributions persist without requiring continued control, supporting negotiated, collective authorship.

---

## 10. Explicit Non-Goals

The following must not be added as part of this feature:

- Global record buttons
- Always-on microphone access
- Audio editing or waveform tools
- Separate recording modes
- User identity enforcement
- Automatic public sharing

---

## 11. One-Sentence Summary

> The Oscilla Contribution Recorder allows performers to record and leave audio material directly within the score environment, storing contributions in annotation-scoped directories under explicit consent, without introducing new server endpoints or recording-specific infrastructure.

