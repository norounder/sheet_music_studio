/**
 * 마디 구조 타입 정의
 * 마디선, 반복, 방향 지시, 가사, 마디, 파트, ScoreData를 정의한다.
 */

import type { MeasureAttributes } from './attributes';
import type { MeasureElement, PitchStep } from './elements';
import type { DynamicMark, PedalInfo, WedgeInfo } from './expressions';
import type { Credit, MidiInstrument } from './document';

/** 마디선 */
export interface Barline {
  /** 마디선 위치 */
  location: 'left' | 'right' | 'middle';
  /** 마디선 스타일 */
  style:
    | 'regular'
    | 'dotted'
    | 'dashed'
    | 'heavy'
    | 'light-light'
    | 'light-heavy'
    | 'heavy-light'
    | 'heavy-heavy'
    | 'none';
  /** 반복 기호 */
  repeat?: { direction: 'forward' | 'backward'; times?: number };
  /** 볼타 괄호 (1번 괄호, 2번 괄호 등) */
  ending?: EndingInfo;
}

/** 반복 정보 */
export interface RepeatInfo {
  /** 세뇨 기호 */
  segno?: boolean;
  /** 코다 기호 */
  coda?: boolean;
  /** 다 카포 */
  dacapo?: boolean;
  /** 달 세뇨 */
  dalSegno?: boolean;
  /** 피네 */
  fine?: boolean;
}

/** 볼타 괄호 정보 */
export interface EndingInfo {
  /** 괄호 번호 (예: [1], [1, 2]) */
  number: number[];
  /** 괄호 시작/종료/불연속 */
  type: 'start' | 'stop' | 'discontinue';
  /** 괄호 텍스트 */
  text?: string;
}

/** 방향 지시 타입 (템포, 다이나믹, 크레셴도, 페달, 리허설 등) */
export type DirectionType =
  | { kind: 'tempo'; bpm: number; text?: string }
  | { kind: 'dynamic'; value: DynamicMark }
  | { kind: 'wedge'; value: WedgeInfo }
  | { kind: 'pedal'; value: PedalInfo }
  | { kind: 'rehearsal'; text: string }
  | { kind: 'segno' }
  | { kind: 'coda' }
  | { kind: 'words'; text: string };

/** 방향 지시 */
export interface Direction {
  /** 방향 지시 타입 */
  type: DirectionType;
  /** 배치 위치 */
  placement: 'above' | 'below';
  /** 마디 내 위치 (divisions 단위) */
  offset?: number;
  /** 보표 번호 */
  staff?: number;
}

/** 가사 */
export interface Lyric {
  /** 가사 줄 번호 (1-based) */
  number: number;
  /** 음절 연결 타입 */
  syllabic: 'single' | 'begin' | 'middle' | 'end';
  /** 가사 텍스트 */
  text: string;
}

/** 화성 기호 (코드 네임) */
export interface Harmony {
  /** 근음 */
  root: { step: PitchStep; alter?: number };
  /** 코드 종류 (major, minor, dominant, diminished, augmented 등) */
  kind: string;
  /** 베이스 음 (전위, 예: C/G) */
  bass?: { step: PitchStep; alter?: number };
  /** 마디 내 오프셋 (divisions 단위) */
  offset?: number;
}

/** 마디 */
export interface Measure {
  /** 마디 번호 (1-based) */
  number: number;
  /** 마디 속성 (조표, 박자표, 음자리표 등) */
  attributes?: MeasureAttributes;
  /** 마디 내 요소 (음표, 쉼표, Forward, Backup, Direction) */
  elements: MeasureElement[];
  /** 방향 지시 목록 */
  directions: Direction[];
  /** 화성 기호 목록 */
  harmonies?: Harmony[];
  /** 마디선 */
  barline?: Barline;
  /** 반복 정보 */
  repeatInfo?: RepeatInfo;
}

/** 파트 (악기별 보표 그룹) */
export interface Part {
  /** 파트 고유 식별자 */
  id: string;
  /** 파트 이름 (예: "Piano", "Violin") */
  name: string;
  /** 파트 약칭 */
  abbreviation?: string;
  /** MIDI 악기 설정 */
  midiInstrument?: MidiInstrument;
  /** 보표 수 (피아노: 2, 기타: 1) */
  staves: number;
  /** 마디 목록 */
  measures: Measure[];
}

/** 악보 핵심 데이터 (파트 목록 + 크레딧) */
export interface ScoreData {
  /** 파트 목록 */
  parts: Part[];
  /** 크레딧 정보 (제목, 작곡가 등) */
  credits?: Credit[];
}
