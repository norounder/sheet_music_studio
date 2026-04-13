/**
 * 교정 상태 타입 정의
 * OMR/AMT 인식 결과의 신뢰도, 대체 후보, 교정 상태를 정의한다.
 */

import type { Pitch, Duration } from './elements';

/** 기호 타입 (OMR 인식용) */
export type SymbolType =
  | 'note'
  | 'rest'
  | 'clef'
  | 'key-signature'
  | 'time-signature'
  | 'barline'
  | 'beam'
  | 'tie'
  | 'slur'
  | 'dynamic'
  | 'articulation'
  | 'ornament'
  | 'grace-note'
  | 'repeat'
  | 'ending'
  | 'pedal'
  | 'fingering'
  | 'lyric'
  | 'unknown';

/** 기호 신뢰도 정보 (OMR 인식 결과) */
export interface SymbolConfidence {
  /** 기호 고유 식별자 */
  symbolId: string;
  /** 기호 타입 */
  type: SymbolType;
  /** 신뢰도 점수 (0.0 ~ 1.0) */
  confidence: number;
  /** 기호의 바운딩 박스 */
  boundingBox: import('./progress').BoundingBox;
  /** 대체 후보 목록 */
  alternatives?: AlternativeSymbol[];
}

/** 대체 기호 후보 */
export interface AlternativeSymbol {
  /** 대체 기호 타입 */
  type: SymbolType;
  /** 대체 후보 신뢰도 */
  confidence: number;
  /** 미리보기용 기호 식별자 */
  preview?: string;
}

/** 교정 상태 (OMR/AMT 교정 세션) */
export interface ReviewState {
  /** 교정 대상 항목 목록 */
  items: ReviewItem[];
  /** 현재 교정 중인 항목 인덱스 */
  currentIndex: number;
  /** 신뢰도 임계값 (기본 0.7) */
  threshold: number;
}

/** 교정 대상 항목 */
export interface ReviewItem {
  /** 항목 고유 식별자 */
  id: string;
  /** 기호 신뢰도 정보 */
  symbolConfidence: SymbolConfidence;
  /** 해당 마디 인덱스 */
  measureIndex: number;
  /** 교정 상태 */
  status: 'pending' | 'accepted' | 'edited' | 'skipped';
  /** 진단 사유 (왜 플래그되었는지) */
  reason?: ReviewReason;
}

/** 리뷰 플래그 사유 */
export type ReviewReason =
  | { type: 'rhythm-mismatch'; expected: number; actual: number; voice: number; excessDivisions: number }
  | { type: 'out-of-range'; midi: number; clefRange: { low: number; high: number } }
  | { type: 'grace-note' }
  | { type: 'short-note'; noteType: string }
  | { type: 'double-accidental'; alter: number }
  | { type: 'tuplet' }
  | { type: 'tie-invalid'; description: string }
  | { type: 'voice-crossing' }
  | { type: 'lyric-gap' }
  | { type: 'repeat-unmatched' }
  | { type: 'ensemble-conflict'; description: string };

/** 대체 음표 후보 (AMT 인식 결과) */
export interface AlternativeNote {
  /** 대체 음높이 */
  pitch: Pitch;
  /** 대체 음길이 */
  duration: Duration;
  /** 대체 후보 신뢰도 */
  confidence: number;
}
