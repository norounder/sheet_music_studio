/**
 * EditCommand 인터페이스
 * Command 패턴 기반의 편집 명령 정의.
 * 각 명령은 execute()와 undo()를 통해 ScoreData를 변환한다.
 */

import type { ScoreData } from '../types';

/** 편집 명령 인터페이스 */
export interface EditCommand {
  /** 명령 타입 식별자 */
  type: string;
  /** 명령 설명 (Undo/Redo UI 표시용) */
  description: string;
  /** 명령 실행: ScoreData를 변환하여 새 ScoreData를 반환 */
  execute(scoreData: ScoreData): ScoreData;
  /** 명령 취소: ScoreData를 이전 상태로 복원 */
  undo(scoreData: ScoreData): ScoreData;
}
