/**
 * Expression editing commands
 * Factory functions for articulations, ties, slurs, and lyrics.
 */

import type { EditCommand } from '../EditCommand';
import type {
  ScoreData,
  NoteElement,
  Articulation,
  TieInfo,
  SlurInfo,
  Lyric,
} from '../../types';
import {
  findElementLocation,
  getElementAtLocation,
  updateElementInScore,
  isNoteElement,
} from './scoreDataUtils';

/** Toggle an articulation on/off for a note */
export function createToggleArticulationCommand(
  scoreData: ScoreData,
  noteId: string,
  articulation: Articulation,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);
  const el = getElementAtLocation(scoreData, location);
  if (!isNoteElement(el)) throw new Error(`Element is not a note: ${noteId}`);

  const wasPresent = el.articulations?.includes(articulation) ?? false;

  return {
    type: 'toggleArticulation',
    description: `Toggle ${articulation}`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const arts = note.articulations ? [...note.articulations] : [];
        if (wasPresent) {
          const idx = arts.indexOf(articulation);
          if (idx >= 0) arts.splice(idx, 1);
        } else {
          arts.push(articulation);
        }
        return { ...note, articulations: arts.length > 0 ? arts : undefined };
      });
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const arts = note.articulations ? [...note.articulations] : [];
        if (wasPresent) {
          // Re-add
          arts.push(articulation);
        } else {
          // Remove
          const idx = arts.indexOf(articulation);
          if (idx >= 0) arts.splice(idx, 1);
        }
        return { ...note, articulations: arts.length > 0 ? arts : undefined };
      });
    },
  };
}

/** Add a tie to a note */
export function createAddTieCommand(
  scoreData: ScoreData,
  noteId: string,
  tieInfo: TieInfo,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);

  return {
    type: 'addTie',
    description: `Add tie`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => ({
        ...elem,
        tie: tieInfo,
      }));
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const { tie: _, ...rest } = elem as NoteElement;
        return rest as NoteElement;
      });
    },
  };
}

/** Delete a tie from a note */
export function createDeleteTieCommand(
  scoreData: ScoreData,
  noteId: string,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);
  const el = getElementAtLocation(scoreData, location) as NoteElement;
  const oldTie = el.tie;

  return {
    type: 'deleteTie',
    description: `Delete tie`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const { tie: _, ...rest } = elem as NoteElement;
        return rest as NoteElement;
      });
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => ({
        ...elem,
        tie: oldTie,
      }));
    },
  };
}

/** Add a slur to a note */
export function createAddSlurCommand(
  scoreData: ScoreData,
  noteId: string,
  slurInfo: SlurInfo,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);

  return {
    type: 'addSlur',
    description: `Add slur`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const slurs = note.slur ? [...note.slur, slurInfo] : [slurInfo];
        return { ...note, slur: slurs };
      });
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const slurs = note.slur?.filter(
          (s) => s.number !== slurInfo.number,
        );
        return {
          ...note,
          slur: slurs && slurs.length > 0 ? slurs : undefined,
        };
      });
    },
  };
}

/** Delete a slur from a note by slur number */
export function createDeleteSlurCommand(
  scoreData: ScoreData,
  noteId: string,
  slurNumber: number,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);
  const el = getElementAtLocation(scoreData, location) as NoteElement;
  const oldSlur = el.slur?.find((s) => s.number === slurNumber);

  return {
    type: 'deleteSlur',
    description: `Delete slur ${slurNumber}`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const slurs = note.slur?.filter((s) => s.number !== slurNumber);
        return {
          ...note,
          slur: slurs && slurs.length > 0 ? slurs : undefined,
        };
      });
    },
    undo(sd: ScoreData): ScoreData {
      if (!oldSlur) return sd;
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const slurs = note.slur ? [...note.slur, oldSlur] : [oldSlur];
        return { ...note, slur: slurs };
      });
    },
  };
}

/** Add a lyric to a note */
export function createAddLyricCommand(
  scoreData: ScoreData,
  noteId: string,
  lyric: Lyric,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);

  return {
    type: 'addLyric',
    description: `Add lyric "${lyric.text}"`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const lyrics = note.lyrics ? [...note.lyrics, lyric] : [lyric];
        return { ...note, lyrics };
      });
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const lyrics = note.lyrics?.filter(
          (l) => l.number !== lyric.number,
        );
        return {
          ...note,
          lyrics: lyrics && lyrics.length > 0 ? lyrics : undefined,
        };
      });
    },
  };
}

/** Modify a lyric text */
export function createModifyLyricCommand(
  scoreData: ScoreData,
  noteId: string,
  lyricNumber: number,
  newText: string,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);
  const el = getElementAtLocation(scoreData, location) as NoteElement;
  const oldLyric = el.lyrics?.find((l) => l.number === lyricNumber);
  const oldText = oldLyric?.text ?? '';

  return {
    type: 'modifyLyric',
    description: `Modify lyric ${lyricNumber}`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const lyrics = note.lyrics?.map((l) =>
          l.number === lyricNumber ? { ...l, text: newText } : l,
        );
        return { ...note, lyrics };
      });
    },
    undo(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const lyrics = note.lyrics?.map((l) =>
          l.number === lyricNumber ? { ...l, text: oldText } : l,
        );
        return { ...note, lyrics };
      });
    },
  };
}

/** Delete a lyric by number */
export function createDeleteLyricCommand(
  scoreData: ScoreData,
  noteId: string,
  lyricNumber: number,
): EditCommand {
  const location = findElementLocation(scoreData, noteId);
  if (!location) throw new Error(`Element not found: ${noteId}`);
  const el = getElementAtLocation(scoreData, location) as NoteElement;
  const oldLyric = el.lyrics?.find((l) => l.number === lyricNumber);

  return {
    type: 'deleteLyric',
    description: `Delete lyric ${lyricNumber}`,
    execute(sd: ScoreData): ScoreData {
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const lyrics = note.lyrics?.filter((l) => l.number !== lyricNumber);
        return {
          ...note,
          lyrics: lyrics && lyrics.length > 0 ? lyrics : undefined,
        };
      });
    },
    undo(sd: ScoreData): ScoreData {
      if (!oldLyric) return sd;
      return updateElementInScore(sd, location, (elem) => {
        const note = elem as NoteElement;
        const lyrics = note.lyrics
          ? [...note.lyrics, oldLyric]
          : [oldLyric];
        return { ...note, lyrics };
      });
    },
  };
}
