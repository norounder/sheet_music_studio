/**
 * Note/Rest editing commands
 * Factory functions returning EditCommand for note and rest operations.
 */

import type { EditCommand } from '../EditCommand';
import type {
  ScoreData,
  NoteElement,
  RestElement,
  Pitch,
  Duration,
} from '../../types';
import {
  findElementLocation,
  getElementAtLocation,
  updateElementInScore,
  insertElementInMeasure,
  removeElementFromMeasure,
  replaceMeasureElements,
  isNoteElement,
  generateId,
  type ElementLocation,
} from './scoreDataUtils';
import {
  createMatchingRest,
  noteTypeToDivisions,
  getMeasureDivisions,
  fillWithRests,
  mergeAdjacentRests,
} from './beatUtils';

/** Add a note to a measure */
export function createAddNoteCommand(
  partIndex: number,
  measureIndex: number,
  note: NoteElement,
  atIndex?: number,
): EditCommand {
  return {
    type: 'addNote',
    description: `Add note ${note.pitch.step}${note.pitch.octave}`,
    execute(scoreData: ScoreData): ScoreData {
      return insertElementInMeasure(
        scoreData,
        partIndex,
        measureIndex,
        note,
        atIndex,
      );
    },
    undo(scoreData: ScoreData): ScoreData {
      return removeElementFromMeasure(
        scoreData,
        partIndex,
        measureIndex,
        note.id,
      );
    },
  };
}

/** Delete a note by ID */
export function createDeleteNoteCommand(
  scoreData: ScoreData,
  elementId: string,
): EditCommand {
  const location = findElementLocation(scoreData, elementId);
  if (!location) throw new Error(`Element not found: ${elementId}`);
  const snapshot = getElementAtLocation(scoreData, location) as NoteElement;

  return {
    type: 'deleteNote',
    description: `Delete note ${snapshot.pitch.step}${snapshot.pitch.octave}`,
    execute(sd: ScoreData): ScoreData {
      return removeElementFromMeasure(
        sd,
        location.partIndex,
        location.measureIndex,
        elementId,
      );
    },
    undo(sd: ScoreData): ScoreData {
      return insertElementInMeasure(
        sd,
        location.partIndex,
        location.measureIndex,
        snapshot,
        location.elementIndex,
      );
    },
  };
}

/** Modify a note with partial changes */
export function createModifyNoteCommand(
  scoreData: ScoreData,
  elementId: string,
  changes: Partial<NoteElement>,
): EditCommand {
  const location = findElementLocation(scoreData, elementId);
  if (!location) throw new Error(`Element not found: ${elementId}`);
  const oldElement = getElementAtLocation(scoreData, location) as NoteElement;
  const oldSnapshot = { ...oldElement };

  return {
    type: 'modifyNote',
    description: 'Modify note',
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (el) => ({
        ...(el as NoteElement),
        ...changes,
      }));
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, () => oldSnapshot);
    },
  };
}

/** Modify pitch of a note */
export function createModifyPitchCommand(
  scoreData: ScoreData,
  noteId: string,
  newPitch: Partial<Pitch>,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);
  const el = getElementAtLocation(scoreData, location);
  if (!isNoteElement(el)) throw new Error(`Element is not a note: ${noteId}`);
  const oldPitch = { ...el.pitch };

  return {
    type: 'modifyPitch',
    description: `Change pitch`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => ({
        ...elem,
        pitch: { ...(elem as NoteElement).pitch, ...newPitch },
      }));
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => ({
        ...elem,
        pitch: oldPitch,
      }));
    },
  };
}

/** Modify duration of a note */
export function createModifyDurationCommand(
  scoreData: ScoreData,
  noteId: string,
  newDuration: Partial<Duration>,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);
  const el = getElementAtLocation(scoreData, location);
  if (!isNoteElement(el)) throw new Error(`Element is not a note: ${noteId}`);
  const oldDuration = { ...el.duration };

  return {
    type: 'modifyDuration',
    description: `Change duration`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => ({
        ...elem,
        duration: { ...(elem as NoteElement).duration, ...newDuration },
      }));
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => ({
        ...elem,
        duration: oldDuration,
      }));
    },
  };
}

