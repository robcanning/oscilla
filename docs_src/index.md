---
title: OscillaScore
layout: layout.njk
---
<p style="text-align: left;">
  <a href="./assets/oscilla-title-logo.png" target="_blank">
    <img src="./assets/oscilla-title-logo.png" alt="OscillaScore Title" style="width: 100%; height: auto; border-radius: 6px;" />
  </a>
</p>


OscillaScore is an open-source platform for creating and performing time-based, animated notation in the browser. It supports collaborative performance, synthesis control, and visual experimentation using simple SVG and web technologies.

##  What Can OscillaScore Do?

- Synchronize score playback across local devices or remote performers
- Trigger audio, events, or OSC messages via cues
- Combine open-form and fixed-form structures for hybrid performance formats
- Animate shapes, symbols, and cues using custom SVG syntax
- Run entirely in the browser — no installation required

---

-  Full documentation and source code on [GitHub](https://github.com/robcanning/oscilla)

## What Kind of Software Is OscillaScore?

Oscilla is a hybrid system that sits between score playback engine, cue-based media framework, and distributed performance interface. It is designed to support composers and performers working with contemporary forms of notation, multimedia integration, and distributed coordination.

**It is:**

- A performance framework for distributed setups, allowing composers and performers to coordinate audio, animation, and media in real time  
- A cue-driven score playback and control system for structured, time-based, and media-integrated works  
- A networked playback environment supporting multi-client synchronization via WebSockets and OSC  
- A score authoring platform supporting compact mini-syntax for animation, transformation, and timing control using SVG ID conventions  

**It is not:**

- A full-featured notation program like MuseScore or Sibelius  
- A DAW or audio sequencing environment  

Nonetheless, when integrated with external tools such as Inkscape or conventional notation software, OscillaScore offers a robust environment for the composition and design of animated and spatial graphic scores. This hybrid approach supports a range of experimental, electroacoustic, and intermedia practices, enabling composers to work beyond the constraints of traditional notation.

<p style="text-align: left;">
  <a href="./assets/oscilla-ponysays-canning-dublin.png" target="_blank">
    <img src="./assets/oscilla-ponysays-canning-dublin.png" alt="OscillaScore Live" style="width: 100%; height: auto; border-radius: 6px;" />
  </a>
</p>
<p style="font-size: 0.9em; color: #666; max-width: 100%; text-align: left; margin-top: -0.5em;">
  <em>PonySays trio performing <strong>Rob Canning's composition <em>1:10,560 (6 inches to the Mile)</em></strong>, 2025 — intermedia score for electric guitar, synthesiser, and drums — at Dublin Sound Lab’s Music Current Festival, Project Arts Centre, Dublin. The musicians performed using iPads synchronized over a local network with Oscilla, while the projector was connected as a fourth client displaying the score to the audience.</em>
</p>


## Conceptual Overview

OscillaScore supports both fixed-form and open-form works, and can be used in isolation as a powerful environment for structuring electronic music compositions. It accommodates a range of artistic practices including:

- Animated graphic or symbolic scores  
- Distributed improvisation and comporovisation  
- Time-based cue sequences and gesture triggers  
- Media scores involving video, audio, or text prompts  
- Live networked performances and collaborative rehearsals  

It builds on the lineage of drawing-based music systems like Xenakis’s UPIC, reimagining the score as a spatial interface for sonic control. With support for animation and OSC, OscillaScore acts as both a form of notation and a performable instrument, allowing users to control sound through movement, timing, and visual gesture.

**It operates under two main paradigms:**

- A scrolling score model, suited for linear, horizontally-unfolding timelines  
- A page-based or hypertextual model, allowing spatial, nonlinear, or interactive structures  

These paradigms can coexist within a single score, enabling hybrid forms that mix continuous motion with branching or triggerable segments.

OscillaScore tightly integrates notation, performer cues, media triggers, and animation into a unified timing and control system. This allows complex audiovisual structures to be executed with precise coordination — ensuring seamless transitions between written material, live gestures, and multimedia elements.

Composers and performers can author complex transformations, animations, and media events using a concise SVG ID-based syntax paired with a powerful cue system.

## Use Cases

OscillaScore supports a wide range of use cases, including:

- **Score composition for ensembles**: Design dynamic, cue-based scores using SVG animations and transformation syntax tailored for group performance  
- **Rehearsal and performance for ensembles**: Share synchronized score playback with multiple musicians in real time using WebSockets or OSC
- **Telematic and distributed improvisation**: Use cues and visual animations to coordinate remote performers across networks  
- **Solo electronic music composition**: Compose and structure media-rich or animated works within a single local environment  
- **Interactive installations**: Embed visual or spatial scores in gallery contexts with OSC-driven sound interaction  
- **Mixed-media or hypermedia works**: Integrate text, video, sound, and interactivity in dynamic score designs  



---
##  Create Scores with Inkscape

OscillaScore is designed to work with [Inkscape](https://inkscape.org/) — a free, open-source vector graphics tool.

- Download: [inkscape.org/release](https://inkscape.org/release/)
- Use OscillaScore templates and naming conventions for animated SVG scores
- See [GitHub](https://github.com/robcanning/oscilla) for templates and examples

---
## Interactive Help Score File

Oscilla comes with an interactive help file help.svg. Here are some screenshots from the help score:

{% set galleryImages = [
  "oscilla_interface_screenshot.png",
  "oscilla-help-cues.png",
  "oscilla-help-cues2.png",
  "oscilla-help-osc1.png",
  "oscilla-help-osc2.png",
  "oscilla-help-paths1.png",
  "oscilla-help-paths2.png",
  "oscilla-help-rotation1.png",
  "oscilla-help-raster.png"
] %}

<div id="gallery" class="grid">
  {% for image in galleryImages %}
    <a href="./assets/{{ image }}"
       data-pswp-width="1920"
       data-pswp-height="1080"
       target="_blank" class="thumbnail">
      <img src="./assets/{{ image }}"
           alt="{{ image | replace('.png', '') | replace('_', ' ') }}" />
    </a>
  {% endfor %}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .thumbnail img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #ccc;
  }
</style>
---

## PonySays Trio using Oscilla @ MusicCurrent Festival 2025

<div class="video-container">
  <iframe src="https://www.youtube.com/embed/6LMr5QH07kk?si=8P0dZc2AABIRCOYN"
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen>
  </iframe>
</div>

<style>
  .video-container {
    position: relative;
    padding-bottom: 56.25%; /* 16:9 aspect ratio */
    height: 0;
    overflow: hidden;
    max-width: 100%;
    margin-bottom: 1rem;
  }

  .video-container iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }
</style>

---

## Workshops

OscillaScore workshops explore graphic notation, live performance, and networked interaction. These sessions are designed for composers, improvisers, and artists working at the intersection of sound, code, and visual media — exploring new modes of performance, interaction, and notation. OscillaScore workshops can be adapted to:

- Experimental music ensembles
- Improvisation collectives
- Composition/technology courses
- Hacklabs and interdisciplinary events

Workshops typically include live demos, collaborative score creation, and integrations with synthesis, spatial sound, or video. Please get in touch if you are interested in hosting a workshop.

<p style="text-align: left;">
  <a href="./assets/oscilla-workshop-cmc2025.png" target="_blank">
    <img src="./assets/oscilla-workshop-cmc2025.png" alt="Oscilla Workshop CMC 2025" style="width: 100%; height: auto; border-radius: 6px;" />
  </a>
</p>
<p style="font-size: 0.9em; color: #666; max-width: 100%; text-align: left; margin-top: -0.5em;">
  <em>The first Oscilla workshop hosted by the Contemporary Music Centre of Ireland as part of the Music Current Festival 2025. More details at <a href="https://www.cmc.ie/events/2025/apr/music-current-2025-rob-canning-digital-score-workshop" target="_blank">cmc.ie</a>.<br>
  Photo © Contemporary Music Centre of Ireland, 2025.</em>
</p>

---

## Papers in Preparation

One or more research papers related to Oscilla are currently in preparation for submission to peer-reviewed academic conferences. Due to the requirements of the double-blind review process, these preprints cannot be shared publicly at this stage. They will be made available here once the review process has concluded.

## Community & Support

- [GitHub Discussions](https://github.com/robcanning/oscilla/discussions)
- [Join Matrix Chat](https://matrix.to/#/#oscilla:matrix.org)
- [Follow @rob@toot.si](https://toot.si/@rob) on Mastodon

---

<p style="text-align: left;">
  <a href="./assets/oscilla_interface_screenshot.png" target="_blank">
    <img src="./assets/oscilla_interface_screenshot.png" alt="OscillaScore Interface" style="width: 50%; height: auto; border-radius: 6px;" />
  </a>
</p>

## Contact

For workshops, collaborations, or support:
- Email: <a href="mailto:rscanning@gmail.com">rscanning@gmail.com</a>
- Mastodon: [@rob@toot.si](https://toot.si/@rob)

---



---