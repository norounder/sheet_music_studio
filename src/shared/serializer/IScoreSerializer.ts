/**
 * Score Serializer 인터페이스
 * Score_Data와 MusicXML 간 양방향 변환을 정의한다.
 */

import type { ScoreData } from '../types';
import type { ValidationResult } from '../types';

/** Score_Data ↔ MusicXML 직렬화/역직렬화 인터페이스 */
export interface IScoreSerializer {
  /** Score_Data → MusicXML 직렬화 */
  toMusicXML(scoreData: ScoreData): string;

  /** MusicXML → Score_Data 역직렬화 */
  fromMusicXML(xml: string): ScoreData;

  /** MusicXML 유효성 검증 */
  validateMusicXML(xml: string): ValidationResult;
}
