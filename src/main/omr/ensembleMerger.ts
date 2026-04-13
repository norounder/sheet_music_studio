/**
 * Ensemble merger for combining OMR results from multiple engines.
 * Merges Audiveris (layout/lyrics/dynamics-rich) with SMT++ (note/rhythm-accurate)
 * using a voting strategy optimized for hymn/worship music.
 */

import type { ScoreData, Part, Measure } from '../../shared/types/measure';
import type { MeasureElement, NoteElement, Pitch } from '../../shared/types/elements';

/** Input for ensemble merging */
export interface EnsembleInput {
  /** Audiveris result (rich in lyrics, dynamics, layout) */
  audiveris: ScoreData;
  /** SMT++ result (higher note/rhythm accuracy) */
  smt?: ScoreData;
}

/** A conflict between two engine results */
export interface MergeConflict {
  /** Part index */
  partIndex: number;
  /** Measure index */
  measureIndex: number;
  /** Element index within measure */
  elementIndex: number;
  /** Which engine's result was chosen */
  resolution: 'audiveris' | 'smt' | 'flagged';
  /** Confidence of the merged result */
  confidence: number;
  /** Description of the conflict */
  description: string;
}

/** Statistics about the merge process */
export interface MergeStats {
  /** Total elements compared */
  totalElements: number;
  /** Number of agreements between engines */
  agreements: number;
  /** Number of conflicts found */
  conflicts: number;
  /** Number of elements only in Audiveris (lyrics, dynamics, etc.) */
  audiverisOnly: number;
}

/** Result of ensemble merging */
export interface MergeResult {
  /** Merged ScoreData */
  merged: ScoreData;
  /** Conflicts encountered during merge */
  conflicts: MergeConflict[];
  /** Merge statistics */
  stats: MergeStats;
}

/**
 * Compare two pitches for equality.
 */
function pitchesEqual(a: Pitch, b: Pitch): boolean {
  return a.step === b.step && a.octave === b.octave && (a.alter ?? 0) === (b.alter ?? 0);
}

/**
 * Compare two notes for pitch and duration match.
 */
function notesMatch(a: NoteElement, b: NoteElement): boolean {
  return pitchesEqual(a.pitch, b.pitch) && a.duration.noteType === b.duration.noteType
    && a.duration.dots === b.duration.dots;
}

/**
 * Extract note elements from a measure's elements list.
 */
function extractNotes(elements: MeasureElement[]): NoteElement[] {
  return elements.filter((e): e is NoteElement => e.type === 'note');
}

/**
 * Merge a single Audiveris note with its SMT++ counterpart.
 * Audiveris note is the base — we enrich it with SMT++ pitch/rhythm if they differ.
 */
function mergeNote(
  audNote: NoteElement,
  smtNote: NoteElement | undefined,
  partIndex: number,
  measureIndex: number,
  elementIndex: number,
  conflicts: MergeConflict[],
): NoteElement {
  if (!smtNote) {
    // No SMT++ counterpart — use Audiveris as-is
    return { ...audNote };
  }

  if (notesMatch(audNote, smtNote)) {
    // Both engines agree — high confidence
    return { ...audNote, confidence: Math.min(0.95, (audNote.confidence ?? 0.85) + 0.05) };
  }

  // Conflict: pitch or duration mismatch
  // Strategy: Use SMT++ pitch/rhythm (research-backed higher accuracy for notes)
  // but keep Audiveris lyrics, dynamics, articulations, etc.
  conflicts.push({
    partIndex,
    measureIndex,
    elementIndex,
    resolution: 'smt',
    confidence: 0.6,
    description: `Pitch/rhythm conflict: Audiveris=${audNote.pitch.step}${audNote.pitch.octave}/${audNote.duration.noteType} vs SMT++=${smtNote.pitch.step}${smtNote.pitch.octave}/${smtNote.duration.noteType}`,
  });

  return {
    ...audNote,
    // Take SMT++ pitch and duration
    pitch: { ...smtNote.pitch },
    duration: { ...smtNote.duration },
    // Keep Audiveris decorations
    lyrics: audNote.lyrics,
    dynamics: audNote.dynamics,
    articulations: audNote.articulations,
    ornaments: audNote.ornaments,
    slur: audNote.slur,
    tie: audNote.tie,
    // Flag as conflict
    confidence: 0.6,
  };
}