/** Add a rest to a measure */
export function createAddRestCommand(
  partIndex: number,
  measureIndex: number,
  rest: RestElement,
  atIndex?: number,
): EditCommand {
  return {
    type: 'addRest',
    description: `Add rest`,
    execute(scoreData: ScoreData): ScoreData {
      return insertElementInMeasure(
        scoreData,
        partIndex,
        measureIndex,
        rest,
        atIndex,
      );
    },
    undo(scoreData: ScoreData): ScoreData {
      return removeElementFromMeasure(
        scoreData,
        partIndex,
        measureIndex,
        rest.id,
      );
    },
  };
}

/** Delete a rest by ID */
export function createDeleteRestCommand(
  scoreData: ScoreData,
  elementId: string,
): EditCommand {
  const location = findElementLocation(scoreData, elementId);
  if (!location) throw new Error(`Element not found: ${elementId}`);
  const snapshot = getElementAtLocation(scoreData, location) as RestElement;

  return {
    type: 'deleteRest',
    description: `Delete rest`,
    execute(sd: ScoreData): ScoreData {
      return removeElementFromMeasure(
        sd,
        location.partIndex,
        location.measureIndex,
        elementId,
      );
    },
    undo(sd: ScoreData): ScoreData {
      return insertElementInMeasure(
        sd,
        location.partIndex,
        location.measureIndex,
        snapshot,
        location.elementIndex,
      );
    },
  };
}

// ─── Beat-aware commands ───

/**
 * Delete a note and replace it with a rest of the same duration.
 * Preserves measure beat integrity.
 */
export function createDeleteNoteWithRestCommand(
  scoreData: ScoreData,
  elementId: string,
): EditCommand {
  const location = findElementLocation(scoreData, elementId);
  if (!location) throw new Error(`Element not found: ${elementId}`);
  const snapshot = getElementAtLocation(scoreData, location) as NoteElement;
  const rest = createMatchingRest(snapshot, snapshot.voice, snapshot.staff);

  return {
    type: 'deleteNoteWithRest',
    description: `Delete note ${snapshot.pitch.step}${snapshot.pitch.octave} (replace with rest)`,
    execute(sd: ScoreData): ScoreData {
      // Replace note with rest at same position
      return updateElementInScore(sd, location, () => rest);
    },
    undo(sd: ScoreData): ScoreData {
      // Restore original note
      return updateElementInScore(sd, location, () => snapshot);
    },
  };
}

/**
 * Modify a note/rest duration with beat-aware compensation.
 * Uses snapshot approach: computes the new elements array with
 * fill/consume/merge, then swaps the entire array on execute/undo.
 *
 * - Shortening: inserts rest(s) for the freed space.
 * - Lengthening: consumes adjacent rests to make room.
 * - Always merges adjacent rests after modification.
 */
