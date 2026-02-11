# ============================================================
# Oscilla User Manual — Makefile
# ============================================================

SHELL := /bin/bash

# -- Paths --
DOCS     := ../docs/src
OUT      := output
BUILD    := .build
META     := metadata.yaml
FRONT    := frontmatter.md
PREAMBLE := ../shared-latex/preamble.tex
FILTER   := oscilla-manual-filter.lua
VERSION  := $(shell cat ../../VERSION 2>/dev/null || echo "dev")

# -- Pandoc settings --
PANDOC   := pandoc
ENGINE   := --pdf-engine=xelatex
COMMON   := --from=markdown \
            --standalone \
            --metadata-file=$(META) \
            --metadata title="Oscilla User Manual" \
            --metadata author="Rob Canning" \
            --metadata date="$$(date +%Y)" \
            --resource-path=.:$(DOCS):$(DOCS)/img \
            --shift-heading-level-by=1 \
            --lua-filter=$(FILTER)

# -- Index files that need {.chapter} added for pandoc --
INDEX_SRCS := \
	$(DOCS)/getting-started/index.md \
	$(DOCS)/session/index.md \
	$(DOCS)/cues/index.md \
	$(DOCS)/animation/index.md \
	$(DOCS)/control/index.md \
	$(DOCS)/tools/index.md \
	$(DOCS)/dev/index.md

# Processed copies with {.chapter} injected
INDEX_BUILT := $(patsubst $(DOCS)/%,$(BUILD)/%,$(INDEX_SRCS))

# -- Source files in manual order --

GETTING_STARTED := \
	$(BUILD)/getting-started/index.md \
	$(DOCS)/getting-started/about.md \
	$(DOCS)/getting-started/INSTALL.md \
	$(DOCS)/getting-started/QUICKSTART.md \
	$(DOCS)/getting-started/workflow.md \
	$(DOCS)/getting-started/working-with-parts.md

SESSION := \
	$(BUILD)/session/index.md \
	$(DOCS)/session/playhead.md \
	$(DOCS)/session/parts-layers.md \
	$(DOCS)/session/performer_annotations.md \
	$(DOCS)/session/drawing.md \
	$(DOCS)/session/markers.md \
	$(DOCS)/session/timers.md \
	$(DOCS)/session/drag.md \
	$(DOCS)/session/liveconsole.md

CUES := \
	$(BUILD)/cues/index.md \
	$(DOCS)/cues/cue_stop.md \
	$(DOCS)/cues/cue_pause.md \
	$(DOCS)/cues/cue_speed.md \
	$(DOCS)/cues/cue_stopwatch.md \
	$(DOCS)/cues/cue_metronome.md \
	$(DOCS)/cues/cue_page.md \
	$(DOCS)/cues/cue_nav.md \
	$(DOCS)/cues/cue_button.md \
	$(DOCS)/cues/cue_propagate.md \
	$(DOCS)/cues/cue_reuse.md \
	$(DOCS)/cues/cue_text.md \
	$(DOCS)/cues/cue_audio.md \
	$(DOCS)/cues/cue_video.md \
	$(DOCS)/cues/cue_synth.md \
	$(DOCS)/cues/cue_osc.md \
	$(DOCS)/cues/cue_oscCtrl.md

ANIMATION := \
	$(BUILD)/animation/index.md \
	$(DOCS)/animation/cue_scale.md \
	$(DOCS)/animation/cue_rotate.md \
	$(DOCS)/animation/cue_o2p.md \
	$(DOCS)/animation/cue_traverse.md \
	$(DOCS)/animation/cue_color.md \
	$(DOCS)/animation/cue_fade.md \
	$(DOCS)/animation/cue_ui.md

CONTROL := \
	$(BUILD)/control/index.md \
	$(DOCS)/control/control-and-modulation.md \
	$(DOCS)/control/controlXY.md

TOOLS := \
	$(BUILD)/tools/index.md \
	$(DOCS)/tools/inkscape_extension.md

DEV := \
	$(BUILD)/dev/index.md \
	$(DOCS)/dev/dev-oscilla-overview-documentation.md \
	$(DOCS)/dev/oscilla_architecture_overview.md \
	$(DOCS)/dev/dev-sync-architecture.md \
	$(DOCS)/dev/oscilla-developer-guide-new-cue.md \
	$(DOCS)/dev/dev-control-modulation.md \
	$(DOCS)/dev/dev-newproject-flow.md \
	$(DOCS)/dev/dev-osc.md \
	$(DOCS)/dev/dev-drag.md \
	$(DOCS)/dev/dev-marker-nav.md \
	$(DOCS)/dev/dev-drawing.md \
	$(DOCS)/dev/dev-liveconsole.md \
	$(DOCS)/dev/dev-playhead.md

SOURCES := $(FRONT) \
           $(GETTING_STARTED) \
           $(SESSION) \
           $(CUES) \
           $(ANIMATION) \
           $(CONTROL) \
           $(TOOLS) \
           $(DEV)

# -- Preprocessing: add {.chapter} to first # heading in index.md files --

$(BUILD)/%.md: $(DOCS)/%.md
	@mkdir -p $(dir $@)
	sed '0,/^# /{s/^# \(.*\)/# \1 {.chapter}/}' $< > $@

# Generate version header for LaTeX
$(BUILD)/version.tex:
	@mkdir -p $(BUILD)
	echo "\\renewcommand{\\oscillaversion}{$(VERSION)}" > $@

# -- Targets --

.PHONY: all pdf html epub clean

all: pdf html epub

$(OUT):
	mkdir -p $(OUT)

pdf: $(INDEX_BUILT) $(BUILD)/version.tex | $(OUT)
	$(PANDOC) $(COMMON) $(ENGINE) \
		--include-in-header=$(PREAMBLE) \
		--include-in-header=$(BUILD)/version.tex \
		-o $(OUT)/oscilla-usermanual.pdf \
		$(SOURCES)
	@echo "Built: $(OUT)/oscilla-usermanual.pdf"

html: $(INDEX_BUILT) | $(OUT)
	$(PANDOC) $(COMMON) \
		--to=html5 \
		--toc \
		--self-contained \
		--css=../shared-latex/html-manual.css \
		-o $(OUT)/oscilla-usermanual.html \
		$(SOURCES)
	@echo "Built: $(OUT)/oscilla-usermanual.html"

epub: $(INDEX_BUILT) | $(OUT)
	$(PANDOC) $(COMMON) \
		--to=epub3 \
		--toc \
		-o $(OUT)/oscilla-usermanual.epub \
		$(SOURCES)
	@echo "Built: $(OUT)/oscilla-usermanual.epub"

clean:
	rm -rf $(OUT) $(BUILD)
