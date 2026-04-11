/**
 * 음표/쉼표/구조 타입 정의
 * 음표, 쉼표, Forward, Backup 등 마디 내 요소를 정의한다.
 */

import type {
  BeamInfo,
  TieInfo,
  SlurInfo,
  GraceNoteInfo,
  Articulation,
  Ornament,
  DynamicMark,
  PedalInfo,
  WedgeInfo,
  OctaveShift,
  Fingering,
} from './expressions';
import type { AlternativeSymbol } from './review';
import type { Lyric } from './measure';

/** 마디 내 요소의 판별 유니온 타입 */
export type MeasureElement = NoteElement | RestElement | Forward | Backup;

/** 음표 요소 */
export interface NoteElement {
  /** 요소 타입 판별자 */
  type: 'note';
  /** 고유 식별자 */
  id: string;
  /** 음높이 */
  pitch: Pitch;
  /** 음길이 */
  duration: Duration;
  /** 성부 번호 (1-based, 다성부 지원) */
  voice: number;
  /** 보표 번호 (1-based, 다보표 지원) */
  staff: number;
  /** 줄기 방향 */
  stem?: 'up' | 'down' | 'none';
  /** 빔 정보 */
  beam?: BeamInfo[];
  /** 타이 정보 */
  tie?: TieInfo;
  /** 슬러 정보 */
  slur?: SlurInfo[];
  /** 화음 여부 (true면 이전 음표와 동시 발음) */
  chord?: boolean;
  /** 꾸밈음 정보 */
  graceNote?: GraceNoteInfo;
  /** 아티큘레이션 목록 */
  articulations?: Articulation[];
  /** 장식음 목록 */
  ornaments?: Ornament[];
  /** 다이나믹 기호 */
  dynamics?: DynamicMark;
  /** 가사 목록 */
  lyrics?: Lyric[];
  /** 핑거링 */
  fingering?: Fingering;
  /** 표기 정보 (페달, 크레셴도, 옥타브 시프트 등) */
  notation?: NotationInfo;
  /** OMR/AMT 신뢰도 점수 (0.0 ~ 1.0) */
  confidence?: number;
  /** 대체 후보 목록 (OMR/AMT 인식 결과) */
  alternatives?: AlternativeSymbol[];
}

/** 쉼표 요소 */
export interface RestElement {
  /** 요소 타입 판별자 */
  type: 'rest';
  /** 고유 식별자 */
  id: string;
  /** 음길이 */
  duration: Duration;
  /** 성부 번호 (1-based) */
  voice: number;
  /** 보표 번호 (1-based) */
  staff: number;
  /** 쉼표 표시 위치 (음이름) */
  displayStep?: string;
  /** 쉼표 표시 옥타브 */
  displayOctave?: number;
}

/** 시간 전진 (다성부 처리용) */
export interface Forward {
  /** 요소 타입 판별자 */
  type: 'forward';
  /** 전진할 음길이 */
  duration: Duration;
  /** 성부 번호 */
  voice: number;
  /** 보표 번호 */
  staff: number;
}

/** 시간 후퇴 (다성부 처리용) */
export interface Backup {
  /** 요소 타입 판별자 */
  type: 'backup';
  /** 후퇴할 음길이 */
  duration: Duration;
}

/** 음높이 */
export interface Pitch {
  /** 음이름 */
  step: PitchStep;
  /** 옥타브 (0-9, 국제 표준) */
  octave: number;
  /** 변화표 (-2: 더블플랫, -1: 플랫, 0: 내추럴, 1: 샤프, 2: 더블샤프) */
  alter?: number;
}

/** 음이름 타입 */
export type PitchStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

/** 음길이 */
export interface Duration {
  /** MeasureAttributes.divisions 기준 틱 수 */
  divisions: number;
  /** 음표 종류 */
  noteType: NoteType;
  /** 점음표 수 (0, 1, 2) */
  dots: number;
  /** 잇단음표 정보 */
  tuplet?: TupletInfo;
}

/** 음표 종류 */
export type NoteType =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | '16th'
  | '32nd'
  | '64th'
  | '128th';

/** 잇단음표 정보 */
export interface TupletInfo {
  /** 실제 음표 수 (예: 셋잇단음표의 3) */
  actualNotes: number;
  /** 정상 음표 수 (예: 셋잇단음표의 2) */
  normalNotes: number;
  /** 잇단음표 시작/종료 */
  type: 'start' | 'stop';
}

/** 표기 정보 (페달, 크레셴도, 옥타브 시프트) */
export interface NotationInfo {
  /** 페달 정보 */
  pedal?: PedalInfo;
  /** 크레셴도/디크레셴도 정보 */
  wedge?: WedgeInfo;
  /** 옥타브 시프트 정보 */
  octaveShift?: OctaveShift;
}
