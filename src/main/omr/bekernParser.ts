/**
 * Humdrum **kern notation parser.
 * Converts bekern (Humdrum **kern) text output from SMT++ into ScoreData.
 *
 * **kern encoding reference:
 * - Pitch: C D E F G A B (octave 4), c d e f g a b (octave 5), CC (octave 3), etc.
 * - Duration: 1=whole, 2=half, 4=quarter, 8=eighth, 16=16th, 32=32nd
 * - Dot: append '.'
 * - Sharp: '#', Flat: '-', Double sharp: '##', Double flat: '--'
 * - Rest: 'r' after duration number
 * - Chord: notes separated by space within a token
 * - Barline: '=' at start of line
 * - Interpretation: '*' at start (clef, key, time, etc.)
 */

import type { ScoreData, Part, Measure, Lyric } from '../../shared/types/measure';
import type { MeasureElement, NoteElement, RestElement, Pitch, Duration, PitchStep, NoteType } from '../../shared/types/elements';
import type { MeasureAttributes, KeySignature, TimeSignature, Clef } from '../../shared/types/attributes';

let idCounter = 0;
function nextId(): string {
  return `bekern-${++idCounter}`;
}

/** Reset ID counter (for testing) */
export function resetIdCounter(): void {
  idCounter = 0;
}

/** Map kern duration number to NoteType */
function kernDurationToNoteType(dur: number): NoteType {
  const map: Record<number, NoteType> = {
    1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth',
    16: '16th', 32: '32nd', 64: '64th', 128: '128th',
  };
  return map[dur] ?? 'quarter';
}

/** Map kern duration to divisions (quarter note = base) */
function kernDurationToDivisions(dur: number, dots: number, baseDivisions: number): number {
  // dur=1 → 4 quarters, dur=2 → 2 quarters, dur=4 → 1 quarter, dur=8 → 0.5 quarter
  let divs = (4 / dur) * baseDivisions;
  // Apply dots: each dot adds half of previous value
  let dotValue = divs / 2;
  for (let i = 0; i < dots; i++) {
    divs += dotValue;
    dotValue /= 2;
  }
  return Math.round(divs);
}

/**
 * Parse pitch from kern note token.
 * Lowercase = octave 4+, uppercase = octave 3 and below.
 * Repeated letters shift octave: cc = octave 6, CC = octave 2
 */
