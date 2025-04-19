# Rotula

## Overview

**Rotula** is an interactive tool for live musical performances, workshops, and rehearsals. Designed to provide a dynamic and synchronized experience, Rotula enables playback of SVG-based scores with integrated support for multimedia elements, OSC (Open Sound Control), and customizable playback options.

## About Rotula

**Rotula** is a powerful tool for live musical performances, workshops, and rehearsals, enabling performers and composers to engage with interactive, scrolling scores. By using scalable vector graphics (SVG), Rotula allows for detailed, customizable visuals that synchronize seamlessly with playback. The system supports embedded cues for animations, audio, video, and Open Sound Control (OSC) messages, creating an immersive and dynamic performance environment that adapts to a variety of creative workflows.

With its OSC integration, Rotula connects effortlessly with external software such as Pure Data, SuperCollider, and Max/MSP, offering precise control over sound, visuals, and other performance parameters. It is optimized for both desktop and mobile devices, with responsive touch and keyboard controls that cater to various use cases. Popups for animations, videos, and program notes enhance the interactive experience, while playback features like adjustable speeds and real-time feedback help keep performers in sync.

Designed for versatility, Rotula excels in live performances, educational workshops, and rehearsal settings. It empowers users to redefine how scores are experienced and performed, seamlessly blending traditional notation with cutting-edge multimedia integration. Rotula offers a streamlined, intuitive platform that inspires creativity and innovation in music-making.


## Features

### Core Functionality

- **SVG Integration:** Upload custom SVG scores for seamless playback.
- **Custom Duration:** Set playback duration to match your composition.
- **Responsive Design:** Optimized for various devices, including iPads and mobile phones.
- **Multimedia Cues:** Cue animations, videos, and audio elements directly from the score.

### OSC Integration

- **OSC Broadcasting:** Share playback data (e.g., elapsed time, cue triggers) with software like Pure Data, SuperCollider, Max/MSP, and other OSC-capable systems.
- **OSC Triggers:** Embed OSC cues in the score for real-time interactions with connected software.
- **Dynamic OSC Events:** Trigger customizable OSC messages, including animations and audio synchronization.

### Playback Controls

- **Play/Pause:** Start and stop playback easily.
- **Rewind/Forward:** Navigate the score seamlessly in both directions.
- **Rewind to Start:** Quickly reset playback to the beginning.
- **Adjust Playback Speed:** Modify the speed with intuitive controls.
- **Dynamic Playhead:** Visual playhead for precise navigation.

### User Interface Enhancements

- **Fullscreen Mode:** Immerse yourself in the score using fullscreen.
- **Color Inversion:** Toggle between original and inverted color schemes for better readability in various lighting environments.
- **Floating Controls:** Intuitive and touch-friendly controls for tablets and phones.
- **Advanced and Simple Modes:** Switch between a minimal control interface or advanced features, including WebSocket toggles.

### Multimedia Integration

- **Animation Popups:** Sync animations with playback and display them as popups.
- **Video/Audio Playback:** Seamlessly cue video and audio elements from the score.
- **Custom Duration Management:** Set multimedia durations to align with score timing.

### Keybindings

| Key            | Action                     |
|-----------------|----------------------------|
| Space          | Play/Pause                 |
| Arrow Left     | Rewind                     |
| Arrow Right    | Forward                    |
| R              | Rewind to Start            |
| +              | Increase Speed             |
| -              | Decrease Speed             |
| H              | Show/Hide Splash Screen    |
| I              | Invert Colors              |
| W              | Toggle WebSocket           |

### Preparing a Score in Inkscape

#### Setting Up the Document

1. Open Inkscape and create a new document.
2. Set the document size with a wide width for scrolling (e.g., width: 10,000px, height: 1,000px).
3. Adjust the width to match the desired duration using the formula below.

#### Duration and Scroll Speed Formula

Score Width = (Playback Duration in seconds) * Scroll Speed

To calculate the appropriate width for your score based on the playback duration:

- **Formula:**
- Default Scroll Speed: 200 pixels/second.
- Example for 3 minutes (180 seconds):
  ```
  Score Width = 180 * 200 = 36,000 pixels.
  ```
- Adjust Scroll Speed in the app settings for slower or faster playback.

#### Adding Elements

1. Add visual elements such as staves, notes, and graphics as needed.
2. Use layers to organize your score visually.
3. Use the `Text` tool for adding labels or instructions.

#### Naming and Tagging Elements

1. For OSC cues, add unique IDs to elements in the format `cue_<type>_<id>`. Examples:
 - `cue_pause_1`: A cue to pause playback.
 - `cue_animation_intro`: A cue to trigger an animation.
 - `cue_osc_trigger_2`: A custom OSC trigger.
