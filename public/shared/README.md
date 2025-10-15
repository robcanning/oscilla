### 📁 Example Project Layout

```text
public/
├── scores/
│   └── sonata4/
│       ├── score.svg                # Main scrolling score
│       ├── manifest.json            # Optional metadata
│       ├── pages/                   # Page-mode SVGs for this project
│       │   ├── page0.svg
│       │   ├── page1.svg
│       │   └── page2.svg
│       ├── audio/                   # (Optional) Project-specific sounds
│       │   └── intro_theme.wav
│       ├── texts/                   # (Optional) Project-specific text cues
│       │   └── narration.txt
│       ├── videos/                  # (Optional) Local media
│       │   └── background.mp4
│       └── assets/                  # (Optional) Other linked visuals
│           └── logo.svg
│
└── shared/
    ├── help/                        # Shared help / tutorial project
    │   ├── score.svg
    │   └── pages/
    │       ├── intro.svg
    │       ├── choices01.svg
    │       └── objects.svg
    │
    ├── audio/                       # Global fallback sounds
    │   ├── click.wav
    │   └── alert.wav
    │
    ├── texts/                       # Global fallback texts
    │   └── instructions.txt
    │
    └── videos/                      # Global fallback videos
        └── splash_intro.mp4
