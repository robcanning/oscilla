# Abjad Twelve-Tone Row Generation Tool
#
# Usage:
# python noteheads.py <row_length>
#     --noteheads <random|standard|serial|fixed=X|random=[...]|fixed=[...]>
#     --duration <random|serial|fixed=X|fixed=[...],random=[...]>
#     --row-mode <random|fixed>
#     [--notehead-mode ...]
#     [--duration-mode ...]
#     [--articulation-mode ...]
#     [--output rotations=pitches|rotations=percussion|rotations=both|serial]
#
# Command Line Arguments:
#
# <row_length>                : Number of notes in the twelve-tone row.
#
# --noteheads                 : Notehead style selection.
#                               - 'random'         : Randomly selects from all styles.
#                               - 'serial'         : Applies styles sequentially based on row order.
#                               - 'standard'       : Default noteheads (no alteration).
#                               - 'fixed=X'        : Uses a single style (e.g., 'fixed=cross').
#                               - 'random=[...]'   : Random selection from listed styles.
#                               - 'fixed=[...]'    : Cycles through specified styles.
#
# --duration                  : Basic note duration selection.
#                               - 'random'         : Random from allowed durations.
#                               - 'serial'         : Based on pitch modulo.
#                               - 'fixed=X'        : Same duration for all (e.g., 'fixed=4').
#                               - 'fixed=[...]'    : Cycle through values like [8,4,16].
#                               - 'random=[...]'   : Random selection from list.
#
# --duration-mode             : Advanced duration block mode (fixed, random, rotate).
#   - Supports mix of blocks using syntax like:
#       "[fixed=[8]x2, random=[(1,4),(1,16)]x3, rotate=[(1,2),(1,1)]x2]"
#
#   - Each block mode can use:
#       - Tuple durations:        (1, 8), (1, 4), etc.
#       - Numeric shortcuts:      8, 4, 16 → become (1, 8), etc.
#       - Explicit rests:         rest=(1, 4)  → a rest of 1/4 duration.
#       - Shorthand rest:         rest        → same duration as previous note, but as a rest.
#       - LilyPond rest syntax:   r4, r16     → converted to rests of corresponding durations.
#
#   ✅ Example:
#       --duration-mode "[fixed=[8]x2, random=[rest=(1,4),(1,16)]x3, rotate=[rest,1]x2]"
#       → First 2 notes: quarter notes
#         Next 3: either a 16th or a rest
#         Final 2: alternating rest and eighth
#
# --row-mode                  : Row generation method.
#                               - 'random'         : Generates a random twelve-tone row.
#                               - 'fixed'          : Uses a static test row.
#
# --articulation-mode         : Block-based articulation specification.
#     - fixed=X                → All notes get articulation X
#     - random=[a,b]           → Each note randomly receives one
#     - rotate=[a,b]           → Loops through articulations
#     - Full pattern string:
#         "[fixed=[staccato]x2,random=[accent,tenuto]x3,rotate=[fermata,accent]x2]"
#
# --output                    : Output mode
#     - rotations=pitches      : Standard staff with rotated pitch rows
#     - rotations=percussion   : Percussion staff mapping rows to fixed pitches
#     - rotations=both         : Both pitch and percussion versions
#     - serial                 : Just a prime/retrograde/inversion display
#
# TODO --beaming              : (Not yet implemented)
#     Controls how notes are grouped:
#         - 'together'         : All beamed together
#         - 'fixed=N'          : Grouped in chunks
#         - 'fixed=[...]'      : Fixed beam pattern
#         - 'ratios=...|...'   : Cycled beam ratios
#         - 'dynamic'          : Randomized patterns
#
# Example Usage:
# python noteheads.py 12 --noteheads random=[diamond,cross] \
#     --duration-mode "[fixed=[8]x2,random=[rest=(1,4),16]x3,rotate=[rest,4]x2]" \
#     --notehead-mode "[fixed=[cross]x2,random=[diamond]x5]" \
#     --row-mode random --output rotations=percussion


import abjad
import random
import logging
import time
import sys
import os
import time
import subprocess
import random
import re
import itertools
from itertools import permutations, islice

logging.basicConfig(level=logging.INFO)


