/**
 * 마디 속성 타입 정의
 * 조표, 박자표, 음자리표 등 마디의 속성을 정의한다.
 */

/** 마디 속성 (조표, 박자표, 음자리표 등) */
export interface MeasureAttributes {
  /** 4분음표 기준 분할 수 (duration 계산의 기준) */
  divisions?: number;
  /** 조표 */
  keySignature?: KeySignature;
  /** 박자표 */
  timeSignature?: TimeSignature;
  /** 보표별 음자리표 */
  clef?: Clef[];
  /** 보표 수 */
  staves?: number;
}

/** 조표 */
export interface KeySignature {
  /** 5도권 위치 (-7 ~ 7, 음수: 플랫 수, 양수: 샤프 수) */
  fifths: number;
  /** 장조/단조 */
  mode: 'major' | 'minor';
}

/** 박자표 */
export interface TimeSignature {
  /** 분자 (예: 3/4의 3) */
  beats: number;
  /** 분모 (예: 3/4의 4) */
  beatType: number;
  /** 특수 기호 (C: common time, ₵: cut time) */
  symbol?: 'common' | 'cut';
}

/** 음자리표 */
export interface Clef {
  /** 음자리표 종류 */
  sign: 'G' | 'F' | 'C' | 'percussion';
  /** 보표 줄 번호 */
  line: number;
  /** 보표 번호 (1-based) */
  staffNumber: number;
  /** 옥타브 변경 (8va, 8vb 등) */
  octaveChange?: number;
}