2. Ensure all cue IDs are unique across the SVG.
3. Namespace conventions:
 - Use consistent prefixes for cue types (`cue_`, `osc_`).
 - Avoid using spaces or special characters in IDs.

#### Exporting the SVG

1. Save the file as an SVG with plain SVG settings.
2. Avoid embedding unnecessary metadata or raster images to keep the file size manageable.
3. Test the exported SVG in the application to ensure proper scaling and cue detection.


## Animation Objects and `obj2path` Usage

The `obj2path` namespace is used to define objects that animate along paths in SVG files. The naming convention for these objects and paths is crucial to ensure correct behavior.

### Object Naming Convention
Objects in the SVG file must use the following naming convention:
obj2path-<pathID>speed<speedValue>direction<directionValue>[rotate<rotateValue>]

#### Parameters:
- **`<pathID>`**: Refers to the ID of the path in the SVG file the object will follow. The corresponding path must have an ID of `path-<pathID>`.
- **`_speed_<speedValue>`** *(optional)*: Specifies the speed of the animation in seconds. If omitted, the default duration set in the cue will be used.
- **`_direction_<directionValue>`** *(optional)*: Specifies the animation direction. Valid values:
  - `0`: Pingpong (default, moves back and forth).
  - `1`: Forward (moves along the path in one direction).
  - `2`: Reverse (moves backward along the path).
  - `3`: Random Jumps (randomly jumps between points on the path).
- **`_rotate_<rotateValue>`** *(optional)*:
  - `0`: Disable rotation (object maintains its original orientation).
  - If omitted, the object will align to the tangent of the path.

#### Example:
- **Object ID:** `obj2path-01_speed_5_direction_0`
  - Follows path `path-01`.
  - Moves along the path with a speed of 5 seconds per loop.
  - Pingpong direction (default behavior).
  - Aligns to the path's tangent.

---

## Cue `cue_animejs` Namespace

The `cue_animejs` namespace is used to trigger custom animations defined in SVG files as part of the scrolling score.

### Usage
When a `cue_animejs` trigger is activated, it:
1. Loads the specified animation file (e.g., an SVG with `obj2path` objects and paths).
2. Pauses the scrolling score.
3. Animates objects according to their defined behavior (`speed`, `direction`, `rotation`).
4. Resumes the scrolling score after the animation duration.

### Trigger Syntax
Cue IDs should follow this syntax:
cue_animejs_<fileID>[order<orderType>]


#### Parameters:
- **`<fileID>`**: Specifies the animation file to load. The file must exist in the correct directory.
- **`_order_<orderType>`** *(optional)*:
  - `0`: Random order (default).
  - `1`: Sequential order (objects animate one by one in their defined order).
  - `2`: All together (all objects animate simultaneously).

#### Example:
- **Cue ID:** `cue_animejs_map_animation_order_0`
  - Triggers the animation file `map_animation`.
  - Animates objects in a random order.
  - Resumes the scrolling score after the animation.

---

## Best Practices
1. Use meaningful IDs for paths and objects (e.g., `obj2path-guitar_line_speed_10_direction_1`).
2. Test animation files independently to verify path alignment and animation behavior before integrating them into the scrolling score.
3. Validate that all required paths exist in the SVG file with proper IDs (e.g., `path-guitar_line` for `obj2path-guitar_line`).

---

# 🚀 Case-Based Animation System Documentation
This system defines **six distinct animation behaviors** for objects in an **SVG score environment**.  
Each case controls **how objects move** along paths or between fixed points.

---

## 🔹 General Naming Format
### 🔹 Object IDs (`obj-*`)
For moving or rotating objects:
```
obj2path-<path_id>[_speed_<speed>][_direction_<mode>]
obj_<name>[_rotate_<rpm>][_dir_<1|0>][_pivot_x_<px>][_pivot_y_<px>][_ease_<easing>]
```
- `<path_id>` → The corresponding path’s **ID**.
- `<speed>` → Speed multiplier.
- `<mode>` → Motion mode (pingpong, forward, reverse, etc.).
- `<rpm>` → Rotations per minute.
- `<pivot_x>` / `<pivot_y>` → Custom pivot point.
- `<easing>` → Easing function (e.g., `"ease-in-out"`).

### 🔹 Path IDs (`path-*`)
For defining movement paths:
```
path-<id>[-<variant>]
```
- `<id>` → The **base ID** of the path.
- `<variant>` → Different **versions** of the path (for Case 5).

---

