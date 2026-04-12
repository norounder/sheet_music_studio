/**
 * Heuristic confidence scoring for OMR results.
 * Since Audiveris does not output per-symbol confidence,
 * we analyze musical context to flag likely recognition errors.
 */

import type { ScoreData, Part, Measure } from '../../shared/types/measure';
import type { MeasureElement, NoteElement } from '../../shared/types/elements';
import type { Clef, TimeSignature } from '../../shared/types/attributes';
import type { ReviewState, ReviewItem, SymbolConfidence, SymbolType } from '../../shared/types/review';

/** Default confidence for normal notes */
const DEFAULT_CONFIDENCE = 0.85;

/** Default threshold below which items need review */
const DEFAULT_THRESHOLD = 0.7;

/** Typical pitch ranges per clef sign (MIDI note numbers: C4 = 60) */
const CLEF_RANGES: Record<string, { low: number; high: number }> = {
  G: { low: 55, high: 88 },  // G3 to E6 (treble clef)
  F: { low: 36, high: 65 },  // C2 to F4 (bass clef)
  C: { low: 48, high: 76 },  // C3 to E5 (alto/tenor clef)
};

/** Convert pitch to MIDI note number for range checking */
function pitchToMidi(step: string, octave: number, alter?: number): number {
  const stepToSemitone: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  return (octave + 1) * 12 + (stepToSemitone[step] ?? 0) + (alter ?? 0);
}

/**
 * Calculate the expected total divisions for a measure based on time signature.
 * Returns the expected sum of all element durations.
 */
function expectedMeasureDivisions(
  timeSig: TimeSignature | undefined,
  divisions: number,
): number {
  if (!timeSig || !divisions) return 0;
  // divisions = divisions per quarter note
  // total = (beats / beatType) * 4 * divisions
  return (timeSig.beats / timeSig.beatType) * 4 * divisions;
}

/**
 * Calculate confidence for a single note element based on musical context.
 */
function calculateNoteConfidence(
  note: NoteElement,
  clef: Clef | undefined,
): number {
  let confidence = DEFAULT_CONFIDENCE;

  // 1. Grace notes are often misrecognized
  if (note.graceNote) {
    confidence = Math.min(confidence, 0.5);
  }

  // 2. Very short notes (32nd or shorter) — higher misrecognition rate
  const shortTypes = ['32nd', '64th', '128th'];
  if (shortTypes.includes(note.duration.noteType)) {
    confidence = Math.min(confidence, 0.6);
  }

  // 3. Double sharps/flats
  if (note.pitch.alter !== undefined && Math.abs(note.pitch.alter) >= 2) {
    confidence = Math.min(confidence, 0.6);
  }

  // 4. Tuplets
  if (note.duration.tuplet) {
    confidence = Math.min(confidence, 0.55);
  }

  // 5. Out-of-range pitch for the current clef
  if (clef) {
    const midi = pitchToMidi(note.pitch.step, note.pitch.octave, note.pitch.alter);
    const range = CLEF_RANGES[clef.sign];
    if (range) {
      if (midi < range.low - 5 || midi > range.high + 5) {
        confidence = Math.min(confidence, 0.5);
      } else if (midi < range.low || midi > range.high) {
        confidence = Math.min(confidence, 0.7);
      }
    }
  }

  return confidence;
}

/**
 * Check if a measure's note durations add up to the expected total.
 * Returns true if there is a mismatch.
 */
function hasDurationMismatch(
  measure: Measure,
  timeSig: TimeSignature | undefined,
  divisions: number,
): boolean {
  const expected = expectedMeasureDivisions(timeSig, divisions);
  if (expected === 0) return false;

  // Sum durations per voice, ignoring chords (they share time)
  const voiceDurations = new Map<number, number>();
  for (const el of measure.elements) {
    if (el.type === 'note') {
      if (el.chord) continue; // chord notes share duration with previous
      const voice = el.voice;
      voiceDurations.set(voice, (voiceDurations.get(voice) ?? 0) + el.duration.divisions);
    } else if (el.type === 'rest') {
      const voice = el.voice;
      voiceDurations.set(voice, (voiceDurations.get(voice) ?? 0) + el.duration.divisions);
    } else if (el.type === 'forward') {
      const voice = el.voice;
      voiceDurations.set(voice, (voiceDurations.get(voice) ?? 0) + el.duration.divisions);
    }
    // backup handled implicitly by voice tracking
  }

  // Check if any voice doesn't match expected
  for (const [, total] of voiceDurations) {
    if (Math.abs(total - expected) > 1) {
      return true;
    }
  }

  return false;
}

/**
 * Generate ReviewState from OMR-produced ScoreData.
 * Assigns heuristic confidence scores based on musical context analysis.
 */
export function generateReviewState(
  scoreData: ScoreData,
  threshold: number = DEFAULT_THRESHOLD,
): ReviewState {
  const items: ReviewItem[] = [];
  let itemCounter = 0;

  for (const part of scoreData.parts) {
    let currentClef: Clef | undefined;
    let currentTimeSig: TimeSignature | undefined;
    let currentDivisions = 1;

    for (let mIdx = 0; mIdx < part.measures.length; mIdx++) {
      const measure = part.measures[mIdx];

      // Update running attributes
      if (measure.attributes) {
        if (measure.attributes.divisions) {
          currentDivisions = measure.attributes.divisions;
        }
        if (measure.attributes.timeSignature) {
          currentTimeSig = measure.attributes.timeSignature;
        }
        if (measure.attributes.clef && measure.attributes.clef.length > 0) {
          currentClef = measure.attributes.clef[0];
        }
      }

      // Check for measure-level duration mismatch
      const durationMismatch = hasDurationMismatch(measure, currentTimeSig, currentDivisions);

      for (const element of measure.elements) {
        if (element.type !== 'note') continue;

        let confidence = calculateNoteConfidence(element, currentClef);

        // Override with very low confidence if the measure has duration mismatch
        if (durationMismatch) {
          confidence = Math.min(confidence, 0.4);
        }

        // Only create review items for below-threshold confidence
        if (confidence < threshold) {
          const symbolType: SymbolType = element.graceNote ? 'grace-note' : 'note';
          itemCounter++;

          items.push({
            id: `review-${itemCounter}`,
            symbolConfidence: {
              symbolId: element.id,
              type: symbolType,
              confidence,
              boundingBox: { x: 0, y: 0, width: 0, height: 0, pageIndex: 0 },
            },
            measureIndex: mIdx,
            status: 'pending',
          });
        }
      }
    }
  }

  return {
    items,
    currentIndex: 0,
    threshold,
  };
}
