/**
 * Beat math utilities
 * Functions for calculating beat values, measure capacity,
 * and generating rest sequences to fill gaps.
 */

import type {
  Measure,
  MeasureElement,
  RestElement,
  NoteType,
  Duration,
} from '../../types';
import { generateId } from './scoreDataUtils';

/** NoteType to quarter-note multiplier */
const NOTE_TYPE_QUARTERS: Record<NoteType, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 0.0625,
  '128th': 0.03125,
};

/** Ordered note types from longest to shortest */
const NOTE_TYPES_DESCENDING: NoteType[] = [
  'whole',
  'half',
  'quarter',
  'eighth',
  '16th',
  '32nd',
  '64th',
  '128th',
];

/** Get the divisions (ppq) for a measure, searching up the part if needed */
export function getMeasureDivisions(measure: Measure): number {
  return measure.attributes?.divisions ?? 1;
}

/** Convert a noteType + dots to division count given ppq */
export function noteTypeToDivisions(
  noteType: NoteType,
  dots: number,
  ppq: number,
): number {
  const baseQuarters = NOTE_TYPE_QUARTERS[noteType];
  let total = baseQuarters;
  let dotValue = baseQuarters;
  for (let d = 0; d < dots; d++) {
    dotValue /= 2;
    total += dotValue;
  }
  return total * ppq;
}

/** Get the duration in divisions for any MeasureElement */
export function getElementDivisions(element: MeasureElement): number {
  return element.duration.divisions;
}

/** Calculate total divisions capacity of a measure */
export function getMeasureTotalDivisions(measure: Measure): number {
  const ppq = getMeasureDivisions(measure);
  const ts = measure.attributes?.timeSignature;
  if (!ts) {
    // Default 4/4
    return ppq * 4;
  }
  // Total = beats * (4 / beatType) * ppq
  return ts.beats * (4 / ts.beatType) * ppq;
}

/** Calculate used divisions in a measure (sum of all element durations) */
export function getUsedDivisions(measure: Measure): number {
  let total = 0;
  for (const el of measure.elements) {
    if (el.type === 'note' || el.type === 'rest') {
      total += el.duration.divisions;
    } else if (el.type === 'forward') {
      total += el.duration.divisions;
    } else if (el.type === 'backup') {
      total -= el.duration.divisions;
    }
  }
  return total;
}

/**
 * Find the best noteType for a given division count.
 * Returns the largest noteType that fits exactly, without dots.
 */
export function divisionsToNoteType(
  divisions: number,
  ppq: number,
): { noteType: NoteType; dots: number } | null {
  // Try dotted values first (dots=1), then plain (dots=0)
  for (const dots of [0, 1, 2]) {
    for (const noteType of NOTE_TYPES_DESCENDING) {
      const divs = noteTypeToDivisions(noteType, dots, ppq);
      if (Math.abs(divs - divisions) < 0.001 && divs > 0) {
        return { noteType, dots };
      }
    }
  }
  return null;
}

/**
 * Generate an optimal sequence of rests to fill a given number of divisions.
 * Uses greedy decomposition: tries dotted values first for fewer rests,
 * then plain values.
 */
export function fillWithRests(
  totalDivisions: number,
  ppq: number,
  voice: number = 1,
  staff: number = 1,
): RestElement[] {
  const rests: RestElement[] = [];
  let remaining = totalDivisions;

  while (remaining > 0.001) {
    let found = false;
    // Try each note type, with dotted variants first for better grouping
    for (const noteType of NOTE_TYPES_DESCENDING) {
      // Try double-dotted, dotted, then plain (larger value = fewer rests)
      for (const dots of [2, 1, 0]) {
        const divs = noteTypeToDivisions(noteType, dots, ppq);
        if (divs > 0 && divs <= remaining + 0.001) {
          rests.push({
            type: 'rest',
            id: generateId(),
            duration: { divisions: divs, noteType, dots },
            voice,
            staff,
          });
          remaining -= divs;
          found = true;
          break;
        }
      }
      if (found) break;
    }
    if (!found) break;
  }

  return rests;
}

/**
 * Merge adjacent rests of the same voice into optimal larger rests.
 * e.g., [8th rest][8th rest] → [quarter rest]
 *       [quarter rest][8th rest][8th rest] → [half rest]
 *
 * @param protectId - If set, the element with this ID starts a new merge group
 *   (it won't be merged into a preceding rest group). This prevents the
 *   modified target element from being swallowed back by its own fill rests.
 */
export function mergeAdjacentRests(
  elements: MeasureElement[],
  ppq: number,
  protectId?: string,
): MeasureElement[] {
  const result: MeasureElement[] = [];
  let i = 0;

  while (i < elements.length) {
    const el = elements[i];
    if (el.type !== 'rest') {
      result.push(el);
      i++;
      continue;
    }

    // Check if this is the protected element — don't merge it with the NEXT group
    const rest = el as RestElement;
    if (protectId && rest.id === protectId) {
      // Keep the protected element as-is, start fresh after it
      result.push(el);
      i++;
      continue;
    }

    // Accumulate adjacent rests with the same voice, stopping at protected ID
    let totalDivs = rest.duration.divisions;
    let j = i + 1;
    while (j < elements.length && elements[j].type === 'rest') {
      const next = elements[j] as RestElement;
      if (next.voice !== rest.voice) break;
      if (protectId && next.id === protectId) break;
      totalDivs += next.duration.divisions;
      j++;
    }

    if (j > i + 1) {
      // Multiple adjacent rests — regenerate as optimal sequence
      const merged = fillWithRests(totalDivs, ppq, rest.voice, rest.staff);
      result.push(...merged);
    } else {
      // Single rest — check if it can be represented better
      const better = divisionsToNoteType(totalDivs, ppq);
      if (better && (better.noteType !== rest.duration.noteType || better.dots !== rest.duration.dots)) {
        result.push({
          ...rest,
          duration: { divisions: totalDivs, noteType: better.noteType, dots: better.dots },
        });
      } else {
        result.push(el);
      }
    }
    i = j;
  }

  return result;
}

/**
 * Create a single rest matching the duration of a given element.
 */
export function createMatchingRest(
  element: MeasureElement,
  voice: number = 1,
  staff: number = 1,
): RestElement {
  const dur = element.duration;
  return {
    type: 'rest',
    id: generateId(),
    duration: { ...dur },
    voice,
    staff,
  };
}
