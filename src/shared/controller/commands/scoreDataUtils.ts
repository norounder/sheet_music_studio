/**
 * ScoreData immutable tree helpers
 * Commands use these primitives to navigate and update the ScoreData tree.
 */

import type {
  ScoreData,
  Measure,
  MeasureElement,
  NoteElement,
  RestElement,
} from '../../types';

/** Location of an element within the ScoreData tree */
export interface ElementLocation {
  partIndex: number;
  measureIndex: number;
  elementIndex: number;
}

/** Find an element by ID across all parts/measures */
export function findElementLocation(
  scoreData: ScoreData,
  elementId: string,
): ElementLocation | null {
  for (let p = 0; p < scoreData.parts.length; p++) {
    const part = scoreData.parts[p];
    for (let m = 0; m < part.measures.length; m++) {
      const measure = part.measures[m];
      for (let e = 0; e < measure.elements.length; e++) {
        const el = measure.elements[e];
        if ('id' in el && el.id === elementId) {
          return { partIndex: p, measureIndex: m, elementIndex: e };
        }
      }
    }
  }
  return null;
}

/** Get an element at a known location */
export function getElementAtLocation(
  scoreData: ScoreData,
  loc: ElementLocation,
): MeasureElement {
  return scoreData.parts[loc.partIndex].measures[loc.measureIndex].elements[
    loc.elementIndex
  ];
}

/** Immutably update a single element at a known location */
export function updateElementInScore(
  scoreData: ScoreData,
  location: ElementLocation,
  updater: (element: MeasureElement) => MeasureElement,
): ScoreData {
  const { partIndex, measureIndex, elementIndex } = location;
  const part = scoreData.parts[partIndex];
  const measure = part.measures[measureIndex];
  const newElements = [...measure.elements];
  newElements[elementIndex] = updater(newElements[elementIndex]);

  const newMeasure = { ...measure, elements: newElements };
  const newMeasures = [...part.measures];
  newMeasures[measureIndex] = newMeasure;

  const newPart = { ...part, measures: newMeasures };
  const newParts = [...scoreData.parts];
  newParts[partIndex] = newPart;

  return { ...scoreData, parts: newParts };
}

/** Insert an element into a measure at a given index */
export function insertElementInMeasure(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
  element: MeasureElement,
  atIndex?: number,
): ScoreData {
  const part = scoreData.parts[partIndex];
  const measure = part.measures[measureIndex];
  const newElements = [...measure.elements];
  const idx = atIndex ?? newElements.length;
  newElements.splice(idx, 0, element);

  const newMeasure = { ...measure, elements: newElements };
  const newMeasures = [...part.measures];
  newMeasures[measureIndex] = newMeasure;

  const newPart = { ...part, measures: newMeasures };
  const newParts = [...scoreData.parts];
  newParts[partIndex] = newPart;

  return { ...scoreData, parts: newParts };
}

/** Remove an element by ID from a measure */
export function removeElementFromMeasure(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
  elementId: string,
): ScoreData {
  const part = scoreData.parts[partIndex];
  const measure = part.measures[measureIndex];
  const newElements = measure.elements.filter(
    (el) => !('id' in el) || el.id !== elementId,
  );

  const newMeasure = { ...measure, elements: newElements };
  const newMeasures = [...part.measures];
  newMeasures[measureIndex] = newMeasure;

  const newPart = { ...part, measures: newMeasures };
  const newParts = [...scoreData.parts];
  newParts[partIndex] = newPart;

  return { ...scoreData, parts: newParts };
}

/** Deep clone a measure */
export function cloneMeasure(measure: Measure): Measure {
  return JSON.parse(JSON.stringify(measure));
}

let idCounter = 0;

/** Generate a unique ID */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${++idCounter}`;
}

/** Reset the ID counter (for testing) */
export function resetIdCounter(): void {
  idCounter = 0;
}

/** Renumber measures sequentially starting from 1 */
export function renumberMeasures(measures: Measure[]): Measure[] {
  return measures.map((m, i) => ({ ...m, number: i + 1 }));
}

/** Create an empty measure */
export function createEmptyMeasure(
  number: number,
  divisions?: number,
): Measure {
  return {
    number,
    elements: [],
    directions: [],
    ...(divisions ? { attributes: { divisions } } : {}),
  };
}

/** Replace all elements in a measure immutably */
export function replaceMeasureElements(
  scoreData: ScoreData,
  partIndex: number,
  measureIndex: number,
  newElements: MeasureElement[],
): ScoreData {
  const part = scoreData.parts[partIndex];
  const measure = part.measures[measureIndex];
  const newMeasure = { ...measure, elements: newElements };
  const newMeasures = [...part.measures];
  newMeasures[measureIndex] = newMeasure;
  const newPart = { ...part, measures: newMeasures };
  const newParts = [...scoreData.parts];
  newParts[partIndex] = newPart;
  return { ...scoreData, parts: newParts };
}

/** Type guard for NoteElement */
export function isNoteElement(el: MeasureElement): el is NoteElement {
  return el.type === 'note';
}

/** Type guard for RestElement */
export function isRestElement(el: MeasureElement): el is RestElement {
  return el.type === 'rest';
}