def parse_articulation_sequence(arg_string, total_notes, rotation_index=0):
    import re
    import itertools

    def expand_repetitions(item_str):
        """Expands inline repetitions like 'accent x3' → ['accent', 'accent', 'accent']"""
        repeat_match = re.match(r'(.+?)x(\d+)$', item_str.strip())
        if repeat_match:
            base, count = repeat_match.groups()
            return [base.strip()] * int(count)
        else:
            return [item_str.strip()]

    articulation_plan = []
    pattern = re.compile(r'(fixed|random|rotate|none)=\[((?:[^,\[\]]+,?)+)\](?:x(\d+))?')

    # Remove outer brackets
    arg_string = arg_string.strip()
    if arg_string.startswith("[") and arg_string.endswith("]"):
        arg_string = arg_string[1:-1]

    segments = pattern.findall(arg_string)
    print(f"📦 Raw articulation-mode string: {arg_string}")
    print(f"🔍 Parsed segments: {segments}")

    if not segments:
        print("Error: Unable to parse articulation-mode string.")
        return []

    for mode, raw_list, count_str in segments:
        count = int(count_str) if count_str else None

        if mode == "none":
            articulations = ["\\none"]
        else:
            items = raw_list.split(",")
            articulations = []
            for item in items:
                expanded = expand_repetitions(item)
                articulations.extend([a.lstrip("\\") for a in expanded if a.strip()])

        if not articulations:
            continue

        if mode == "fixed":
            seq = itertools.cycle(articulations)
        elif mode == "random":
            seq = (random.choice(articulations) for _ in itertools.count())
        elif mode == "rotate":
            rotated = articulations[rotation_index % len(articulations):] + articulations[:rotation_index % len(articulations)]
            seq = itertools.cycle(rotated)
        elif mode == "none":
            seq = itertools.cycle(["\\none"])

        if count:
            full_block = list(itertools.islice(seq, count * len(articulations)))
            articulation_plan.extend(full_block)
        else:
            articulation_plan.extend(articulations)

    print(f"🧩 Block {mode}, expanded: {articulation_plan[-10:]}")

    if len(articulation_plan) < total_notes:
        return list(itertools.islice(itertools.cycle(articulation_plan), total_notes))
    else:
        return articulation_plan[:total_notes]

def parse_duration_sequence(arg_string, total_notes, rotation_index=0):
    import re
    import ast
    import random
    import itertools

    def smart_split(comma_string):
        parts = []
        current = ''
        depth = 0
        for char in comma_string:
            if char == ',' and depth == 0:
                parts.append(current.strip())
                current = ''
            else:
                if char == '(':
                    depth += 1
                elif char == ')':
                    depth -= 1
                current += char
        if current.strip():
            parts.append(current.strip())
        return parts

    def parse_duration_item(val, previous_duration):
        import re
        import ast

        repeat_match = re.match(r"(.+?)x(\d+)$", val.strip())
        if repeat_match:
            base_val, repeat_count = repeat_match.groups()
            repeat_count = int(repeat_count)
            repeated_items = []
            for _ in range(repeat_count):
                repeated_items.extend(parse_duration_item(base_val.strip(), previous_duration))
            return repeated_items

        val = val.strip()
        if val.startswith("rest="):
            val = val[len("rest="):].strip()
            if val.startswith("("):
                return [("rest", ast.literal_eval(val))]
            elif val.isdigit():
                return [("rest", (1, int(val)))]
        elif val == "rest":
            return [("rest", previous_duration)]
        elif val.startswith("("):
            return [ast.literal_eval(val)]
        elif val.isdigit():
            return [(1, int(val))]
        elif val.startswith("r") and val[1:].isdigit():
            return [("rest", (1, int(val[1:])))]
        return [(1, 4)]  # default fallback



    duration_plan = []
    pattern = re.compile(r'(fixed|random|rotate)=\[((?:[^\[\]]+?,?)+?)\](?:x(\d+))?')

    if arg_string.startswith("[") and arg_string.endswith("]"):
        arg_string = arg_string[1:-1]

    segments = pattern.findall(arg_string)
    print(f"📦 Raw duration-mode string: {arg_string}")
    print(f"🔍 Parsed segments: {segments}")

    for mode, raw_list, count_str in segments:
        count = int(count_str) if count_str else None
        raw_values = smart_split(raw_list)
        durations = []

        try:
            # Then inside the for-loop over `raw_values`:
            for val in raw_values:
                prev = durations[-1][1] if durations and isinstance(durations[-1], tuple) and durations[-1][0] == "rest" else durations[-1] if durations else (1, 4)
                expanded = parse_duration_item(val, prev)
                durations.extend(expanded)

        except Exception as e:
            print(f"⚠️ Error parsing duration list: {raw_list} — {e}")
            durations = [(1, 4)]

        start_index = len(duration_plan)

        if mode == "fixed":
            seq = itertools.cycle(durations)
            duration_plan.extend(itertools.islice(seq, count or len(durations)))

        elif mode == "random":
            count = count or total_notes
            random_choices = [random.choice(durations) for _ in range(count)]
            duration_plan.extend(random_choices)
            print(f"🎲 Random choices from {durations}: {random_choices}")

        elif mode == "rotate":
            offset = rotation_index % len(durations)
            rotated = durations[offset:] + durations[:offset]
            seq = itertools.cycle(rotated)
            duration_plan.extend(itertools.islice(seq, count or len(durations)))
            print(f"🔄 Rotation index: {rotation_index}, Rotated: {rotated}")

        print(f"📤 Mode: {mode}, Durations: {durations}, Count: {count}")
        print(f"📦 Added items {start_index}–{len(duration_plan)-1}: {duration_plan[start_index:]}")

    print(f"✅ Final duration plan ({len(duration_plan)} items): {duration_plan}")

    if len(duration_plan) < total_notes:
        return list(itertools.islice(itertools.cycle(duration_plan), total_notes))
    else:
        return duration_plan[:total_notes]


