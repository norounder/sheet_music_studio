/**
 * 문서/메타 타입 정의
 * 악보 문서의 최상위 구조와 메타데이터를 정의한다.
 */

import type { ScoreData } from './measure';
import type { ReviewState } from './review';

/** 악보 문서의 최상위 컨테이너 */
export interface ScoreDocument {
  /** 악보 메타데이터 */
  metadata: ScoreMetadata;
  /** 악보 핵심 데이터 (파트, 마디, 음표 등) */
  scoreData: ScoreData;
  /** OMR/AMT 교정 상태 (인식 결과가 있는 경우) */
  reviewState?: ReviewState;
}

/** 악보 메타데이터 */
export interface ScoreMetadata {
  /** 악보 제목 */
  title: string;
  /** 작곡가 */
  composer: string;
  /** 편곡자 */
  arranger?: string;
  /** 저작권 정보 */
  copyright?: string;
  /** 생성 일시 (ISO 8601) */
  createdAt: string;
  /** 수정 일시 (ISO 8601) */
  modifiedAt: string;
  /** 악보 원본 소스 타입 */
  sourceType: 'omr' | 'amt' | 'musicxml' | 'manual';
}

/** 악보 크레딧 정보 (제목, 작곡가 등 표지 텍스트) */
export interface Credit {
  /** 크레딧 유형 */
  type: 'title' | 'subtitle' | 'composer' | 'arranger' | 'lyricist';
  /** 크레딧 텍스트 */
  text: string;
}

/** MIDI 악기 설정 */
export interface MidiInstrument {
  /** MIDI 채널 (1-16) */
  channel: number;
  /** MIDI 프로그램 번호 (0-127, General MIDI) */
  program: number;
  /** 볼륨 (0-127) */
  volume: number;
  /** 패닝 (-64 ~ 63) */
  pan: number;
}
