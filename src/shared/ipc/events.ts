/**
 * IPC Progress/Event 채널 타입 정의
 * Main → Renderer 단방향 이벤트 (OMR/AMT/Fetch 진행 상태 등)
 */

import type { OMRProgress, AMTProgress, FetchProgress } from '../types/progress';
import type { OMR_CHANNELS, AMT_CHANNELS, YOUTUBE_CHANNELS } from './channels';

/** Progress 이벤트 채널 → Payload 매핑 */
export interface IPCEventMap {
  [OMR_CHANNELS.PROGRESS]: OMRProgress;
  [AMT_CHANNELS.PROGRESS]: AMTProgress;
  [YOUTUBE_CHANNELS.PROGRESS]: FetchProgress;
}

/** 타입 안전한 이벤트 리스너 콜백 */
export type IPCEventCallback<K extends keyof IPCEventMap> = (
  data: IPCEventMap[K]
) => void;

/** 이벤트 구독 해제 함수 */
export type IPCEventUnsubscribe = () => void;