def parse_notehead_sequence(arg_string, total_notes, rotation_index=0):
    import re
    import itertools
    import random

    def expand_notehead_repetitions(item_str):
        repeat_match = re.match(r'(.+?)x(\d+)$', item_str.strip())
        if repeat_match:
            base, count = repeat_match.groups()
            return [base.strip()] * int(count)
        else:
            return [item_str.strip()]

    notehead_plan = []
    pattern = re.compile(r'(fixed|random|rotate)=\[((?:[^,\[\]]+,?)+)\](?:x(\d+))?')

    arg_string = arg_string.strip()
    if arg_string.startswith("[") and arg_string.endswith("]"):
        arg_string = arg_string[1:-1]

    segments = pattern.findall(arg_string)
    print(f"📦 Raw notehead-mode string: {arg_string}")
    print(f"🔍 Parsed notehead segments: {segments}")

    for mode, raw_list, count_str in segments:
        count = int(count_str) if count_str else None

        # Expand inline repetitions like 'diamond x3'
        raw_items = raw_list.split(',')
        noteheads = []
        for item in raw_items:
            expanded = expand_notehead_repetitions(item)
            noteheads.extend([n for n in expanded if n in notehead_shapes])

        if not noteheads:
            continue

        if mode == "fixed":
            seq = itertools.cycle(noteheads)
        elif mode == "random":
            count = count or total_notes
            random_choices = [random.choice(noteheads) for _ in range(count)]
            notehead_plan.extend(random_choices)
            print(f"🎲 Random notehead choices from {noteheads}: {random_choices}")
            continue
        elif mode == "rotate":
            offset = rotation_index % len(noteheads)
            rotated = noteheads[offset:] + noteheads[:offset]
            seq = itertools.cycle(rotated)
        else:
            continue

        if count:
            full_block = list(itertools.islice(seq, count * len(noteheads)))
            notehead_plan.extend(full_block)
        else:
            notehead_plan.extend(noteheads)

    if len(notehead_plan) < total_notes:
        return list(itertools.islice(itertools.cycle(notehead_plan), total_notes))
    else:
        return notehead_plan[:total_notes]


all_articulations = [
    'staccato',
]

notehead_shapes = ['default', 'cross', 'triangle', 'diamond', 'slash',  'xcircle', 'harmonic', 'harmonic-black']

allowed_durations = [
    (1, 16),   # 16 Note
    (1, 8),   # Eighth Note
    (3, 16),   # Eighth Note
    (1, 4),   # Quarter Note
    (3, 8),   # Dotted Quarter Note
    (1, 2),   # Half Note
    (3, 4),   # Dotted Half Note
    (1, 1),   # Whole Note
    (3, 2),   # Dotted Whole Note

]

import random
import logging

