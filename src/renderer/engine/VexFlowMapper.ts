/**
 * VexFlow 매핑 유틸리티
 * Score_Data 타입을 VexFlow 타입으로 변환하는 매핑 함수들을 제공한다.
 */

import type {
  Pitch,
  Duration,
  NoteType,
  Articulation,
  Ornament,
} from '@shared/types';
import type { Clef, KeySignature, TimeSignature } from '@shared/types';

// ─── Pitch 매핑 ───

/**
 * Score_Data Pitch → VexFlow key 문자열 변환
 * @example { step: 'C', octave: 4, alter: 0 } → "c/4"
 * @example { step: 'E', octave: 5, alter: -1 } → "eb/5"
 * @example { step: 'F', octave: 3, alter: 1 } → "f#/3"
 */
export function mapPitchToVexKey(pitch: Pitch): string {
  const step = pitch.step.toLowerCase();
  let accidental = '';
  if (pitch.alter === -2) accidental = 'bb';
  else if (pitch.alter === -1) accidental = 'b';
  else if (pitch.alter === 1) accidental = '#';
  else if (pitch.alter === 2) accidental = '##';
  return `${step}${accidental}/${pitch.octave}`;
}

/**
 * Score_Data Pitch.alter → VexFlow accidental 코드
 * @returns VexFlow accidental string or null if natural/no accidental
 */
export function mapAlterToVexAccidental(alter: number | undefined): string | null {
  switch (alter) {
    case -2: return 'bb';
    case -1: return 'b';
    case 1: return '#';
    case 2: return '##';
    default: return null;
  }
}

// ─── Duration 매핑 ───

const NOTE_TYPE_TO_VEX: Record<NoteType, string> = {
  'whole': 'w',
  'half': 'h',
  'quarter': 'q',
  'eighth': '8',
  '16th': '16',
  '32nd': '32',
  '64th': '64',
  '128th': '128',
};

/**
 * Score_Data Duration → VexFlow duration 문자열 변환
 * @example { noteType: 'quarter', dots: 0 } → "q"
 * @example { noteType: 'half', dots: 1 } → "hd"
 * @example { noteType: 'eighth', dots: 2 } → "8dd"
 */
export function mapDurationToVexDuration(duration: Duration): string {
  const base = NOTE_TYPE_TO_VEX[duration.noteType] ?? 'q';
  const dots = 'd'.repeat(duration.dots);
  return `${base}${dots}`;
}

// ─── Clef 매핑 ───

/**
 * Score_Data Clef → VexFlow clef 문자열 변환
 * @example { sign: 'G', line: 2 } → "treble"
 * @example { sign: 'F', line: 4 } → "bass"
 * @example { sign: 'C', line: 3 } → "alto"
 */
export function mapClefToVexClef(clef: Clef): string {
  if (clef.sign === 'G' && clef.line === 2) return 'treble';
  if (clef.sign === 'F' && clef.line === 4) return 'bass';
  if (clef.sign === 'C' && clef.line === 3) return 'alto';
  if (clef.sign === 'C' && clef.line === 4) return 'tenor';
  if (clef.sign === 'C' && clef.line === 1) return 'soprano';
  if (clef.sign === 'percussion') return 'percussion';
  // Fallback for non-standard positions
  if (clef.sign === 'G') return 'treble';
  if (clef.sign === 'F') return 'bass';
  return 'treble';
}


// ─── Key Signature 매핑 ───

/**
 * fifths 값 → VexFlow key signature 문자열 매핑 테이블
 * VexFlow는 "C", "G", "D", "A", "E", "B", "F#", "C#" (샤프 계열)
 * 및 "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb" (플랫 계열) 을 사용한다.
 */
const FIFTHS_TO_MAJOR_KEY: Record<number, string> = {
  '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab',
  '-3': 'Eb', '-2': 'Bb', '-1': 'F',
  '0': 'C',
  '1': 'G', '2': 'D', '3': 'A', '4': 'E',
  '5': 'B', '6': 'F#', '7': 'C#',
};

