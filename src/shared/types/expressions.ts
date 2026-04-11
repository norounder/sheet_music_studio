/**
 * 표현 기호 타입 정의
 * 빔, 타이, 슬러, 꾸밈음, 아티큘레이션, 장식음, 다이나믹 등 표현 기호를 정의한다.
 */

/** 빔 정보 */
export interface BeamInfo {
  /** 빔 레벨 (1: 8분음표, 2: 16분음표 등) */
  number: number;
  /** 빔 시작/지속/종료 */
  type: 'begin' | 'continue' | 'end';
}

/** 타이 정보 */
export interface TieInfo {
  /** 타이 시작/종료/지속 */
  type: 'start' | 'stop' | 'continue';
}

/** 슬러 정보 */
export interface SlurInfo {
  /** 슬러 식별 번호 (여러 슬러 구분용) */
  number: number;
  /** 슬러 시작/종료/지속 */
  type: 'start' | 'stop' | 'continue';
  /** 슬러 배치 위치 */
  placement?: 'above' | 'below';
}

/** 꾸밈음 정보 */
export interface GraceNoteInfo {
  /** 아치카투라(true) vs 아포지아투라(false) */
  slash: boolean;
  /** 이전 음표에서 빌려올 시간 비율 */
  stealTimePrevious?: number;
  /** 다음 음표에서 빌려올 시간 비율 */
  stealTimeFollowing?: number;
}

/** 아티큘레이션 타입 */
export type Articulation =
  | 'staccato'
  | 'staccatissimo'
  | 'tenuto'
  | 'accent'
  | 'strong-accent'
  | 'marcato'
  | 'fermata'
  | 'detached-legato'
  | 'spiccato'
  | 'breath-mark';

/** 장식음 타입 */
export type Ornament =
  | 'trill'
  | 'turn'
  | 'inverted-turn'
  | 'mordent'
  | 'inverted-mordent'
  | 'tremolo'
  | 'shake';

/** 다이나믹 기호 타입 */
export type DynamicMark =
  | 'pppp'
  | 'ppp'
  | 'pp'
  | 'p'
  | 'mp'
  | 'mf'
  | 'f'
  | 'ff'
  | 'fff'
  | 'ffff'
  | 'sfz'
  | 'sfp'
  | 'fp'
  | 'rf'
  | 'rfz';

/** 페달 정보 */
export interface PedalInfo {
  /** 페달 시작/종료/변경/지속 */
  type: 'start' | 'stop' | 'change' | 'continue';
  /** 페달 라인 표시 여부 */
  line?: boolean;
}

/** 크레셴도/디크레셴도 정보 */
export interface WedgeInfo {
  /** 크레셴도/디크레셴도/종료 */
  type: 'crescendo' | 'diminuendo' | 'stop';
}

/** 옥타브 시프트 정보 */
export interface OctaveShift {
  /** 시프트 방향 */
  type: 'up' | 'down' | 'stop';
  /** 시프트 크기 (8va 또는 15ma) */
  size: 8 | 15;
}

/** 핑거링 정보 */
export interface Fingering {
  /** 손가락 번호 (1-5) */
  finger: number;
  /** 핑거링 배치 위치 */
  placement?: 'above' | 'below';
}