def generate_row(row_length, max_retries=5):
    allowed_intervals = {1, 2, 3, 6, 9, 10, 11}
    pitch_limit_base = 1  # each pitch starts allowed only once
    total_pitch_classes = 12

    for retry in range(max_retries):
        row = []
        previous_intervals = []
        pitch_counts = {i: 0 for i in range(12)}
        attempts = 0
        max_attempts = 10000
        max_occurrences = pitch_limit_base

        logging.info(f"Attempt {retry+1}: Starting row generation")

        while len(row) < row_length:
            attempts += 1
            if attempts > max_attempts:
                logging.warning("Max attempts reached. Restarting row generation...")
                break

            # Calculate the current repetition limit (increases every 12 notes)
            cycle = len(row) // 12
            max_occurrences = pitch_limit_base + cycle

            # Select pitches that have not yet hit their allowed maximum
            eligible_pitches = [p for p, count in pitch_counts.items() if count < max_occurrences]

            # Special case: permanently limit the 12th unique pitch (only one occurrence allowed)
            if len(row) >= 12:
                unique_first_12 = list(dict.fromkeys(row[:12]))  # preserve order
                if len(unique_first_12) == 12:
                    final_unique = unique_first_12[-1]
                    if final_unique in eligible_pitches and pitch_counts[final_unique] >= 1:
                        eligible_pitches.remove(final_unique)

            if not eligible_pitches:
                logging.warning("No eligible pitches found under constraints. Restarting...")
                break

            next_pitch = random.choice(eligible_pitches)

            if row:
                interval = (next_pitch - row[-1]) % 12
                inverse_interval = (row[-1] - next_pitch) % 12

                if previous_intervals and previous_intervals[-1] in (interval, inverse_interval):
                    continue

                if interval not in allowed_intervals and inverse_interval not in allowed_intervals:
                    continue

                previous_intervals.append(interval)

            row.append(next_pitch)
            pitch_counts[next_pitch] += 1
            logging.info(f"Added pitch {next_pitch} (Count: {pitch_counts[next_pitch]})")

        if len(row) == row_length:
            return row

    logging.error("Failed to generate a valid row after maximum retries.")
    return None