## 🔹 ID Naming for Each Case
### 🟢 Case 0: Ping-Pong Motion
**ID Format:**
```
obj2path-<path_id>_direction_0
```
**Example:**
```xml
<path id="path-1" d="M10,10 C100,200 300,200 400,10" />
<circle id="obj2path-path-1_direction_0" r="10" fill="red" />
```
**Behavior:** Moves back and forth along `path-1` using **ping-pong** animation.

---

### 🟢 Case 1: Forward Loop Motion
**ID Format:**
```
obj2path-<path_id>_direction_1
```
**Example:**
```xml
<path id="path-2" d="M10,10 L500,10" />
<circle id="obj2path-path-2_direction_1_speed_2" r="10" fill="blue" />
```
**Behavior:** Moves continuously **forward** along `path-2` at **2× speed**.

---

### 🟢 Case 2: Reverse Loop Motion
**ID Format:**
```
obj2path-<path_id>_direction_2
```
**Example:**
```xml
<path id="path-3" d="M100,50 L500,50" />
<rect id="obj2path-path-3_direction_2_speed_0.5" width="20" height="20" fill="green" />
```
**Behavior:** Moves continuously **backward** along `path-3` at **0.5× speed**.

---

### 🟢 Case 3: Random Jumps Within Playzone
**ID Format:**
```
obj2path-<path_id>_direction_3
```
**Example:**
```xml
<path id="path-4" d="M50,50 L600,50" />
<circle id="obj2path-path-4_direction_3" r="10" fill="orange" />
```
**Behavior:** Randomly jumps to **visible positions** along `path-4` (playzone-constrained).

---

### 🟢 Case 4: Fixed Node Jumps Along Path
**ID Format:**
```
obj2path-<path_id>_direction_4
```
**Example:**
```xml
<path id="path-5" d="M50,100 L200,100 L350,200 L500,50" />
<circle id="obj2path-path-5_direction_4" r="10" fill="purple" />
```
**Behavior:** Moves between **hardcoded nodes** along `path-5`.

---

### 🟢 Case 5: Multi-Path Variant with Randomized Pauses
**ID Format:**
```
obj2path-<base_path_id>_direction_5
```
- Requires multiple **path variants**:
  ```
  path-6-1
  path-6-2
  path-6-3
  ```
**Example:**
```xml
<path id="path-6-1" d="M50,150 L250,150" />
<path id="path-6-2" d="M100,200 L300,200" />
<path id="path-6-3" d="M150,250 L350,250" />
<circle id="obj2path-path-6_direction_5" r="10" fill="pink" />
```
**Behavior:** Moves between **different paths** (`path-6-1`, `path-6-2`, etc.), with **pause countdowns**.

---

### 🟢 Rotation Only (No Path)
**ID Format:**
```
obj_<name>_rotate_<rpm>_dir_<1|0>[_pivot_x_<px>][_pivot_y_<px>][_ease_<easing>]
```
**Example:**
```xml
<rect id="obj_wheel_rotate_30_dir_1_pivot_x_50_pivot_y_50" width="20" height="20" fill="black" />
```
**Behavior:** **Rotates at 30 RPM** around its center, **clockwise (`dir_1`)**.

---

## 📌 Summary Table: ID Naming
| **Case** | **Object ID Format** | **Path ID Format** |
|---------|---------------------|---------------------|
| **0** (Ping-Pong) | `obj2path-<path_id>_direction_0` | `path-<id>` |
| **1** (Forward) | `obj2path-<path_id>_direction_1` | `path-<id>` |
| **2** (Reverse) | `obj2path-<path_id>_direction_2` | `path-<id>` |
| **3** (Random Jumps) | `obj2path-<path_id>_direction_3` | `path-<id>` |
| **4** (Fixed Node Jumps) | `obj2path-<path_id>_direction_4` | `path-<id>` |
| **5** (Multi-Path Jumps) | `obj2path-<base_path_id>_direction_5` | `path-<base>-<variant>` |
| **Rotation** | `obj_<name>_rotate_<rpm>_dir_<1|0>` | *(No path required)* |

---

## 📌 Key Takeaways
- **Case 3 & 4:** Use **stepwise motion** but rely on different logic (random vs. fixed points).
- **Case 5:** Offers **more flexibility** than Case 4 by using multiple paths instead of static nodes.
- **Cases 0-2:** Provide **continuous motion** instead of stepwise movement.

---

## 🚀 Now Your SVG IDs Are Fully Defined!
This guide ensures **correct animation behavior** in your **SVG-based score system**.  
Let me know if you need refinements! 🔥




## Troubleshooting

- **Issue**: "No path found for object ID."
  - Ensure the `pathID` in the object matches an existing path ID in the SVG file.
  - Verify that suffixes (e.g., `_speed_*` or `_direction_*`) are correctly formatted.

