# Abjad Twelve-Tone Row Generation Example with Interval Restrictions, Allowed Repetition, and Logging

import abjad
import random
import logging
import time
import sys

logging.basicConfig(level=logging.INFO)

all_articulations = [
    'staccato',
    #'tenuto', 'accent', 'marcato', 'portato',
    #'staccatissimo', 'espressivo', 'trill', 'glissando', 'turn'
]

notehead_shapes = ['cross', 'triangle', 'diamond', 'slash', 'rectangle', 'circle', 'xcircle', 'harmonic', 'harmonic-black']


def generate_row(row_length, max_retries=5):
    """
    Generate a random row of a specified length (0-11 pitch classes) with interval restrictions and allowing repetition.
    """
    allowed_intervals = {1, 2, 3, 6, 9, 10, 11}  # Allowed intervals and their inversions
    forbidden_intervals = {4, 5, 7, 8}  # Forbidden intervals and their inversions

    for retry in range(max_retries):
        row = [random.randint(0, 11)]  # Start with a random pitch
        previous_intervals = []  # Track previously used intervals in sequence
        attempts = 0
        max_attempts = 10000  # Limit the number of attempts to prevent infinite loops

        logging.info(f"Attempt {retry+1}: Starting row generation with initial pitch: {row[0]}")

        while len(row) < row_length:
            attempts += 1
            if attempts > max_attempts:
                logging.warning("Max attempts reached. Restarting row generation...")
                break  # Exit this attempt and try again

            next_pitch = random.randint(0, 11)

            if attempts % 1000 == 0:  # Log progress every 1000 attempts
                logging.info(f"Attempts: {attempts}, Current Row: {row}")

            if next_pitch not in row:  # Ensure no duplicates
                interval = (next_pitch - row[-1]) % 12
                inverse_interval = (row[-1] - next_pitch) % 12

                if len(previous_intervals) > 0 and previous_intervals[-1] in (interval, inverse_interval):
                    continue  # Prevent direct repetition of the same interval

                if interval in allowed_intervals or inverse_interval in allowed_intervals:
                    row.append(next_pitch)
                    previous_intervals.append(interval)
                    logging.info(f"Added pitch {next_pitch} (Interval: {interval})")
                elif (interval not in forbidden_intervals) and (inverse_interval not in forbidden_intervals):
                    # If interval is not forbidden, allow it with a 50% chance
                    if random.random() > 0.5:
                        row.append(next_pitch)
                        previous_intervals.append(interval)
                        logging.info(f"Added pitch {next_pitch} (Interval: {interval}) by random allowance.")

        if len(row) == row_length:  # Successfully generated a row
            return row

    logging.error("Failed to generate a valid row after maximum retries.")
    return None  # Return None if all retries fail


def pitch_class_to_note_name(pitch_class):
    """
    Convert a pitch class (0-11) to a note name string with a mix of sharps and flats.
    """
    pitch_names = ['c', 'db', 'd', 'eb', 'e', 'f', 'f#', 'g', 'ab', 'a', 'bb', 'b']
    return pitch_names[pitch_class] + "'"


def create_abjad_notes(row, articulations):
    """
    Convert a row of integers to Abjad notes with serially applied articulations.
    """
    notes = []
    for i, pitch in enumerate(row):
        note = abjad.Note(pitch_class_to_note_name(pitch), (1, 4))

        # Attach articulation serially
        articulation = articulations[i % len(articulations)]
        #abjad.attach(abjad.Articulation(articulation), note)

        # Attach the pitch class number above each note
        abjad.attach(abjad.Markup(f'{pitch}'), note)

        # Attach the text 'x' randomly to notes instead of tremolo
        #if random.random() < 0.3:  # 30% chance of adding 'x'
            #abjad.attach(abjad.Markup('x'), note)

        # Randomize notehead shapes using abjad.override()
        chosen_shape = random.choice(notehead_shapes)
        if chosen_shape != 'default':
            style_command = abjad.LilyPondLiteral(f"\\once \\override NoteHead.style = #' {chosen_shape}")
            #abjad.attach(style_command, note)
            #abjad.override(note).Stem.transparent = True

        notes.append(note)

    return notes

def invert_row(row):
    """
    Invert a given row.
    """
    first_pitch = row[0]
    inverted_row = [(first_pitch - (pitch - first_pitch)) % 12 for pitch in row]
    return inverted_row


def retrograde_inversion(row):
    """
    Generate the retrograde inversion of a row.
    """
    inverted_row = invert_row(row)
    return list(reversed(inverted_row))


def main():
    if len(sys.argv) != 2:
        print("Usage: python gen.py <row_length>")
        sys.exit(1)

    try:
        row_length = int(sys.argv[1])
        if not 1 <= row_length <= 12:
            raise ValueError
    except ValueError:
        print("Error: Row length must be an integer between 1 and 12.")
        sys.exit(1)

    start_time = time.time()

    # Generate a twelve-tone row with interval restrictions
    row = generate_row(row_length)

    if row is None:
        logging.error("Row generation failed. Exiting...")
        return

    logging.info(f"Generated row: {row}")
    logging.info(f"Generation time: {time.time() - start_time} seconds")

    # Select serial articulations
    #articulations = all_articulations[:row_length]
    articulations = all_articulations[:row_length]

    # Create original row notes
    #notes = create_abjad_notes(row, articulations)
    notes = create_abjad_notes(row, articulations)

    staff = abjad.Staff(notes)
    abjad.override(staff).BarLine.stencil = False
    abjad.override(staff).Stem.stencil = False
    abjad.override(staff).Clef.stencil = False
    abjad.override(staff).TimeSignature.stencil = False

    # Generate inversion and retrograde inversion
    inversion = invert_row(row)
    retrograde_inversion_row = retrograde_inversion(row)

    # Create notes for inversion
    inversion_notes = create_abjad_notes(inversion, articulations)
    inversion_staff = abjad.Staff(inversion_notes)
    abjad.override(inversion_staff).BarLine.stencil = False
    abjad.override(inversion_staff).Stem.stencil = False
    abjad.override(inversion_staff).Clef.stencil = False
    abjad.override(inversion_staff).TimeSignature.stencil = False

    # Create notes for retrograde inversion
    retrograde_inversion_notes = create_abjad_notes(retrograde_inversion_row, articulations)
    retrograde_inversion_staff = abjad.Staff(retrograde_inversion_notes)
    abjad.override(retrograde_inversion_staff).BarLine.stencil = False
    abjad.override(retrograde_inversion_staff).Stem.stencil = False
    abjad.override(retrograde_inversion_staff).Clef.stencil = False
    abjad.override(retrograde_inversion_staff).TimeSignature.stencil = False

    # Combine all staves into a score
    score = abjad.Score([staff, inversion_staff, retrograde_inversion_staff])

    # Render the score to a PDF file
    abjad.show(score)

if __name__ == "__main__":
    main()
