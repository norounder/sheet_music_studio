/**
 * Transposer 엔진
 * 악보의 조를 반음 단위로 변환하는 모듈.
 * 모든 음표의 pitch를 이동하고 조표를 갱신한다.
 */

import type {
  ScoreData,
  Pitch,
  PitchStep,
  KeySignature,
  NoteElement,
  MeasureElement,
} from '../types';

// ─── Constants ───

/** 음이름 → 반음 값 (C 기준) */
const STEP_TO_SEMITONE: Record<PitchStep, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Sharp 계열: 반음 → (step, alter) */
const SEMITONE_TO_SHARP: [PitchStep, number][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0],
  ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0],
  ['A', 1], ['B', 0],
];

/** Flat 계열: 반음 → (step, alter) */
const SEMITONE_TO_FLAT: [PitchStep, number][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0],
  ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0],
  ['B', -1], ['B', 0],
];

/**
 * 반음 수 → 5도권(fifths) 이동량 매핑
 * semitone 0~11 → fifths offset
 */
const SEMITONE_TO_FIFTHS: number[] = [
  0, 7, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5,
];

// ─── Pitch 변환 ───

/** Pitch → 절대 반음 값 (octave 포함, C4 = 48) */
export function pitchToAbsoluteSemitone(pitch: Pitch): number {
  return pitch.octave * 12 + STEP_TO_SEMITONE[pitch.step] + (pitch.alter ?? 0);
}

/** 절대 반음 값 → Pitch (enharmonic 선택은 preferSharps로 결정) */
export function absoluteSemitoneToPitch(
  semitone: number,
  preferSharps: boolean,
): Pitch {
  const octave = Math.floor(semitone / 12);
  let chromatic = semitone % 12;
  if (chromatic < 0) chromatic += 12;

  const table = preferSharps ? SEMITONE_TO_SHARP : SEMITONE_TO_FLAT;
  const [step, alter] = table[chromatic];
  return {
    step,
    octave,
    ...(alter !== 0 ? { alter } : {}),
  };
}

/** 단일 Pitch를 반음만큼 조 변환 */
export function transposePitch(
  pitch: Pitch,
  semitones: number,
  targetFifths: number,
): Pitch {
  const absolute = pitchToAbsoluteSemitone(pitch) + semitones;
  const preferSharps = targetFifths >= 0;
  return absoluteSemitoneToPitch(absolute, preferSharps);
}

// ─── KeySignature 변환 ───

/** 조표를 반음만큼 변환 */
export function transposeKeySignature(
  key: KeySignature,
  semitones: number,
): KeySignature {
  // 반음 이동을 5도권 이동으로 변환
  let mod = ((semitones % 12) + 12) % 12;
  const fifthsOffset = SEMITONE_TO_FIFTHS[mod];
  let newFifths = key.fifths + fifthsOffset;

  // [-7, 7] 범위로 정규화 (enharmonic 동치)
  while (newFifths > 7) newFifths -= 12;
  while (newFifths < -7) newFifths += 12;

  return { fifths: newFifths, mode: key.mode };
}

// ─── ScoreData 전체 변환 ───

/**
 * ScoreData의 모든 음표를 반음만큼 조 변환한다.
 * startMeasure/endMeasure로 범위를 지정할 수 있다 (1-based).
 *
 * @param scoreData - 원본 ScoreData
 * @param semitones - 반음 이동량 (+: 높게, -: 낮게)
 * @param startMeasure - 시작 마디 (1-based, inclusive)
 * @param endMeasure - 끝 마디 (1-based, inclusive)
 * @returns 새 ScoreData
 */
export function transposeScoreData(
  scoreData: ScoreData,
  semitones: number,
  startMeasure?: number,
  endMeasure?: number,
): ScoreData {
  if (semitones === 0) return scoreData;

  const start = startMeasure ?? 1;
  const end = endMeasure ?? Infinity;

  // 현재 조표 추적 (첫 마디의 조표 기준)
  let currentKey: KeySignature = { fifths: 0, mode: 'major' };

  const newParts = scoreData.parts.map((part) => {
    // 파트별 조표 추적 리셋
    let partKey = { ...currentKey };

    const newMeasures = part.measures.map((measure) => {
      const inRange = measure.number >= start && measure.number <= end;

      // 조표 추적
      if (measure.attributes?.keySignature) {
        partKey = { ...measure.attributes.keySignature };
      }

      if (!inRange) return measure;

      // 조표 변환
      const newAttributes = measure.attributes
        ? {
            ...measure.attributes,
            ...(measure.attributes.keySignature
              ? {
                  keySignature: transposeKeySignature(
                    measure.attributes.keySignature,
                    semitones,
                  ),
                }
              : {}),
          }
        : measure.attributes;

      // 변환 후 조표로 enharmonic 결정
      const targetKey = newAttributes?.keySignature ?? transposeKeySignature(partKey, semitones);

      // 음표 변환
      const newElements: MeasureElement[] = measure.elements.map((el) => {
        if (el.type !== 'note') return el;
        const note = el as NoteElement;
        return {
          ...note,
          pitch: transposePitch(note.pitch, semitones, targetKey.fifths),
        };
      });

      return {
        ...measure,
        ...(newAttributes !== measure.attributes
          ? { attributes: newAttributes }
          : {}),
        elements: newElements,
      };
    });

    return { ...part, measures: newMeasures };
  });

  return { ...scoreData, parts: newParts };
}
