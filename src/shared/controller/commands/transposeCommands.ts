/**
 * Transpose editing commands
 * Creates EditCommand for key transposition with undo support.
 * Uses snapshot-based undo to preserve original enharmonic spellings.
 */

import type { EditCommand } from '../EditCommand';
import type { ScoreData } from '../../types';
import { transposeScoreData } from '../../transpose/transposer';

/**
 * Create a transpose command that shifts all notes by the given semitones.
 * Undo restores the original ScoreData snapshot (preserving enharmonic spellings).
 */
export function createTransposeCommand(
  semitones: number,
  startMeasure?: number,
  endMeasure?: number,
): EditCommand {
  const rangeDesc =
    startMeasure != null && endMeasure != null
      ? ` (measures ${startMeasure}-${endMeasure})`
      : '';
  const direction = semitones > 0 ? `+${semitones}` : `${semitones}`;

  let savedScoreData: ScoreData | null = null;

  return {
    type: 'transpose',
    description: `Transpose ${direction} semitones${rangeDesc}`,
    execute(scoreData: ScoreData): ScoreData {
      savedScoreData = scoreData;
      return transposeScoreData(scoreData, semitones, startMeasure, endMeasure);
    },
    undo(): ScoreData {
      if (!savedScoreData) throw new Error('No saved state for transpose undo');
      return savedScoreData;
    },
  };
}
