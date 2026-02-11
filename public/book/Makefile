# ============================================================
# Oscilla Book — Makefile
# Run from: oscilla/public/book/
#
# Original prose chapters live in chapters/.
# Appendices can pull from doc sources for reference material.
#
# Usage:
#   make pdf       Build PDF only
#   make html      Build HTML only
#   make epub      Build EPUB only
#   make all       Build all formats
#   make clean     Remove output/
# ============================================================

SHELL := /bin/bash

# -- Paths --
DOCS     := ../docs/src
OUT      := output
META     := metadata.yaml
PREAMBLE := ../shared-latex/preamble.tex

# -- Pandoc settings --
PANDOC   := pandoc
ENGINE   := --pdf-engine=xelatex
COMMON   := --from=markdown \
            --standalone \
            --metadata-file=$(META) \
            --resource-path=.:chapters:$(DOCS):$(DOCS)/img \
            --shift-heading-level-by=0 \
            --top-level-division=chapter

# -- Chapter sources (original prose) --
CHAPTERS := \
	chapters/01-introduction.md \
	chapters/02-context.md \
	chapters/03-getting-started.md \
	chapters/04-score-authoring.md \
	chapters/05-cue-system.md \
	chapters/06-animation.md \
	chapters/07-control.md \
	chapters/08-networking.md \
	chapters/09-session-features.md \
	chapters/10-cookbook.md \
	chapters/11-case-studies.md \
	chapters/12-advanced.md

# -- Appendices (can mix original + doc sources) --
APPENDICES := \
	chapters/appendix-a-cue-reference.md \
	chapters/appendix-b-osc-reference.md \
	chapters/appendix-c-inkscape-ext.md

SOURCES := $(CHAPTERS) $(APPENDICES)

# -- Targets --

.PHONY: all pdf html epub clean

all: pdf html epub

$(OUT):
	mkdir -p $(OUT)

pdf: $(OUT)
	$(PANDOC) $(COMMON) $(ENGINE) \
		--include-in-header=$(PREAMBLE) \
		-o $(OUT)/oscilla-book.pdf \
		$(SOURCES)
	@echo "Built: $(OUT)/oscilla-book.pdf"

html: $(OUT)
	$(PANDOC) $(COMMON) \
		--to=html5 \
		--toc \
		--self-contained \
		--css=../shared-latex/html-manual.css \
		-o $(OUT)/oscilla-book.html \
		$(SOURCES)
	@echo "Built: $(OUT)/oscilla-book.html"

epub: $(OUT)
	$(PANDOC) $(COMMON) \
		--to=epub3 \
		--toc \
		-o $(OUT)/oscilla-book.epub \
		$(SOURCES)
	@echo "Built: $(OUT)/oscilla-book.epub"

clean:
	rm -rf $(OUT)