- **Issue**: Objects are offset from the path.
  - Check that coordinate adjustments (e.g., `cx`, `cy`, `transformOrigin`) are correctly calculated using `getBBox()` and `getPointAtLength(0)`.

- **Issue**: Animations are not starting.
  - Verify that the `cue_animejs` trigger references a valid animation file.
  - Ensure that `obj2path` objects and their paths are correctly defined in the SVG.

  ## Cue Choice (`cue_choice`) Namespace

  The `cue_choice` namespace allows users to display a grid of animation options. Users can select one animation to play in an enlarged view. Once an animation is selected, the choice grid is dismissed, and the animation is played for its specified duration.

  ### Syntax
  The syntax for a `cue_choice` cue is:

  cue_choice_<file1>dur<duration1><file2>dur<duration2><file3>dur<duration3>_<file4>dur<duration4>


  #### Parameters:
  - **`<fileX>`**: The filename of the animation file to display in the choice grid. The file must exist in the `animations/` directory and be a valid SVG file.
  - **`dur_<durationX>`**: The duration (in seconds) for the corresponding animation file. This specifies how long the animation will run in the enlarged view.

  #### Example:
  cue_choice_orbit7_dur_230_orbit7_dur_230_orbit7_dur_30_orbit7_dur_230

  This example:
  - Displays a grid with 4 animations (`orbit7.svg`) from the `animations/` directory.
  - Each animation will run for its specified duration:
    - The first animation runs for 230 seconds.
    - The second animation runs for 230 seconds.
    - The third animation runs for 30 seconds.
    - The fourth animation runs for 230 seconds.

  ---

  ### How It Works
  1. **Triggering the Cue**:
     When the `cue_choice` is triggered, a grid is displayed showing the specified animations.

  2. **User Interaction**:
     - The user selects one animation by clicking on it.
     - The grid is dismissed, and the selected animation is played in an enlarged view (90% of the viewport height).

  3. **Animation Playback**:
     - The selected animation is played for its specified duration (`dur_X`).
     - After the duration ends, the animation automatically stops, and the scrolling score resumes.

  4. **Fallbacks**:
     - If an animation file fails to load, its grid option is removed, and the user is notified.

  ---

  ### Best Practices
  - Use meaningful filenames and durations to ensure clarity in the choice grid.
  - Test all animation files independently before integrating them into a `cue_choice` cue.
  - Ensure that all animation files exist in the `animations/` directory and are valid SVG files.

  ---

  ### Troubleshooting
  - **Issue**: "One or more animations failed to load."
    - Ensure the filenames specified in the `cue_choice` cue exist in the `animations/` directory.
    - Verify that the filenames and durations are correctly formatted.

  - **Issue**: "Animation grid appears but selection does nothing."
    - Ensure the `handleCueChoice` function is properly implemented and accessible.
    - Verify that the `handleEnlargeAnimation` function is correctly integrated.

  - **Issue**: "Animations are misaligned or invisible."
    - Ensure that the SVG files are properly styled with visible `stroke` and/or `fill` properties.
    - Confirm that the animations are aligned correctly using `transformOrigin` or similar adjustments.

  ---

  ### Notes
  - `cue_choice` is designed for scenarios where the user selects one animation from a predefined set.
  - Each animation in the grid has an overlaid label showing its filename and duration.

---
## Animation Type: Rotation (`obj_*_rotate_*`)

The `obj_*_rotate_*` namespace defines objects that rotate around a specified pivot point or their center. This animation type is highly customizable, allowing control over speed (rotations per minute), direction, easing, duration, and pivot point.

### **Namespace Format**
obj_<id>rotate<rpm>dir<direction>pivot_x<x_offset>y<y_offset>dur<duration>ease<easing>

### **Parameters**
| Parameter              | Description                                                                                     | Example                     | Default Value           |
|------------------------|-------------------------------------------------------------------------------------------------|-----------------------------|-------------------------|
| `rotate_<rpm>`         | Rotations per minute (RPM). Specifies the speed of rotation.                                    | `_rotate_3`                 | `1` RPM                |
| `dir_<direction>`      | Direction of rotation. `0` for clockwise, `1` for counterclockwise.                             | `_dir_1`                    | `0` (clockwise)        |
| `pivot_x_<x_offset>`   | X-coordinate of the rotation pivot point relative to the object's bounding box.                 | `_pivot_x_50`               | Center of the object   |
| `pivot_y_<y_offset>`   | Y-coordinate of the rotation pivot point relative to the object's bounding box.                 | `_pivot_y_50`               | Center of the object   |
| `dur_<duration>`       | Duration in seconds for the rotation animation to complete. If omitted, defaults to infinite.   | `_dur_30`                   | Infinite               |
| `ease_<easing>`        | Easing function for the rotation animation. Can be `linear`, `easeInOut`, etc.                 | `_ease_easeInOut`           | `linear`               |

