---
title: OscillaScore
layout: layout.njk
---

OscillaScore is an open-source platform for creating and performing time-based, animated notation in the browser. It supports collaborative performance, synthesis control, and visual experimentation using simple SVG and web technologies.

##  What Can OscillaScore Do?

- Synchronize score playback across local devices or remote performers
- Trigger audio, events, or OSC messages via cues
- Combine open-form and fixed-form structures for hybrid performance formats
- Animate shapes, symbols, and cues using custom SVG syntax
- Run entirely in the browser — no installation required

---

-  Full documentation and source code on [GitHub](https://github.com/robcanning/oscilla)

---
##  Create Scores with Inkscape

OscillaScore is designed to work with [Inkscape](https://inkscape.org/) — a free, open-source vector graphics tool.

- Download: [inkscape.org/release](https://inkscape.org/release/)
- Use OscillaScore templates and naming conventions for animated SVG scores
- See [GitHub](https://github.com/robcanning/oscilla) for templates and examples

---

## PonySays Trio using Oscilla @ MusicCurrent Festival 2025

<iframe width="560" height="315" src="https://www.youtube.com/embed/6LMr5QH07kk?si=8P0dZc2AABIRCOYN" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

---

## Workshops

OscillaScore workshops explore graphic notation, live performance, and networked interaction. These sessions are designed for composers, improvisers, and artists working at the intersection of sound, code, and visual media — exploring new modes of performance, interaction, and notation. OscillaScore workshops can be adapted to:

- Experimental music ensembles
- Improvisation collectives
- Composition/technology courses
- Hacklabs and interdisciplinary events

Workshops typically include live demos, collaborative score creation, and integrations with synthesis, spatial sound, or video. Please get in touch if you are interested in hosting a workshop.

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

## Gallery

<div id="gallery" class="grid">
  {% for i in [1,2,3,4,5,6,7,8] %}
    <a href="/webdocs/assets/oscilla_interface_screenshot.png"
       data-pswp-width="1920"
       data-pswp-height="1080"
       target="_blank" class="thumbnail">
      <img src="/webdocs/assets/oscilla_interface_screenshot.png"
           alt="Screenshot {{ i }}" />
    </a>
  {% endfor %}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .thumbnail img {
    width: 100%;
    height: 140px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid #ccc;
  }
</style>

---