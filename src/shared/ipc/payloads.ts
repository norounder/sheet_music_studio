/**
 * IPC 채널별 Request/Response Payload 타입 정의
 * 각 채널의 요청과 응답 데이터 구조를 타입 안전하게 정의한다.
 */

import type { ScoreData } from '../types/measure';
import type { ScoreDocument } from '../types/document';
import type { ReviewItem } from '../types/review';
import type { IPCError } from './errors';

// ─── 공통 응답 래퍼 ───

/** 성공 응답 */
export interface IPCSuccessResponse<T> {
  success: true;
  data: T;
}

/** 실패 응답 */
export interface IPCErrorResponse {
  success: false;
  error: IPCError;
}

/** IPC 응답 유니온 */
export type IPCResponse<T> = IPCSuccessResponse<T> | IPCErrorResponse;

// ─── File 채널 Payloads ───

export interface FileOpenRequest {
  filePath: string;
}

export interface FileOpenResponse {
  document: ScoreDocument;
}

export interface FileSaveRequest {
  filePath: string;
  document: ScoreDocument;
}

export interface FileSaveResponse {
  savedPath: string;
}

export interface FileExportRequest {
  filePath: string;
  format: 'pdf' | 'png';
  scoreData: ScoreData;
}

export interface FileExportResponse {
  exportedPath: string;
}

// ─── OMR 채널 Payloads ───

/** OMR engine mode */
export type OMREngineMode = 'auto' | 'audiveris-only' | 'smt-only';

export interface OMRRecognizeRequest {
  filePath: string;
  fileType: 'image' | 'pdf';
  /** Override engine mode (default: from config) */
  engineMode?: OMREngineMode;
}

export interface OMRRecognizeResponse {
  document: ScoreDocument;
  processingTimeMs: number;
}

// ─── AMT 채널 Payloads ───

export interface AMTTranscribeRequest {
  filePath: string;
  instrument?: string;
  minConfidence?: number;
  tempoHint?: number;
}

export interface AMTTranscribeResponse {
  document: ScoreDocument;
  detectedTempo: number;
  processingTimeMs: number;
}

// ─── YouTube 채널 Payloads ───

export interface YouTubeFetchRequest {
  url: string;
  instrument?: string;
}

export interface YouTubeFetchResponse {
  document: ScoreDocument;
  videoTitle: string;
  processingTimeMs: number;
}

// ─── Edit 채널 Payloads ───

export interface EditExecuteCommandRequest {
  commandType: string;
  params: Record<string, unknown>;
}

export interface EditExecuteCommandResponse {
  scoreData: ScoreData;
}

export interface EditUndoRequest {}

export interface EditUndoResponse {
  scoreData: ScoreData;
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditRedoRequest {}

export interface EditRedoResponse {
  scoreData: ScoreData;
  canUndo: boolean;
  canRedo: boolean;
}

// ─── Transpose 채널 Payloads ───

export interface TransposeRequest {
  semitones: number;
  startMeasure?: number;
  endMeasure?: number;
}

export interface TransposeResponse {
  scoreData: ScoreData;
}

// ─── Playback 채널 Payloads ───

export interface PlaybackPlayRequest {
  startMeasure?: number;
  startBeat?: number;
}

export interface PlaybackPlayResponse {
  playing: boolean;
}

export interface PlaybackPauseRequest {}

export interface PlaybackPauseResponse {
  paused: boolean;
  currentMeasure: number;
  currentBeat: number;
}

export interface PlaybackStopRequest {}

export interface PlaybackStopResponse {
  stopped: boolean;
}

export interface PlaybackSetTempoRequest {
  bpm: number;
}

export interface PlaybackSetTempoResponse {
  bpm: number;
}

// ─── Review 채널 Payloads ───

export interface ReviewGetItemsRequest {
  threshold?: number;
}

export interface ReviewGetItemsResponse {
  items: ReviewItem[];
  total: number;
  pending: number;
}

export interface ReviewAcceptRequest {
  itemId: string;
  alternativeIndex?: number;
}

export interface ReviewAcceptResponse {
  scoreData: ScoreData;
}

export interface ReviewRejectRequest {
  itemId: string;
}

export interface ReviewRejectResponse {
  scoreData: ScoreData;
}

export interface ReviewSkipRequest {
  itemId: string;
}

export interface ReviewSkipResponse {
  remaining: number;
}