### **Examples**
1. **Simple Rotation**:
    ```
    obj_01_rotate_3
    ```
    - Rotates at 3 RPM clockwise around its center indefinitely.

2. **Counterclockwise Rotation with Custom Pivot**:
    ```
    obj_01_rotate_2_dir_1_pivot_x_20_pivot_y_30
    ```
    - Rotates counterclockwise at 2 RPM around a pivot point offset by `(20, 30)`.

3. **Rotation with Duration and Easing**:
    ```
    obj_02_rotate_4_dir_0_pivot_x_0_pivot_y_0_dur_15_ease_easeInOut
    ```
    - Rotates clockwise at 4 RPM around its center for 15 seconds, using `easeInOut` easing.

4. **Combined with Translation**:
    ```
    obj_03_rotate_5_translate_x_100_y_50_dur_20_ease_easeOut
    ```
    - Rotates clockwise at 5 RPM while translating by `(100, 50)` over 20 seconds with `easeOut` easing.

---

### **How It Works**
1. **Default Behavior**:
    - By default, the object rotates around its own center (`transform-origin: center`).
    - If `pivot_x` and `pivot_y` are defined, these values are used as the rotation pivot.

2. **Speed**:
    - The `rotate_<rpm>` value determines the speed in rotations per minute.
    - This is converted into a duration for Anime.js.

3. **Direction**:
    - `dir_0`: Clockwise.
    - `dir_1`: Counterclockwise.

4. **Duration**:
    - If `dur_<duration>` is specified, the rotation stops after the specified duration (in seconds).
    - If omitted, the rotation loops infinitely.

5. **Easing**:
    - The `ease_<easing>` parameter allows you to control the animation's speed curve.

---

### **Troubleshooting**
1. **Object Rotates Around Wrong Point**:
    - Ensure the `pivot_x` and `pivot_y` parameters are correctly defined.
    - If these are omitted, verify that the object's bounding box (`getBBox()`) correctly represents its dimensions.

2. **Rotation Is Too Fast/Slow**:
    - Verify the `rotate_<rpm>` value. This determines the speed in rotations per minute.

3. **Animation Does Not Start**:
    - Ensure the object ID matches the namespace format (`obj_*_rotate_*`).
    - Check the console logs for `[DEBUG]` messages indicating any parsing errors.

---

### **Behavior Summary**
- **Infinite Rotation**: If no duration is specified, the animation loops infinitely.
- **Custom Pivot Points**: Supports rotation around an arbitrary point, defined by `pivot_x` and `pivot_y`.
- **Customizable Speed and Direction**: Control rotations per minute and the direction of rotation.
- **Easing Effects**: Choose from various easing functions for smoother animations.

---

### **Integrating With Existing SVG Files**
1. Add objects with IDs using the `obj_*_rotate_*` namespace:
    ```html
    <rect id="obj_01_rotate_3_dir_0" x="50" y="50" width="100" height="100" fill="red"></rect>
    ```
2. Call `handleAnimejsCue` to animate:
    ```javascript
    handleAnimejsCue('cue_animejs_example', 'path/to/svgfile.svg', 30);
    ```
3. Verify rotation behavior in the browser.

## **Inline Annotations in the Score**

### **Overview**
The score supports **inline annotations** to assist performers during **score study and rehearsal**. These annotations use the **`note-` namespace** in the SVG's XML structure, allowing specific elements to be toggled **on and off** through the control button in the GUI.

### **How It Works**
- Annotations are **not visible by default** during performance.
- They can be toggled **on/off** using the **📝 (Sticky Note) button** in the control bar.
- These notes are intended as **interpretation aids** to help performers analyze and prepare the work.
- **They are not intended for live performance** and should be disabled during playback.

> **"Toggle the visibility of these notes in the control bar. They are intended as interpretation aids for score study and rehearsal purposes, helping performers analyze and prepare the work. These notes are not intended for use during performance and should be disabled when playing live."**

---

### **How to Add Annotations in Inkscape**
Annotations can be added directly within **Inkscape** by modifying the **ID of SVG elements**. Follow these steps:

1. **Open the SVG file in Inkscape.**
2. **Create a new text element** (or any shape) that represents the annotation.
3. **Set the ID** of the element to follow the `note-` namespace:
   - Example:  
     - `note-0`
     - `note-1`
     - `note-sectionA`
4. **Save the SVG file**, ensuring that the IDs are correctly stored in the XML.

When the file is loaded into the score, these annotations will be **detected automatically** and can be **toggled on/off** using the GUI button.