def pitch_class_to_note_name(pitch_class):
    pitch_names = ['c', 'db', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b']
    return pitch_names[pitch_class] + "'"


def invert_row(row):
    first_pitch = row[0]
    return [(first_pitch - (pitch - first_pitch)) % 12 for pitch in row]


def retrograde_inversion(row):
    return list(reversed(invert_row(row)))


def rotate_row(row, n):
    return row[n:] + row[:n]


def transpose_row_to_start(row, pitch_class):
    transposition = (pitch_class - row[0]) % 12
    return [(p + transposition) % 12 for p in row]


def create_abjad_notes(
    row,
    articulations,
    notehead_mode,
    duration_mode,
    duration_set,
    duration_mode_string=None,
    notehead_mode_string=None,
    rotation_index=0,
    original_row=None,
    clef='treble',
    pitch_mapping=None,
    attach_markup=True,
    as_staff=False
):

    notes = []
    row_source = original_row if original_row is not None else row
    notehead_index = 0
    allowed_noteheads = notehead_shapes
    previous_duration = (1, 4)

    if notehead_mode.startswith('random=['):
        allowed_noteheads = notehead_mode.split('=')[1].strip('[]').split(',')
    elif notehead_mode.startswith('fixed=['):
        allowed_noteheads = notehead_mode.split('=')[1].strip('[]').split(',')

    parsed_noteheads = []
    if notehead_mode_string:
        parsed_noteheads = parse_notehead_sequence(notehead_mode_string, len(row), rotation_index=rotation_index)

    for i, pitch in enumerate(row):
        # Get duration entry
        entry = duration_set[i % len(duration_set)] if duration_set else (1, 4)

        is_rest = False
        duration = None

        # Explicit form: ('rest', (1, 4))
        if isinstance(entry, tuple) and len(entry) == 2 and entry[0] == 'rest':
            duration = entry[1]
            is_rest = True

        # LilyPond style: 'r4'
        elif isinstance(entry, str) and entry.startswith('r'):
            denom = int(entry[1:])
            duration = (1, denom)
            is_rest = True

        # Shorthand 'rest' means rest of previous duration
        elif entry == "rest":
            duration = previous_duration
            is_rest = True

        # Normal duration tuple or abbreviation
        else:
            duration = entry

        abjad_duration = abjad.Duration(duration)
        previous_duration = duration

        if is_rest:
            note = abjad.Rest(abjad_duration)
        else:
            note_name = pitch_mapping.get(pitch % 12, 'c') if pitch_mapping else pitch_class_to_note_name(pitch)
            note = abjad.Note(note_name, abjad_duration)

            # Notehead
            if parsed_noteheads:
                chosen_shape = parsed_noteheads[i % len(parsed_noteheads)]
            elif notehead_mode.startswith('random=['):
                chosen_shape = random.choice(allowed_noteheads)
            elif notehead_mode == 'random':
                chosen_shape = random.choice(notehead_shapes)
            elif notehead_mode == 'serial':
                if original_row and pitch in original_row:
                    original_index = original_row.index(pitch)
                    chosen_shape = notehead_shapes[original_index % len(notehead_shapes)]
                else:
                    chosen_shape = notehead_shapes[i % len(notehead_shapes)]
            elif notehead_mode.startswith('fixed=['):
                chosen_shape = allowed_noteheads[notehead_index % len(allowed_noteheads)]
                notehead_index += 1
            elif notehead_mode.startswith('fixed='):
                chosen_shape = notehead_mode.split('=')[1]
            else:
                chosen_shape = 'default'

            if chosen_shape != 'default':
                style_command = abjad.LilyPondLiteral(f"\\once \\override NoteHead.style = #' {chosen_shape}")
                abjad.attach(style_command, note)

            if attach_markup:
                abjad.attach(abjad.Markup(f'{pitch}'), note)
                print();
        if articulations and i < len(articulations) and not is_rest:
            articulation = articulations[i]
            if articulation not in ("none", "\\none"):
                abjad.attach(abjad.Articulation(articulation), note)

        notes.append(note)

    if as_staff:
        staff = abjad.Staff(notes)
        if clef:
            abjad.attach(abjad.Clef(clef), staff[0])
        return staff
    else:
        return notes




def add_rotation_staves(
    score,
    row,
    articulation_mode_string,
    duration_mode_string,
    notehead_mode,
    notehead_mode_string,  # <-- this is the new required parameter
    duration_mode,
    durations_for_rotation,
    row_length,
    clef='treble',
    pitch_mapping=None,
    fixed_duration=(1, 4),
):
    truncated_row = row[:row_length]

    for i in range(row_length):
        rotation = rotate_row(truncated_row, i)

        transposed = transpose_row_to_start(rotation, truncated_row[0])

        # ⬇️ NEW: regenerate articulations per-rotation
        articulations_for_rotation = parse_articulation_sequence(
                articulation_mode_string, row_length, rotation_index=i
        ) if articulation_mode_string else []

        durations_for_rotation = parse_duration_sequence(
            duration_mode_string, row_length, rotation_index=i
        ) if duration_mode_string else None


        staff = create_abjad_notes(
            transposed,
            articulations_for_rotation,
            notehead_mode,
            duration_mode,
            durations_for_rotation,
            duration_mode_string=duration_mode_string,
            notehead_mode_string=notehead_mode_string,
            original_row=row,
            clef=clef,
            pitch_mapping=pitch_mapping,
            as_staff=True
        )

        apply_time_signature(staff, row_length, fixed_duration[1])
        apply_dynamic_beaming(staff, row_length, max_groups=5)
        apply_overrides(staff)

        score.append(staff)




def apply_dynamic_beaming(staff, row_length, min_groups=3, max_groups=3):
    """
    Apply dynamic beaming to a given staff using unique groupings.
    Each grouping is different for each staff or rotation.

    Args:
        staff (abjad.Staff): The staff to apply beaming to.
        row_length (int): The number of notes in the row.
        min_groups (int): Minimum number of groups required (default is 3).
        max_groups (int): Maximum number of groups allowed (default is 3).
    """
    # Generate all valid groupings for the row length
    valid_groupings = set()

    for group_count in range(min_groups, max_groups + 1):  # Allow groupings with at least 'min_groups'
        for split_points in permutations(range(1, row_length), group_count - 1):
            group_sizes = [split_points[0]] + [split_points[i] - split_points[i - 1] for i in range(1, len(split_points))] + [row_length - split_points[-1]]

            # Check all group sizes are valid (minimum of 2 notes per group)
            if all(size >= 2 for size in group_sizes):
                valid_groupings.add(tuple(group_sizes))

    # Convert to a sorted list for deterministic results if needed
    valid_groupings = list(valid_groupings)
    random.shuffle(valid_groupings)  # Shuffle to ensure variety

    # Pick a unique grouping for this staff
    if valid_groupings:
        selected_grouping = valid_groupings.pop(0)
    else:
        selected_grouping = (row_length,)  # Fallback if nothing valid is found

    # Apply the beaming based on the selected grouping
    current_index = 0
    for group_size in selected_grouping:
        abjad.beam(staff[current_index:current_index + group_size])
        current_index += group_size



def apply_overrides(staff):
    print("overrides applied")
    abjad.override(staff).BarLine.stencil = False
    #abjad.override(staff).Stem.stencil = False
    #abjad.override(staff).Beam.stencil = False
    #abjad.override(staff).Clef.stencil = False
    #abjad.override(staff).Flag.stencil = False
    abjad.override(staff).TimeSignature.stencil = False
    #abjad.setting(staff).staff_size = 25  # Adjusts the size of the entire staff
    #abjad.attach(abjad.TimeSignature((12, 8)), staff[0])

        # Explicitly tell Abjad to beam specific groups of notes
    # Grouping the notes in the desired pattern of 5 + 3 + 4
    #abjad.beam(staff[:12])  # Beam the first 5 notes together
    #abjad.beam(staff[5:8])  # Beam the next 3 notes together
    #abjad.beam(staff[8:12])  # Beam the last 4 notes together

def apply_time_signature(staff, row_length, fixed_duration):
    """
    Dynamically sets the time signature based on the row length and fixed duration.
    The time signature is calculated as (row_length / fixed_duration).
    """
    time_signature = (row_length, fixed_duration)

    # Attach the time signature to the first note in the staff
    abjad.attach(abjad.TimeSignature(time_signature), staff[0])







def add_serial_staves(score, row, articulations, notehead_mode, duration_mode, duration_set):
    prime_staff = create_abjad_notes(row, articulations, notehead_mode, duration_mode, duration_set, as_staff=True)
    inversion_staff = create_abjad_notes(invert_row(row), articulations, notehead_mode, duration_mode, duration_set, as_staff=True)
    retrograde_inversion_staff = create_abjad_notes(retrograde_inversion(row), articulations, notehead_mode, duration_mode, duration_set, as_staff=True)

    for staff in [prime_staff, inversion_staff, retrograde_inversion_staff]:
        apply_dynamic_beaming(staff, len(staff), max_groups=5)
        apply_overrides(staff)
        score.append(staff)


def add_triad_staff(score, row, notehead_mode, duration_mode, duration_set):
    row_length = len(row)
    triad_notes = []
    prime_tetrachords = [row[i:i + 4] for i in range(0, row_length, 3)]
    inversion_row = invert_row(row)
    inversion_tetrachords = [inversion_row[i:i + 4] for i in range(0, row_length, 3)]

    for tetrachord in prime_tetrachords + inversion_tetrachords:
        chord_pitches = [abjad.NamedPitch(pitch_class_to_note_name(p)) for p in tetrachord]
        duration = duration_set[0] if duration_mode == 'fixed' and duration_set else (1, 4)
        chord = abjad.Chord(chord_pitches, duration)

        if notehead_mode.startswith('fixed='):
            fixed_shape = notehead_mode.split('=')[1]
            if fixed_shape in notehead_shapes:
                style_command = abjad.LilyPondLiteral(f"\\once \\override NoteHead.style = #' {fixed_shape}")
                abjad.attach(style_command, chord)

        triad_notes.append(chord)

    triad_staff = abjad.Staff(triad_notes)
    apply_dynamic_beaming(triad_staff, len(triad_notes), max_groups=5)
    apply_overrides(triad_staff)
    score.append(triad_staff)






# import itertools
#
# def add_rotation_staves_with_analysis(score, row, articulations, notehead_mode, duration_mode, duration_set, row_length):
#     """Adds rotation staves to the score and performs analysis on rotations."""
#
#     rotation_staves = []
#     rotations_data = {}  # To store rotation data for analysis
#
#     # Slice the row according to the desired row length
#     truncated_row = row[:row_length]
#
#     for i in range(row_length):  # Generate rotations equal to the truncated row length
#         # Generate the rotated row and transpose it to start on the same pitch class as the original row
#         rotation = rotate_row(truncated_row, i)
#         transposed_row = transpose_row_to_start(rotation, truncated_row[0])
#
#         # Store pitch class content of each rotation for analysis
#         rotations_data[f'Rotation {i}'] = {
#             'pitch_classes': set(transposed_row),
#             'intervals': get_interval_vector(transposed_row)
#         }
#
#         # Generate the Abjad notes for this rotation
#         # Maps notehead shapes based on the index of each pitch in the original_row (row).
#         # If original_row is not provided, notehead shapes are applied based on the index
#         # within the current row, resulting in a repeated sequence for each rotation.
#         rotation_notes = create_abjad_notes(transposed_row, articulations, notehead_mode, duration_mode, duration_set, original_row=row)
#         rotation_staff = abjad.Staff(rotation_notes)
#
#         # Apply visual overrides and add the staff to the score
#         apply_dynamic_beaming(rotation_staff, row_length)
#         apply_overrides(rotation_staff)
#
#         rotation_staves.append(rotation_staff)
#
#     # Add rotation staves to the score
#     score.extend(rotation_staves)
#
#     # Perform and save the analysis
#     analyze_and_save_rotations(rotations_data)



def get_interval_vector(row):
    """Calculate the interval set of a row, treating it as a continuous loop."""
    intervals = set()
    row_length = len(row)

    for i in range(row_length):
        next_index = (i + 1) % row_length  # Ensuring a loop back to the start
        interval = (row[next_index] - row[i]) % 12  # Modulo 12 for interval calculation
        intervals.add(interval)

    return intervals


def analyze_and_save_rotations(rotations_data):
    """Analyzes rotations by comparing each with the Prime Row (Rotation 0) and saves the results to a .data file."""
    similarity_data = []

    # Extract the Prime Row (Rotation 0) data
    prime_row_data = rotations_data['Rotation 0']
    prime_intervals_set = prime_row_data['intervals']  # Now a set

    for rotation_name, rotation_data in rotations_data.items():
        if rotation_name == 'Rotation 0':
            continue  # Skip comparing the Prime Row with itself

        # Compare pitch classes
        pitch_overlap = len(prime_row_data['pitch_classes'].intersection(rotation_data['pitch_classes']))

        # Compare interval sets using Jaccard index
        rotation_intervals_set = rotation_data['intervals']
        intersection_size = len(prime_intervals_set & rotation_intervals_set)
        union_size = len(prime_intervals_set | rotation_intervals_set)

        interval_similarity = intersection_size / union_size if union_size > 0 else 0

        # Store the comparison results
        similarity_data.append({
            'Rotation': rotation_name,
            'Pitch Class Overlap': pitch_overlap,
            'Interval Set Similarity': interval_similarity
        })

    # Print the results to console
    for row in similarity_data:
        print(f"Rotation 0 vs {row['Rotation']} - "
              f"Pitch Overlap: {row['Pitch Class Overlap']}, "
              f"Interval Set Similarity: {row['Interval Set Similarity']:.2f}")

    # Write results to a .data file
    with open("rotation_analysis.data", "w") as file:
        file.write("Rotation, Pitch Class Overlap, Interval Set Similarity\n")
        for row in similarity_data:
            file.write(f"{row['Rotation']}, {row['Pitch Class Overlap']}, {row['Interval Set Similarity']:.2f}\n")



def compare_interval_vectors(vector1, vector2):
    """Compares two interval vectors using a simple similarity metric."""
    # Calculate similarity as the proportion of matching intervals (normalized)
    matches = sum(1 for i, j in zip(vector1, vector2) if i == j)
    similarity = matches / max(len(vector1), len(vector2))
    return similarity



def generate_filename(row_length, notehead_mode, duration_mode, row_mode, output_dir="o"):
    """Generate a shorter, human-readable filename and save files in a specific directory."""

    # Ensure the output directory exists
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Map modes to single-letter codes
    mode_map = {'random': 'R', 'serial': 'S', 'fixed': 'F'}

    # Get the abbreviations for each mode
    notehead_abbr = mode_map.get(notehead_mode, notehead_mode[0].upper())
    duration_abbr = mode_map.get(duration_mode, duration_mode[0].upper())
    rowmode_abbr = mode_map.get(row_mode, row_mode[0].upper())

    # Generate the filename
    date_str = time.strftime('%Y%m%d')
    filename = f"{date_str}_l{row_length}_nh-{notehead_abbr}_d-{duration_abbr}_rm-{rowmode_abbr}"

    # Return the full path of the file within the output directory
    return os.path.join(output_dir, filename)

def main():
    if len(sys.argv) < 6:
        print("Usage: python noteheads.py <row_length> --noteheads <random|standard|serial|fixed=X|random=[...]|fixed=[...] > "
              "--duration <random|serial|fixed=X|fixed=[...]|random=[...]> --row-mode <random|fixed> "
              "--output <rotations=percussion|rotations=pitches|rotations=both|serial>")
        sys.exit(1)

    row_length = int(sys.argv[1])
    notehead_mode = sys.argv[3]
    duration_mode = sys.argv[5]

    # Default row_mode
    row_mode = None
    for i, arg in enumerate(sys.argv):
        if arg == "--row-mode" and i + 1 < len(sys.argv):
            row_mode = sys.argv[i + 1]

    if row_mode not in ['random', 'fixed']:
        print("Invalid row mode. Use 'random' or 'fixed'.")
        sys.exit(1)

    articulation_mode_string = None
    duration_mode_string = None
    notehead_mode_string = None

    for i, arg in enumerate(sys.argv):
        if arg == "--articulation-mode" and i + 1 < len(sys.argv):
            articulation_mode_string = sys.argv[i + 1]
        elif arg == "--duration-mode" and i + 1 < len(sys.argv):
            duration_mode_string = sys.argv[i + 1]
        elif arg == "--notehead-mode" and i + 1 < len(sys.argv):
            notehead_mode_string = sys.argv[i + 1]

    print(f"🎯 Using articulation mode string: {articulation_mode_string}")
    print(f"⏱️ Using duration mode string: {duration_mode_string}")
    print(f"🎯 Using notehead mode string: {notehead_mode_string}")

    durations_for_rotation = None
    if duration_mode_string:
        durations_for_rotation = parse_duration_sequence(duration_mode_string, row_length)

    rotation_output_mode = None
    for i, arg in enumerate(sys.argv):
        if arg == "--output" and i + 1 < len(sys.argv):
            next_arg = sys.argv[i + 1]
            if next_arg.startswith("rotations="):
                rotation_value = next_arg.split("rotations=")[1]
                if rotation_value in ['percussion', 'pitches', 'both']:
                    rotation_output_mode = rotation_value
            elif next_arg == "serial":
                rotation_output_mode = 'serial'

    if rotation_output_mode is None:
        rotation_output_mode = 'pitches'

    if notehead_mode.startswith('random='):
        notehead_list = notehead_mode.split('=')[1].strip('[]').split(',')
        notehead_list = [n.strip() for n in notehead_list if n.strip() in notehead_shapes]
        if not notehead_list:
            print("Invalid notehead list specified. Using all available noteheads.")
            notehead_list = notehead_shapes
        notehead_mode = f"random=[{','.join(notehead_list)}]"

    elif notehead_mode.startswith('fixed=['):
        notehead_list = notehead_mode.split('=')[1].strip('[]').split(',')
        notehead_list = [n.strip() for n in notehead_list if n.strip() in notehead_shapes]
        if not notehead_list:
            print("Invalid fixed notehead list specified. Using default noteheads.")
            notehead_list = notehead_shapes
        notehead_mode = f"fixed=[{','.join(notehead_list)}]"
#[4, 3, 7, 5, 11, 0, 9, 6, 10, 8, 1, 2]
    row = generate_row(row_length) if row_mode == 'random' else [4,5,6,1,0,8,9,6]

    if row is None:
        logging.error("Row generation failed. Exiting...")
        return

    score = abjad.Score([])

    if rotation_output_mode == 'serial':
        add_serial_staves(score, row, articulations, notehead_mode, duration_mode, duration_set)
        add_triad_staff(score, row, notehead_mode, duration_mode, duration_set)

    if rotation_output_mode in ['pitches', 'both']:
        add_rotation_staves(
            score,
            row,
            articulation_mode_string,
            duration_mode_string,
            notehead_mode,
            notehead_mode_string,
            duration_mode,
            durations_for_rotation,
            row_length
        )

    if rotation_output_mode in ['percussion', 'both']:
        percussion_note_map = {
            0:  "g",    # bass drum
            1:  "d'",    # snare drum
            2:  "f'",    # high tom
            3:  "e'",    # mid tom
            4:  "b",    # floor tom
            5:  "f'",    # high tom (repeat)
            6:  "e'",    # mid tom (repeat)
            7:  "b",    # floor tom (repeat)
            8:  "g'",   # ride cymbal
            9:  "b'",   # crash cymbal
            10: "f'",    # high tom (repeat)
            11: "e'"     # mid tom (repeat)
        }


        add_rotation_staves(
            score,
            row,
            articulation_mode_string,
            duration_mode_string,
            notehead_mode,
            notehead_mode_string,
            duration_mode,
            durations_for_rotation,
            row_length,
            clef='percussion',
            pitch_mapping=percussion_note_map,
            fixed_duration=(1, 8),
        )

    filename = generate_filename(row_length, notehead_mode, duration_mode, row_mode)
    abjad.persist.as_ly(score, f'{filename}.ly')
    abjad.persist.as_pdf(score, f'{filename}.pdf')
    abjad.show(score)


if __name__ == "__main__":
    main()
