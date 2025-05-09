# oscilla-toolbar: Inkscape Extension for oscillaScore

This extension helps you quickly insert SVG elements with pre-filled `id` values that conform to the `oscillaScore` animation and cue system. It simplifies the process of tagging objects with valid syntax.

## 🛠 Features
- Adds a rectangle with a default `id` like: `cue_audio(file(name.wav)_loop(1)_amp(1.0))`
- Or applies the ID to a selected object

## 📦 Installation
1. Copy the contents of the `extensions/` folder into your Inkscape extensions directory:
   - Linux: `~/.config/inkscape/extensions/`
   - Windows: `C:\Users\<YourName>\AppData\Roaming\Inkscape\extensions\`

2. Restart Inkscape.

3. Access via `Extensions → oscillaScore → Insert Cue ID Stub`

## 📁 Folder Structure
```
inkscape-extensions/
└── oscilla-toolbar/
    ├── README.md
    └── extensions/
        ├── cue_id_stub.inx
        └── cue_id_stub.py
```

## 🚀 Usage
- Select an object in Inkscape and run the extension to apply the stub `id`
- Or run with nothing selected to insert a new rectangle with the `id`

## 📌 Future Plans
- Dropdowns for different cue types and animations
- Rehearsal mark helper
- Full GTK panel for parameter selection