---

### **Technical Details**
- The system **queries all elements with an ID starting with `note-`**.
- These elements are **set to `display: none` when toggled off** and `display: block` when toggled on.
- The visibility toggle **does not affect other score elements** and is purely for **performer reference**.

---

### **Example XML Snippet**
```xml
<text id="note-0" x="100" y="50" font-size="12" fill="black">
    This is an annotation for performers.
</text>


## 🎵 Rehearsal Mark Functionality

The **Rehearsal Mark system** allows users to quickly jump to specific points in the score using labeled markers.

### 🔹 How It Works
- **Markers are extracted from the SVG** based on their `id` attributes.
- Each rehearsal mark must have an `id` in the format:  

rehearsal_A, rehearsal_B, rehearsal_C, etc.

- When a **rehearsal mark is selected**, the score **scrolls automatically** to align it with the playhead.
- Rehearsal marks can be accessed via a **popup menu (`R` keybinding)** or **directly clicked** if available.

### 🔹 How Rehearsal Marks Are Defined
- The system scans the **`id` attributes** of text objects in the SVG.
- **Example in Inkscape:**
- A text object with `id="rehearsal_A"` at `x = 1000` is recognized as **Rehearsal Mark A**.
- **Ensure that**:
- The `id` starts with `rehearsal_`
- The marker is a **text object** in the SVG.

### 🔹 Jumping to a Rehearsal Mark
- Selecting a rehearsal mark **updates the elapsed time** and **scrolls the score**.
- The playhead is **centered on the mark** for consistency.
- WebSocket messages ensure all connected clients stay **synchronized** when a jump occurs.

### 🔹 Keyboard Shortcuts
- Press **`R`** to open the **Rehearsal Mark menu**.
- Click on a mark in the popup to **jump instantly** to that location.


# 📖 Receiving OSC Messages in External Software

This section explains **how to receive OSC messages** from **Rotula Score** in software such as **Pure Data, Max/MSP, SuperCollider, and Ableton Live**.

---

## **🔍 Understanding OSC Messages from Rotula Score**

Rotula Score sends OSC messages for various events such as stopwatch updates and cue triggers. These messages typically follow this format:

### **Example Messages**

```
/stopwatch s "0:17"
/cue/trigger i 1
```

- `/stopwatch` → Sends the current elapsed time as a **string (`s`)**.
- `/cue/trigger` → Sends an **integer (`i`)** representing the triggered cue.

---

## **🎛️ Setting Up OSC in Different Software**

### **🔹 Pure Data (Pd)**

1. Create a **[netreceive]** object with the correct port (e.g., `57121`):
   ```
   [netreceive -u 57121]
   |
   [oscparse]
   |
   [list trim]
   |
   [print OSC]
   ```
2. This will print incoming OSC messages in **Pure Data’s console**.

---

### **🔹 Max/MSP**

1. Add a **[udpreceive]** object:
   ```
   [udpreceive 57121]
   |
   [oscroute /stopwatch /cue/trigger]
   |
   [print OSC]
   ```
2. This will route incoming OSC messages and print them in **Max's console**.

---

### **🔹 SuperCollider**

1. Start an OSC listener:
   ```supercollider
   OSCdef(\stopwatch, { |msg| msg.postln }, '/stopwatch');
   OSCdef(\cueTrigger, { |msg| msg.postln }, '/cue/trigger');
   ```
2. This will print received messages to **SuperCollider’s post window**.

---

### **🔹 Ableton Live (via Max for Live)**

1. Open a **Max for Live** device and add:
   ```
   [udpreceive 57121]
   |
   [unpack s]
   |
   [print OSC]
   ```
2. This will print incoming OSC messages in **Ableton's Max console**.

---

## **🚀 Next Steps**

1. **Start your external software** (Pure Data, Max/MSP, etc.).
2. **Set the correct listening port (`57121`)**.
3. **Trigger cues or stopwatch events in Rotula Score**.
4. **Verify messages are received in your software's console**.

---

### **💬 Need Help?**

If you’re not seeing OSC messages in your software, check:

- Your **network settings** (ensure UDP messages aren’t blocked).
- The **listening port (`57121`) is correctly set**.
- Your **software is actively running and listening**.

---

🚀 This ensures **Rotula Score OSC messages can be received correctly across different external tools!**






## Installation

### Prerequisites
- [Node.js](https://nodejs.org/)
- Python and the `pyliblo` library for OSC testing.

### Instructions
1. Clone the repository:
    ```bash
    git clone https://git.kompot.si/rob/ponysays.git
    cd ponysays
    ```
2. Install dependencies:
    ```bash
    npm install
    ```
3. Start the development server:
    ```bash
    npm start
    ```
4. Open the application in your browser:
    ```bash
    http://localhost:8000
    ```

## Usage

### Setting Up a Score
1. Open the application in your browser.
2. On the splash screen:
    - Upload your SVG score using the **Upload SVG** option.
    - Enter the playback duration in minutes.
3. Press **Enter** to begin playback.

### Controls
Refer to the **Keybindings** section for details on keyboard shortcuts and button actions.

## Testing OSC Functionality

### Listening to OSC Messages
1. Open a terminal and start the OSC listener:
    ```bash
    oscdump 57120
    ```
2. Watch for incoming messages such as:
    ```
    /stopwatch "5:43 / 30:00"
    ```
3. OSC cues, such as crossing elements tagged as `cue1` or `cue2` in the SVG, are also transmitted.

## Contributing

We welcome contributions to this project! Please fork the repository, make your changes, and submit a pull request. For any issues or feature requests, feel free to open a GitHub issue.

## Development Notes

### Recent Updates
- **SVG Cue Detection:** OSC messages are sent when the playhead intersects specific SVG elements tagged with IDs like `cue1`.
- **Dynamic Playback Duration:** Duration can be set in minutes via the splash screen's input box.
- **Rewind to Start:** Added both a button and keybinding (`R`) to rewind to the beginning.
- **OSC Enhancements:** Real-time stopwatch updates and cue events are broadcasted via OSC.
- **Error Handling:** Improved error messaging when invalid SVG files are uploaded.

### Known Issues
- **Playhead Resets on Reload:** After refreshing the browser, playback resumes from the last position instead of starting at zero.
- **Rewind Button:** Ensure the "Rewind to Start" button mirrors `R` keybinding behavior.

## License

This project is licensed under the MIT License.

## Contact

For inquiries or collaborations, contact [Rob Canning](mailto:rob@example.com).


## technical descriptions
### **📌 Importance of `playheadX`**

1. **`playheadX` is the primary reference for positioning within the digital score, representing an absolute pixel location based on `scoreWidth`.**  
2. **It is independent of screen size and viewport scaling, ensuring playback remains accurate across different devices.**  
3. **Unlike `elapsedTime`, which is time-based, `playheadX` provides a direct spatial reference for scrolling, cue triggering, and alignment.**  
4. **All playback movements, including rewinds, jumps, and fast-forwarding, should be driven by `playheadX` to maintain consistent score positioning.**  
5. **Synchronization across clients is achieved by transmitting `playheadX`, allowing each device to render the correct position regardless of screen size.**  
6. **Only when adjusting for viewport centering does `playheadX` become screen-dependent, but otherwise, it serves as the universal reference for playback and score navigation.**  




## **🔀 Live vs. Development Environments: Handling Different URLs**

### **📌 Overview**
The application dynamically configures WebSocket and OSC connections depending on whether it is running in a **development** or **live (production)** environment. This is managed using environment-specific configuration files:  

- **`ponysays.dev.config.js`** → Used for local development (`localhost`).  
- **`ponysays.live.config.js`** → Used for production deployment (`ponysays.live`).  

These configurations ensure that the correct WebSocket and OSC addresses are used based on where the server is running.

---

## **🛠️ How Configuration Files Work**
The configuration is **not hardcoded in the main server file** (`server.js`). Instead, it loads settings dynamically based on the environment.

### **1️⃣ Configuration Files**
Both `ponysays.dev.config.js` and `ponysays.live.config.js` define:
- **WebSocket host (`WS_HOST`) and port (`WS_PORT`)**
- **OSC local and remote addresses and ports (`OSC_LOCAL_PORT`, `OSC_REMOTE_PORT`)**
- **Environment mode (`NODE_ENV`) to differentiate between development and production**

These files ensure that when the application starts, it references the correct settings for its environment.

### **2️⃣ How These Configurations Are Loaded**
The server (`server.js`) detects the environment mode by checking `NODE_ENV` and loads the corresponding configuration file. This prevents the need for manual changes when switching between development and production.

When running in **development mode**, the server uses `ponysays.dev.config.js`, connecting to WebSockets and OSC locally.

When running in **production mode**, it uses `ponysays.live.config.js`, connecting to the live WebSocket server and using an external OSC address.

### **3️⃣ How Clients Determine the WebSocket URL**
The WebSocket URL is dynamically determined on the client side (`app.js`). Instead of hardcoding the WebSocket connection, the client fetches configuration data from the server (`/config`) and adapts its connection settings based on whether it is running locally or on a remote server.

If the application is accessed via `localhost`, it connects to a local WebSocket server. If it is accessed on a production domain (`ponysays.live`), it connects to the corresponding production WebSocket server.

---

## **🎯 Summary: How the System Adapts to Different Environments**
| **Component**      | **Development (`localhost`)** | **Production (`ponysays.live`)** |
|-------------------|-----------------------------|--------------------------------|
| WebSocket Host   | `localhost`                   | `ponysays.live` |
| WebSocket Port   | Defined in `ponysays.dev.config.js` | Defined in `ponysays.live.config.js` |
| OSC Local Address | `127.0.0.1` (local machine)   | Remote IP address for live OSC |
| Configuration File | `ponysays.dev.config.js`    | `ponysays.live.config.js` |

---

## **💡 Key Benefits of This System**
✅ **Prevents hardcoded URLs and ports, reducing manual changes.**  
✅ **Automatically adapts to development and production environments.**  
✅ **Ensures WebSocket and OSC connections work correctly in both modes.**  
✅ **Allows future changes to be made in config files without modifying `server.js`.**  

🔥 **This system ensures smooth development and deployment without connection issues!** 🚀


## **Animation Loop and Playback Logic**

### **Overview**
The animation loop in the system is responsible for ensuring smooth playback synchronization across clients. It controls real-time updates to the **playhead position**, **UI elements**, and **cue triggers**. The animation loop is tightly integrated with **WebSocket sync messages**, **local freewheeling updates**, and **server playback state changes**.

---

### **1. Animation Flow**
#### **1.1. Initiating Playback**
- When playback starts, the function **`startAnimation()`** is triggered.
- This function sets up a **continuous update loop** using **`requestAnimationFrame()`**.
- It ensures that **playheadX** updates smoothly, whether from **server sync messages** or **client-side freewheeling**.

#### **1.2. Frame-by-Frame Updates**
- Each animation frame:
  - The function **`startAnimation()`** recalculates **playheadX**.
  - It determines the **incremental movement** based on time elapsed since the last frame.
  - It applies this movement to **viewport.scrollLeft** to move the score smoothly.
  - It updates **elapsedTime** for any UI components that rely on time-based progression.

#### **1.3. Cue Triggering and UI Updates**
- During each frame, the following updates occur:
  - **`updatePosition()`** ensures the UI matches the latest playhead position.
  - **`updateSeekBar()`** synchronizes the seek bar with playback.
  - **`updateStopwatch()`** updates time-based UI elements.
  - **`checkCueTriggers(elapsedTime)`** determines if any cues need to be activated.

---

### **2. Handling External Sync Messages**
#### **2.1. WebSocket Sync Messages**
- The client listens for sync messages from the **server WebSocket**.
- When a sync message of type **"sync"** is received:
  - **`syncState(state)`** updates **playheadX** based on the latest server-provided value.
  - If playback is **out of sync**, the playhead is corrected.

#### **2.2. Resuming From Pause**
- When a **pause cue** or manual pause occurs:
  - **`stopAnimation()`** halts updates.
  - **`togglePlayButton()`** updates the UI to reflect the paused state.
- When playback resumes:
  - **`startAnimation()`** restarts the **requestAnimationFrame()** loop.
  - Freewheeling resumes if **no new sync message** arrives.

---

### **3. Freewheeling (Predictive Motion)**
#### **3.1. Estimating Motion Between Sync Updates**
- If no sync message is received for a while, the client **predicts movement**:
  - **`estimatePlayheadPosition()`** calculates an estimated position based on time since the last sync.
  - This prevents visible stuttering when sync messages are infrequent.

#### **3.2. Maintaining Playback Consistency**
- Freewheeling runs **until**:
  - A new sync message arrives and **corrects the playhead**.
  - The user manually seeks or pauses playback.

---

### **4. Server-Controlled Playback**
#### **4.1. Server Updates**
- The server periodically **broadcasts sync messages** to ensure all clients remain aligned.
- These messages are received by the WebSocket event handler and processed in **`syncState()`**.

#### **4.2. Handling Jumps and Rewinds**
- When a user jumps to a different position:
  - The client sends a **"jump"** message to the server.
  - The server updates **all connected clients** with the new position.
  - The UI updates instantly using **`syncState()`**.

---

### **5. Error Handling and Edge Cases**
- If playback becomes **desynchronized**, the server forces a correction.
- If **network latency** causes slow sync messages:
  - The client **freewheels** to prevent stuttering.
- If the user **seeks manually**, animation is temporarily **paused** to avoid overriding the manual change.

---

### **Conclusion**
The animation loop is the core of smooth playback. It seamlessly integrates **real-time movement updates, WebSocket synchronization, freewheeling prediction, and UI updates**. By blending server-controlled sync with client-side interpolation, the system ensures **fluid motion** across different network conditions.
