# TODO List

## High Priority
1. **Fix Rewind to Start Button**
   - Ensure the rewind to start button works properly and aligns with the "R" keybinding functionality.

2. **Implement OSC Cues**
   - Send OSC messages when the playhead crosses `cue1`, `cue2`, etc., elements in the SVG.

## Medium Priority
3. **Resolve Playhead Position on Reload**
   - Ensure the playhead resumes playback from the start (0) after a browser reload unless synchronized by another client.

4. **Keybinding and Popup Improvements**
   - Fix any overlapping issues with multiple popups (Keybindings and Score Options).
   - Ensure all popups are displayed and toggled correctly.

## New Task
5. **Add SVG Inversion Processing**
   - Use the `invert-svg.js` Node.js script to preprocess two versions of the SVG file: `score-original.svg` and `score-inverted.svg`.
   - Integrate a toggle in the app to switch between these two versions.
   - Test with large SVG files to ensure performance is not affected.

## Low Priority
6. **Enhance Swiss Design Integration**
   - Refine the splash screen layout to adhere more closely to Swiss Design principles.

7. **Review and Improve Documentation**
   - Ensure the `README.md` and installation guides are comprehensive and up-to-date with the latest features.

---

Feel free to add or reorder tasks based on priorities. Let me know if you'd like assistance with any specific point!
