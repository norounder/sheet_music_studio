/**
 * IPC 채널 정의
 * Main ↔ Renderer 간 통신에 사용되는 모든 IPC 채널 이름을 정의한다.
 */

// ─── 파일 관련 채널 ───
export const FILE_CHANNELS = {
  OPEN: 'file:open',
  SAVE: 'file:save',
  EXPORT: 'file:export',
} as const;

// ─── OMR 관련 채널 ───
export const OMR_CHANNELS = {
  RECOGNIZE: 'omr:recognize',
  PROGRESS: 'omr:progress',
  MODEL_DOWNLOAD_PROGRESS: 'omr:modelDownloadProgress',
} as const;

// ─── AMT 관련 채널 ───
export const AMT_CHANNELS = {
  TRANSCRIBE: 'amt:transcribe',
  PROGRESS: 'amt:progress',
} as const;

// ─── YouTube 관련 채널 ───
export const YOUTUBE_CHANNELS = {
  FETCH: 'youtube:fetch',
  PROGRESS: 'youtube:progress',
} as const;

// ─── 편집 관련 채널 ───
export const EDIT_CHANNELS = {
  EXECUTE_COMMAND: 'edit:executeCommand',
  UNDO: 'edit:undo',
  REDO: 'edit:redo',
} as const;

// ─── 조 변환 채널 ───
export const TRANSPOSE_CHANNELS = {
  TRANSPOSE: 'transpose:transpose',
} as const;

// ─── 재생 관련 채널 ───
export const PLAYBACK_CHANNELS = {
  PLAY: 'playback:play',
  PAUSE: 'playback:pause',
  STOP: 'playback:stop',
  SET_TEMPO: 'playback:setTempo',
} as const;

// ─── 교정 관련 채널 ───
export const REVIEW_CHANNELS = {
  GET_ITEMS: 'review:getItems',
  ACCEPT: 'review:accept',
  REJECT: 'review:reject',
  SKIP: 'review:skip',
} as const;

/** 모든 request/response IPC 채널 이름 */
export const IPC_CHANNELS = {
  FILE: FILE_CHANNELS,
  OMR: OMR_CHANNELS,
  AMT: AMT_CHANNELS,
  YOUTUBE: YOUTUBE_CHANNELS,
  EDIT: EDIT_CHANNELS,
  TRANSPOSE: TRANSPOSE_CHANNELS,
  PLAYBACK: PLAYBACK_CHANNELS,
  REVIEW: REVIEW_CHANNELS,
} as const;

/** 모든 request/response 채널의 유니온 타입 */
export type IPCChannel =
  | (typeof FILE_CHANNELS)[keyof typeof FILE_CHANNELS]
  | (typeof OMR_CHANNELS)[keyof typeof OMR_CHANNELS]
  | (typeof AMT_CHANNELS)[keyof typeof AMT_CHANNELS]
  | (typeof YOUTUBE_CHANNELS)[keyof typeof YOUTUBE_CHANNELS]
  | (typeof EDIT_CHANNELS)[keyof typeof EDIT_CHANNELS]
  | (typeof TRANSPOSE_CHANNELS)[keyof typeof TRANSPOSE_CHANNELS]
  | (typeof PLAYBACK_CHANNELS)[keyof typeof PLAYBACK_CHANNELS]
  | (typeof REVIEW_CHANNELS)[keyof typeof REVIEW_CHANNELS];

/** Progress/Event 전용 채널 (Main → Renderer 단방향) */
export type IPCEventChannel =
  | typeof OMR_CHANNELS.PROGRESS
  | typeof AMT_CHANNELS.PROGRESS
  | typeof YOUTUBE_CHANNELS.PROGRESS;

/** 모든 IPC 채널 이름 목록 (런타임 검증용) */
export const ALL_IPC_CHANNELS: readonly IPCChannel[] = [
  ...Object.values(FILE_CHANNELS),
  ...Object.values(OMR_CHANNELS),
  ...Object.values(AMT_CHANNELS),
  ...Object.values(YOUTUBE_CHANNELS),
  ...Object.values(EDIT_CHANNELS),
  ...Object.values(TRANSPOSE_CHANNELS),
  ...Object.values(PLAYBACK_CHANNELS),
  ...Object.values(REVIEW_CHANNELS),
];
