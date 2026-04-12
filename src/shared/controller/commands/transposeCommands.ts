/**
 * Transpose editing commands
 * Creates EditCommand for key transposition with undo support.
 */

import type { EditCommand } from '../EditCommand';
import type { ScoreData } from '../../types';
import { transposeScoreData } from '../../transpose/transposer';

/**
 * Create a transpose command that shifts all notes by the given semitones.
 * Undo simply transposes by the negative amount (round-trip property).
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

  return {
    type: 'transpose',
    description: `Transpose ${direction} semitones${rangeDesc}`,
    execute(scoreData: ScoreData): ScoreData {
      return transposeScoreData(scoreData, semitones, startMeasure, endMeasure);
    },
    undo(scoreData: ScoreData): ScoreData {
      return transposeScoreData(scoreData, -semitones, startMeasure, endMeasure);
    },
  };
}
