/**
 * Measure editing commands
 * Factory functions returning EditCommand for measure-level operations.
 */

import type { EditCommand } from '../EditCommand';
import type {
  ScoreData,
  Measure,
  KeySignature,
  TimeSignature,
  Clef,
} from '../../types';
import {
  cloneMeasure,
  createEmptyMeasure,
  renumberMeasures,
  generateId,
} from './scoreDataUtils';

/** Insert a measure after a given index in a part */
export function createAddMeasureCommand(
  partIndex: number,
  afterMeasureIndex: number,
  measure?: Measure,
): EditCommand {
  const insertIndex = afterMeasureIndex + 1;

  return {
    type: 'addMeasure',
    description: `Add measure after ${afterMeasureIndex + 1}`,
    execute(scoreData: ScoreData): ScoreData {
      const part = scoreData.parts[partIndex];
      const newMeasure =
        measure ?? createEmptyMeasure(insertIndex + 1, part.measures[0]?.attributes?.divisions);
      const newMeasures = [...part.measures];
      newMeasures.splice(insertIndex, 0, newMeasure);

      const newPart = {
        ...part,
        measures: renumberMeasures(newMeasures),
      };
      const newParts = [...scoreData.parts];
      newParts[partIndex] = newPart;
      return { ...scoreData, parts: newParts };
    },
    undo(scoreData: ScoreData): ScoreData {
      const part = scoreData.parts[partIndex];
      const newMeasures = [...part.measures];
      newMeasures.splice(insertIndex, 1);

      const newPart = {
        ...part,
        measures: renumberMeasures(newMeasures),
      };
      const newParts = [...scoreData.parts];
      newParts[partIndex] = newPart;
      return { ...scoreData, parts: newParts };
    },
  };
}

/** Delete a measure from a part */
export function createDeleteMeasureCommand(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
): EditCommand {
  const snapshot = cloneMeasure(
    scoreData.parts[partIndex].measures[measureIndex],
  );

  return {
    type: 'deleteMeasure',
    description: `Delete measure ${measureIndex + 1}`,
    execute(sd: ScoreData): ScoreData {
      const part = sd.parts[partIndex];
      const newMeasures = [...part.measures];
      newMeasures.splice(measureIndex, 1);

      const newPart = {
        ...part,
        measures: renumberMeasures(newMeasures),
      };
      const newParts = [...sd.parts];
      newParts[partIndex] = newPart;
      return { ...sd, parts: newParts };
    },
    undo(sd: ScoreData): ScoreData {
      const part = sd.parts[partIndex];
      const newMeasures = [...part.measures];
      newMeasures.splice(measureIndex, 0, snapshot);

      const newPart = {
        ...part,
        measures: renumberMeasures(newMeasures),
      };
      const newParts = [...sd.parts];
      newParts[partIndex] = newPart;
      return { ...sd, parts: newParts };
    },
  };
}

/** Copy a measure and paste it at a destination */
export function createCopyPasteMeasureCommand(
  scoreData: ScoreData,
  srcPartIndex: number,
  srcMeasureIndex: number,
  destPartIndex: number,
  destMeasureIndex: number,
): EditCommand {
  const cloned = cloneMeasure(
    scoreData.parts[srcPartIndex].measures[srcMeasureIndex],
  );
  // Assign new IDs to all elements
  for (const el of cloned.elements) {
    if ('id' in el) {
      (el as { id: string }).id = generateId();
    }
  }

  return {
    type: 'copyPasteMeasure',
    description: `Copy measure ${srcMeasureIndex + 1} to ${destMeasureIndex + 1}`,
    execute(sd: ScoreData): ScoreData {
      const part = sd.parts[destPartIndex];
      const newMeasures = [...part.measures];
      newMeasures.splice(destMeasureIndex, 0, cloned);

      const newPart = {
        ...part,
        measures: renumberMeasures(newMeasures),
      };
      const newParts = [...sd.parts];
      newParts[destPartIndex] = newPart;
      return { ...sd, parts: newParts };
    },
    undo(sd: ScoreData): ScoreData {
      const part = sd.parts[destPartIndex];
      const newMeasures = [...part.measures];
      newMeasures.splice(destMeasureIndex, 1);

      const newPart = {
        ...part,
        measures: renumberMeasures(newMeasures),
      };
      const newParts = [...sd.parts];
      newParts[destPartIndex] = newPart;
      return { ...sd, parts: newParts };
    },
  };
}

