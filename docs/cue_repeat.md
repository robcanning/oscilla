# 🔁 Repeat Cue Logic in Rotula.Score

Rotula.Score now supports flexible repeat cycles using cue markers embedded in the SVG score with a specific namespace structure.

---

## ✨ Cue Format

To define a repeat section in your score, use the following namespace pattern for your cue ID:

```
cue_repeat_s_[startId]_e_[endId]_x_[count]_r_[resumeId]_d_[direction]_a_[action]
```

### Only `s_` and `x_` are required. Others are optional.

### Parameters

| Tag | Meaning | Example | Notes |
|-----|---------|---------|-------|
| `s_` | Start cue ID to jump back to | `s_intro` | **Required** |
| `e_` | End cue ID (where to detect end of loop) | `e_theme` | Defaults to `self` (cue's own ID) |
| `x_` | Number of repeats or `inf` for infinite | `x_3` or `x_inf` | **Required** |
| `r_` | Resume cue after all repeats finish | `r_outro` | Optional (defaults to current cue) |
| `d_` | Direction (`f` for forward, `r` for reverse, `p` for pingpong) | `d_p` | Optional |
| `a_` | Action after repeat ends (`stop`) | `a_stop` | Optional |

---

## 📌 Example IDs

- `cue_repeat_s_intro_x_2` → repeat from `intro` to this cue, 2 times total.
- `cue_repeat_s_A_e_B_x_4_r_C_d_f` → repeat section A→B 4 times, then resume at C.

---

## 🎬 What You’ll See

When a repeat cue is triggered:

- The playhead will **change color** to indicate repeat mode.
- A **floating red box** with a number will appear near the playhead, showing the **current repeat count**.
- After the final repeat, the playhead:
  - Resumes at `resumeId`, or
  - Stops (if `a_stop` is set), or
  - Continues from current position.

---

## 🚪 Escaping a Repeat Early

Clicking the red repeat-count box will **immediately exit** the current repeat cycle, skipping to the end as if all repeats had been played.

Use this during live performance to shorten long loops dynamically.

---

## 🧪 Known Limitations: No Nested Repeats (Yet)

Currently, **nested or overlapping repeat sections are not supported**. If two repeats overlap or start before the previous ends, results may be unpredictable.

We plan to implement **scoped repeat stacks** in the future to allow nested logic and cleaner control.