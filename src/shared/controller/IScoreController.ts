/**
 * IScoreController 인터페이스
 * UI 이벤트를 비즈니스 로직에 위임하는 단일 진입점.
 */

import type { ScoreDocument } from '../types';
import type { ScoreData } from '../types';
import type { EditCommand } from './EditCommand';

/** Score Controller 인터페이스 */
export interface IScoreController {
  // ─── 파일 입출력 ───

  /** MusicXML 파일 열기 (문자열 입력) */
  openFile(xmlContent: string): ScoreDocument;
  /** MusicXML 파일 저장 (직렬화된 문자열 반환) */
  saveFile(): string;
  /** PDF 내보내기 (확장 시 구현) */
  exportPdf(filePath: string): Promise<void>;
  /** PNG 내보내기 (확장 시 구현) */
  exportPng(filePath: string): Promise<void>;

  // ─── Import 연동 (OMR/AMT) ───

  /** 이미지 파일 OMR 인식 (확장 시 구현) */
  importImage(filePath: string): Promise<ScoreDocument>;
  /** PDF 파일 OMR 인식 (확장 시 구현) */
  importPdf(filePath: string): Promise<ScoreDocument>;
  /** 유튜브 URL AMT 채보 (확장 시 구현) */
  importYouTube(url: string): Promise<ScoreDocument>;
  /** 로컬 오디오 AMT 채보 (확장 시 구현) */
  importLocalAudio(filePath: string): Promise<ScoreDocument>;

  // ─── 편집 위임 ───

  /** 편집 명령 실행 */
  executeCommand(command: EditCommand): void;
  /** 실행 취소 */
  undo(): void;
  /** 다시 실행 */
  redo(): void;

  // ─── 재생 (확장 시 구현) ───

  /** 재생 시작 */
  play(): void;
  /** 일시정지 */
  pause(): void;
  /** 정지 */
  stop(): void;
  /** 템포 설정 */
  setTempo(bpm: number): void;

  // ─── 상태 조회 ───

  /** 현재 문서 반환 */
  getDocument(): ScoreDocument | null;
  /** 현재 ScoreData 반환 */
  getScoreData(): ScoreData | null;
  /** Undo 가능 여부 */
  canUndo(): boolean;
  /** Redo 가능 여부 */
  canRedo(): boolean;
  /** Undo 스택 조회 */
  getUndoStack(): EditCommand[];
  /** Redo 스택 조회 */
  getRedoStack(): EditCommand[];

  // ─── 이벤트 구독 ───

  /** ScoreData 변경 시 콜백 등록. 해제 함수를 반환한다. */
  onChange(callback: (scoreData: ScoreData) => void): () => void;
}