/** Helper to update measure attributes immutably */
function updateMeasureAttributes(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
  updater: (attrs: NonNullable<Measure['attributes']>) => NonNullable<Measure['attributes']>,
): ScoreData {
  const part = scoreData.parts[partIndex];
  const measure = part.measures[measureIndex];
  const oldAttrs = measure.attributes ?? {};
  const newAttrs = updater(oldAttrs);

  const newMeasure = { ...measure, attributes: newAttrs };
  const newMeasures = [...part.measures];
  newMeasures[measureIndex] = newMeasure;

  const newPart = { ...part, measures: newMeasures };
  const newParts = [...scoreData.parts];
  newParts[partIndex] = newPart;
  return { ...scoreData, parts: newParts };
}

/** Change key signature of a measure */
export function createChangeKeySignatureCommand(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
  newKey: KeySignature,
): EditCommand {
  const oldKey = scoreData.parts[partIndex].measures[measureIndex].attributes
    ?.keySignature;

  return {
    type: 'changeKeySignature',
    description: `Change key signature`,
    execute(sd: ScoreData): ScoreData {
      return updateMeasureAttributes(sd, partIndex, measureIndex, (attrs) => ({
        ...attrs,
        keySignature: newKey,
      }));
    },
    undo(sd: ScoreData): ScoreData {
      return updateMeasureAttributes(sd, partIndex, measureIndex, (attrs) => ({
        ...attrs,
        keySignature: oldKey,
      }));
    },
  };
}

/** Change time signature of a measure */
export function createChangeTimeSignatureCommand(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
  newTime: TimeSignature,
): EditCommand {
  const oldTime = scoreData.parts[partIndex].measures[measureIndex].attributes
    ?.timeSignature;

  return {
    type: 'changeTimeSignature',
    description: `Change time signature`,
    execute(sd: ScoreData): ScoreData {
      return updateMeasureAttributes(sd, partIndex, measureIndex, (attrs) => ({
        ...attrs,
        timeSignature: newTime,
      }));
    },
    undo(sd: ScoreData): ScoreData {
      return updateMeasureAttributes(sd, partIndex, measureIndex, (attrs) => ({
        ...attrs,
        timeSignature: oldTime,
      }));
    },
  };
}

/** Change clef of a measure */
export function createChangeClefCommand(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
  newClef: Clef,
): EditCommand {
  const oldClefs = scoreData.parts[partIndex].measures[measureIndex].attributes
    ?.clef
    ? [...scoreData.parts[partIndex].measures[measureIndex].attributes!.clef!]
    : undefined;

  return {
    type: 'changeClef',
    description: `Change clef`,
    execute(sd: ScoreData): ScoreData {
      return updateMeasureAttributes(sd, partIndex, measureIndex, (attrs) => {
        const clefs = attrs.clef ? [...attrs.clef] : [];
        const idx = clefs.findIndex(
          (c) => c.staffNumber === newClef.staffNumber,
        );
        if (idx >= 0) {
          clefs[idx] = newClef;
        } else {
          clefs.push(newClef);
        }
        return { ...attrs, clef: clefs };
      });
    },
    undo(sd: ScoreData): ScoreData {
      return updateMeasureAttributes(sd, partIndex, measureIndex, (attrs) => ({
        ...attrs,
        clef: oldClefs,
      }));
    },
  };
}
