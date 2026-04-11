/**
 * 렌더링/검증/AI 진행 상태 타입 정의
 * 바운딩 박스, 검증 결과, OMR/AMT/Fetch 진행 상태를 정의한다.
 */

/** 바운딩 박스 (이미지 내 영역 좌표) */
export interface BoundingBox {
  /** X 좌표 */
  x: number;
  /** Y 좌표 */
  y: number;
  /** 너비 */
  width: number;
  /** 높이 */
  height: number;
  /** 페이지 인덱스 (0-based) */
  pageIndex: number;
}

/** MusicXML 검증 결과 */
export interface ValidationResult {
  /** 유효 여부 */
  isValid: boolean;
  /** 검증 오류 목록 */
  errors: ValidationError[];
}

/** 검증 오류 항목 */
export interface ValidationError {
  /** 오류 메시지 */
  message: string;
  /** 오류 발생 줄 번호 */
  line?: number;
  /** 오류 발생 열 번호 */
  column?: number;
}

/** OMR 진행 상태 */
export interface OMRProgress {
  /** 처리 단계 */
  stage: 'preprocessing' | 'inference' | 'postprocessing';
  /** 현재 처리 중인 페이지 */
  currentPage: number;
  /** 전체 페이지 수 */
  totalPages: number;
  /** 진행률 (0 ~ 100) */
  percent: number;
}

/** AMT 진행 상태 */
export interface AMTProgress {
  /** 처리 단계 */
  stage: 'preprocessing' | 'inference' | 'postprocessing';
  /** 진행률 (0 ~ 100) */
  percent: number;
}

/** YouTube Fetch 진행 상태 */
export interface FetchProgress {
  /** 처리 단계 */
  stage: 'downloading' | 'converting';
  /** 진행률 (0 ~ 100) */
  percent: number;
}