export function createModifyDurationWithFillCommand(
  scoreData: ScoreData,
  elementId: string,
  newDuration: Partial<Duration>,
): EditCommand {
  const location = findElementLocation(scoreData, elementId);
  if (!location) throw new Error(`Element not found: ${elementId}`);
  const el = getElementAtLocation(scoreData, location);
  if (el.type !== 'note' && el.type !== 'rest') {
    throw new Error(`Element is not a note or rest: ${elementId}`);
  }
  const { partIndex, measureIndex, elementIndex } = location;
  const measure = scoreData.parts[partIndex].measures[measureIndex];
  const ppq = getMeasureDivisions(measure);
  const voice = el.type === 'note' ? (el as NoteElement).voice : (el as RestElement).voice;
  const staff = el.type === 'note' ? (el as NoteElement).staff : (el as RestElement).staff;

  const oldDuration = { ...el.duration };
  const mergedDuration = { ...oldDuration, ...newDuration };
  const oldDivs = oldDuration.divisions;
  const newDivs = noteTypeToDivisions(mergedDuration.noteType, mergedDuration.dots, ppq);
  const delta = newDivs - oldDivs;

  // Snapshot before
  const beforeElements = measure.elements.map((e) => e);

  // ─── Build new elements array in 3 zones ───
  // Zone 1 (before target): untouched
  // Zone 2 (target): the modified element
  // Zone 3 (after target): fill rests + remaining — merge only this zone

  const zoneBefore: typeof beforeElements = [];
  for (let i = 0; i < elementIndex; i++) {
    zoneBefore.push(beforeElements[i]);
  }

  const updatedEl = {
    ...el,
    duration: { ...mergedDuration, divisions: newDivs },
  };

  const zoneAfterRaw: typeof beforeElements = [];
  let remainingAfterIdx = elementIndex + 1;

  if (delta > 0) {
    // Lengthening: consume adjacent rests
    let toConsume = delta;
    while (toConsume > 0.001 && remainingAfterIdx < beforeElements.length) {
      const next = beforeElements[remainingAfterIdx];
      if (next.type !== 'rest' || (next as RestElement).voice !== voice) break;
      const restDivs = next.duration.divisions;
      if (restDivs <= toConsume + 0.001) {
        toConsume -= restDivs;
        remainingAfterIdx++;
      } else {
        const leftover = restDivs - toConsume;
        const remainderRests = fillWithRests(leftover, ppq, voice, staff);
        zoneAfterRaw.push(...remainderRests);
        toConsume = 0;
        remainingAfterIdx++;
      }
    }
    if (toConsume > 0.001) {
      return {
        type: 'modifyDurationWithFill',
        description: `Change duration (blocked: insufficient space)`,
        execute(sd: ScoreData): ScoreData { return sd; },
        undo(sd: ScoreData): ScoreData { return sd; },
      };
    }
  } else if (delta < 0) {
    const gap = -delta;
    const fills = fillWithRests(gap, ppq, voice, staff);
    zoneAfterRaw.push(...fills);
  }

  // Append remaining elements
  for (let i = remainingAfterIdx; i < beforeElements.length; i++) {
    zoneAfterRaw.push(beforeElements[i]);
  }

  // Merge ONLY zone 3 (after target) — zone 1 (before) is untouched
  const zoneAfterMerged = mergeAdjacentRests(zoneAfterRaw, ppq);

  const finalElements = [...zoneBefore, updatedEl, ...zoneAfterMerged];

  return {
    type: 'modifyDurationWithFill',
    description: `Change duration`,
    execute(sd: ScoreData): ScoreData {
      return replaceMeasureElements(sd, partIndex, measureIndex, finalElements);
    },
    undo(sd: ScoreData): ScoreData {
      return replaceMeasureElements(sd, partIndex, measureIndex, beforeElements);
    },
  };
}

/**
 * Convert a rest to a note with a given pitch.
 * Duration is preserved from the rest.
 */
export function createConvertRestToNoteCommand(
  scoreData: ScoreData,
  restId: string,
  pitch: { step: string; octave: number; alter?: number },
): EditCommand {
  const location = findElementLocation(scoreData, restId);
  if (!location) throw new Error(`Element not found: ${restId}`);
  const restSnapshot = getElementAtLocation(scoreData, location) as RestElement;

  const note: NoteElement = {
    type: 'note',
    id: restSnapshot.id, // Reuse ID so location stays valid
    pitch: {
      step: pitch.step as NoteElement['pitch']['step'],
      octave: pitch.octave,
      alter: pitch.alter,
    },
    duration: { ...restSnapshot.duration },
    voice: restSnapshot.voice,
    staff: restSnapshot.staff,
  };

  return {
    type: 'convertRestToNote',
    description: `Convert rest to ${pitch.step}${pitch.octave}`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, () => note);
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, () => restSnapshot);
    },
  };
}

/**
 * Modify a rest's duration with beat-gap filling.
 */
export function createModifyRestDurationCommand(
  scoreData: ScoreData,
  restId: string,
  newDuration: Partial<Duration>,
): EditCommand {
  return createModifyDurationWithFillCommand(scoreData, restId, newDuration);
}