const FIFTHS_TO_MINOR_KEY: Record<number, string> = {
  '-7': 'Ab', '-6': 'Eb', '-5': 'Bb', '-4': 'F',
  '-3': 'C', '-2': 'G', '-1': 'D',
  '0': 'A',
  '1': 'E', '2': 'B', '3': 'F#', '4': 'C#',
  '5': 'G#', '6': 'D#', '7': 'A#',
};

/**
 * Score_Data KeySignature → VexFlow key signature 문자열 변환
 * @example { fifths: 0, mode: 'major' } → "C"
 * @example { fifths: -2, mode: 'major' } → "Bb"
 * @example { fifths: 3, mode: 'minor' } → "F#"
 */
export function mapKeySignatureToVexKey(ks: KeySignature): string {
  const table = ks.mode === 'minor' ? FIFTHS_TO_MINOR_KEY : FIFTHS_TO_MAJOR_KEY;
  return table[ks.fifths.toString() as unknown as number] ?? 'C';
}

// ─── Time Signature 매핑 ───

/**
 * Score_Data TimeSignature → VexFlow time signature 문자열 변환
 * @example { beats: 4, beatType: 4 } → "4/4"
 * @example { beats: 3, beatType: 4 } → "3/4"
 * @example { beats: 4, beatType: 4, symbol: 'common' } → "C"
 * @example { beats: 2, beatType: 2, symbol: 'cut' } → "C|"
 */
export function mapTimeSignatureToVexTime(ts: TimeSignature): string {
  if (ts.symbol === 'common') return 'C';
  if (ts.symbol === 'cut') return 'C|';
  return `${ts.beats}/${ts.beatType}`;
}

// ─── Articulation 매핑 ───

/**
 * Score_Data Articulation → VexFlow Articulation 코드 매핑
 * VexFlow 4.x uses string codes like "a.", "a>", etc.
 */
const ARTICULATION_MAP: Record<Articulation, string> = {
  'staccato': 'a.',
  'staccatissimo': 'av',
  'tenuto': 'a-',
  'accent': 'a>',
  'strong-accent': 'a^',
  'marcato': 'a^',
  'fermata': 'a@a',
  'detached-legato': 'a.',
  'spiccato': 'a.',
  'breath-mark': 'a,',
};

/**
 * Score_Data Articulation → VexFlow articulation 코드 변환
 * @example 'staccato' → "a."
 * @example 'accent' → "a>"
 */
export function mapArticulationToVex(art: Articulation): string {
  return ARTICULATION_MAP[art] ?? 'a.';
}

// ─── Ornament 매핑 ───

/**
 * Score_Data Ornament → VexFlow Ornament 코드 매핑
 */
const ORNAMENT_MAP: Record<Ornament, string> = {
  'trill': 'tr',
  'turn': 'turn',
  'inverted-turn': 'turn_inverted',
  'mordent': 'mordent',
  'inverted-mordent': 'mordent_inverted',
  'tremolo': 'tremolo1',
  'shake': 'shake',
};

/**
 * Score_Data Ornament → VexFlow ornament 코드 변환
 * @example 'trill' → "tr"
 * @example 'mordent' → "mordent"
 */
export function mapOrnamentToVex(orn: Ornament): string {
  return ORNAMENT_MAP[orn] ?? 'tr';
}

// ─── Barline 매핑 ───

/**
 * Score_Data barline style → VexFlow barline type 매핑
 */
export function mapBarlineStyleToVex(
  style: string,
  repeat?: { direction: 'forward' | 'backward'; times?: number },
): number {
  // VexFlow Barline types (numeric constants)
  // 0 = SINGLE, 1 = DOUBLE, 2 = END, 3 = REPEAT_BEGIN, 4 = REPEAT_END, 5 = REPEAT_BOTH, 6 = NONE
  if (repeat) {
    if (repeat.direction === 'forward') return 3;  // REPEAT_BEGIN
    if (repeat.direction === 'backward') return 4;  // REPEAT_END
  }
  switch (style) {
    case 'light-light': return 1;  // DOUBLE
    case 'light-heavy': return 2;  // END
    case 'heavy-light': return 3;  // REPEAT_BEGIN
    case 'heavy-heavy': return 1;  // DOUBLE (closest match)
    case 'none': return 6;         // NONE
    default: return 0;             // SINGLE
  }
}