/**
 * Merge measures from two engines.
 * Uses Audiveris as the structural base (measure boundaries, barlines, directions)
 * and compares/replaces note content with SMT++ where available.
 */
function mergeMeasures(
  audMeasure: Measure,
  smtMeasure: Measure | undefined,
  partIndex: number,
  measureIndex: number,
  conflicts: MergeConflict[],
  stats: MergeStats,
): Measure {
  if (!smtMeasure) {
    // No SMT++ measure — use Audiveris as-is
    const notes = extractNotes(audMeasure.elements);
    stats.totalElements += notes.length;
    stats.audiverisOnly += notes.length;
    return { ...audMeasure };
  }

  const audNotes = extractNotes(audMeasure.elements);
  const smtNotes = extractNotes(smtMeasure.elements);
  stats.totalElements += Math.max(audNotes.length, smtNotes.length);

  // If SMT++ produced drastically fewer notes (>50% less), it's unreliable — ignore it
  if (audNotes.length > 0 && smtNotes.length < audNotes.length * 0.5) {
    stats.audiverisOnly += audNotes.length;
    return { ...audMeasure };
  }

  // If note counts match, do element-wise comparison
  if (audNotes.length === smtNotes.length) {
    const mergedElements = audMeasure.elements.map((el, idx) => {
      if (el.type !== 'note') return el;

      // Find corresponding SMT++ note by position
      const audNoteIdx = audNotes.indexOf(el);
      const smtNote = smtNotes[audNoteIdx];

      if (smtNote && notesMatch(el, smtNote)) {
        stats.agreements++;
      }

      return mergeNote(el, smtNote, partIndex, measureIndex, idx, conflicts);
    });

    return {
      ...audMeasure,
      elements: mergedElements,
    };
  }

  // Note counts differ — structural mismatch
  // Use Audiveris structure but flag the entire measure
  conflicts.push({
    partIndex,
    measureIndex,
    elementIndex: -1,
    resolution: 'flagged',
    confidence: 0.4,
    description: `Note count mismatch: Audiveris=${audNotes.length} vs SMT++=${smtNotes.length}`,
  });
  stats.conflicts++;

  // Mark all notes with low confidence
  const flaggedElements = audMeasure.elements.map((el) => {
    if (el.type === 'note') {
      return { ...el, confidence: Math.min(el.confidence ?? 0.85, 0.5) };
    }
    return el;
  });

  return { ...audMeasure, elements: flaggedElements };
}

/**
 * Merge ensemble results from Audiveris and SMT++.
 *
 * Strategy:
 * - Audiveris provides the structural backbone (measures, barlines, directions, lyrics, dynamics)
 * - SMT++ provides higher-accuracy note/rhythm recognition
 * - For matching notes: boost confidence
 * - For conflicts: prefer SMT++ pitch/rhythm, keep Audiveris decorations
 * - For Audiveris-only elements (lyrics, dynamics): keep as-is
 */
export function mergeEnsembleResults(input: EnsembleInput): MergeResult {
  const { audiveris, smt } = input;
  const conflicts: MergeConflict[] = [];
  const stats: MergeStats = {
    totalElements: 0,
    agreements: 0,
    conflicts: 0,
    audiverisOnly: 0,
  };

  // If no SMT++ result, return Audiveris as-is
  if (!smt || smt.parts.length === 0) {
    return { merged: audiveris, conflicts: [], stats };
  }

  const mergedParts: Part[] = audiveris.parts.map((audPart, pIdx) => {
    const smtPart = smt.parts[pIdx];

    const mergedMeasures = audPart.measures.map((audMeasure, mIdx) => {
      const smtMeasure = smtPart?.measures[mIdx];
      return mergeMeasures(audMeasure, smtMeasure, pIdx, mIdx, conflicts, stats);
    });

    return {
      ...audPart,
      measures: mergedMeasures,
    };
  });

  stats.conflicts = conflicts.length;

  return {
    merged: { ...audiveris, parts: mergedParts },
    conflicts,
    stats,
  };
}