function parseKernPitch(token: string): Pitch | null {
  // Extract pitch letter (first sequence of same letter)
  const pitchMatch = token.match(/([a-gA-G])\1*/);
  if (!pitchMatch) return null;

  const letters = pitchMatch[0];
  const letter = letters[0];
  const isLower = letter === letter.toLowerCase();
  const step = letter.toUpperCase() as PitchStep;

  let octave: number;
  if (isLower) {
    // c=4, cc=5, ccc=6, ...
    octave = 3 + letters.length;
  } else {
    // C=3, CC=2, CCC=1, ...
    octave = 4 - letters.length;
  }

  // Parse accidentals: # = sharp, - = flat (in kern context, not minus)
  let alter: number | undefined;
  const afterPitch = token.slice(pitchMatch.index! + pitchMatch[0].length);
  const sharps = (afterPitch.match(/#/g) ?? []).length;
  const flats = (afterPitch.match(/-/g) ?? []).length;
  if (sharps > 0) alter = sharps;
  else if (flats > 0) alter = -flats;

  return { step, octave, alter };
}

/**
 * Parse a single kern note/rest token.
 */
function parseKernToken(
  token: string,
  baseDivisions: number,
  voice: number,
  staff: number,
): MeasureElement | null {
  token = token.trim();
  if (!token || token.startsWith('*') || token.startsWith('=') || token.startsWith('!')) {
    return null;
  }

  // Extract duration number
  const durMatch = token.match(/(\d+)/);
  if (!durMatch) return null;
  const durNum = parseInt(durMatch[1], 10);

  // Count dots
  const dots = (token.match(/\./g) ?? []).length;

  const duration: Duration = {
    divisions: kernDurationToDivisions(durNum, dots, baseDivisions),
    noteType: kernDurationToNoteType(durNum),
    dots,
  };

  // Check if rest
  if (token.includes('r')) {
    const rest: RestElement = {
      type: 'rest',
      id: nextId(),
      duration,
      voice,
      staff,
    };
    return rest;
  }

  // Parse pitch
  const pitch = parseKernPitch(token);
  if (!pitch) return null;

  const note: NoteElement = {
    type: 'note',
    id: nextId(),
    pitch,
    duration,
    voice,
    staff,
  };

  return note;
}

/**
 * Parse interpretation token (starts with *)
 */
function parseInterpretation(token: string): Partial<MeasureAttributes> | null {
  // Clef: *clefG2, *clefF4, *clefC3
  const clefMatch = token.match(/\*clef([GFC])(\d)/);
  if (clefMatch) {
    const clef: Clef = {
      sign: clefMatch[1] as 'G' | 'F' | 'C',
      line: parseInt(clefMatch[2], 10),
      staffNumber: 1,
    };
    return { clef: [clef] };
  }

  // Key signature: *k[f#c#g#] or *k[b-e-a-]
  const keyMatch = token.match(/\*k\[([^\]]*)\]/);
  if (keyMatch) {
    const accidentals = keyMatch[1];
    const sharps = (accidentals.match(/#/g) ?? []).length;
    const flats = (accidentals.match(/-/g) ?? []).length;
    const fifths = sharps > 0 ? sharps : -flats;
    const keySig: KeySignature = { fifths, mode: 'major' };
    return { keySignature: keySig };
  }

  // Time signature: *M4/4, *M3/4, *M6/8
  const timeMatch = token.match(/\*M(\d+)\/(\d+)/);
  if (timeMatch) {
    const timeSig: TimeSignature = {
      beats: parseInt(timeMatch[1], 10),
      beatType: parseInt(timeMatch[2], 10),
    };
    return { timeSignature: timeSig };
  }

  return null;
}

/**
 * Parse bekern text into ScoreData.
 *
 * The bekern format from SMT++ is a simplified Humdrum **kern:
 * - Each spine (column) represents a voice/part
 * - Lines are separated by newlines
 * - Barlines start with '='
 * - Interpretations start with '*'
 * - Comments start with '!'
 */
export function parseBekern(bekernText: string): ScoreData {
  resetIdCounter();
  const baseDivisions = 4; // quarter note = 4 divisions
  const lines = bekernText.split('\n').filter((l) => l.trim() !== '');

  // Determine number of spines from first data line
  let numSpines = 1;
  for (const line of lines) {
    if (line.startsWith('**')) {
      numSpines = line.split('\t').length;
      break;
    }
  }

  // Initialize parts (each spine pair may be a grand staff)
  const partMeasures: MeasureElement[][] = Array.from({ length: numSpines }, () => []);
  const partAttributes: (MeasureAttributes | undefined)[] = Array.from({ length: numSpines }, () => undefined);
  const allMeasures: Measure[][] = Array.from({ length: numSpines }, () => []);
  let measureNumber = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip exclusive interpretation and terminators
    if (trimmed.startsWith('**') || trimmed === '*-' || trimmed.startsWith('!')) {
      continue;
    }

    const tokens = trimmed.split('\t');

    // Barline — finalize current measure for all spines
    if (trimmed.startsWith('=')) {
      measureNumber++;
      for (let s = 0; s < numSpines; s++) {
        const measure: Measure = {
          number: measureNumber,
          attributes: partAttributes[s],
          elements: [...partMeasures[s]],
          directions: [],
        };
        allMeasures[s].push(measure);
        partMeasures[s] = [];
        partAttributes[s] = undefined;
      }
      continue;
    }

    // Interpretation — parse attributes
    if (trimmed.startsWith('*')) {
      for (let s = 0; s < Math.min(tokens.length, numSpines); s++) {
        const attrs = parseInterpretation(tokens[s]);
        if (attrs) {
          partAttributes[s] = { ...partAttributes[s], ...attrs, divisions: baseDivisions };
        }
      }
      continue;
    }

    // Data tokens — parse notes/rests
    for (let s = 0; s < Math.min(tokens.length, numSpines); s++) {
      const token = tokens[s];
      if (token === '.' || !token) continue; // null token (continuation)

      // Handle chords (space-separated within a token)
      const chordNotes = token.split(' ');
      for (let ci = 0; ci < chordNotes.length; ci++) {
        const element = parseKernToken(chordNotes[ci], baseDivisions, 1, s + 1);
        if (element) {
          if (ci > 0 && element.type === 'note') {
            (element as NoteElement).chord = true;
          }
          partMeasures[s].push(element);
        }
      }
    }
  }

  // Flush remaining elements as last measure
  for (let s = 0; s < numSpines; s++) {
    if (partMeasures[s].length > 0) {
      measureNumber++;
      allMeasures[s].push({
        number: measureNumber,
        attributes: partAttributes[s],
        elements: [...partMeasures[s]],
        directions: [],
      });
    }
  }

  // Build parts
  const parts: Part[] = [];

  if (numSpines >= 2) {
    // Treat as grand staff (treble + bass = 1 part with 2 staves)
    // Merge spine 0 and spine 1 measures
    const mergedMeasures: Measure[] = [];
    const maxMeasures = Math.max(allMeasures[0].length, allMeasures[1]?.length ?? 0);

    for (let m = 0; m < maxMeasures; m++) {
      const treble = allMeasures[0][m];
      const bass = allMeasures[1]?.[m];

      const elements: MeasureElement[] = [];
      if (treble) elements.push(...treble.elements);
      if (bass) elements.push(...bass.elements);

      mergedMeasures.push({
        number: m + 1,
        attributes: treble?.attributes ?? bass?.attributes,
        elements,
        directions: [...(treble?.directions ?? []), ...(bass?.directions ?? [])],
      });
    }

    parts.push({
      id: 'P1',
      name: 'Piano',
      staves: 2,
      measures: mergedMeasures,
    });

    // Additional spines beyond 2 become separate parts
    for (let s = 2; s < numSpines; s++) {
      parts.push({
        id: `P${s}`,
        name: `Part ${s}`,
        staves: 1,
        measures: allMeasures[s],
      });
    }
  } else {
    // Single spine = single part
    parts.push({
      id: 'P1',
      name: 'Part 1',
      staves: 1,
      measures: allMeasures[0],
    });
  }

  return { parts };
}
