/**
 * IPC 에러 타입 정의
 * 모든 IPC 통신에서 사용되는 공통 에러 형식을 정의한다.
 */

/** IPC 에러 코드 */
export type IPCErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'FILE_WRITE_ERROR'
  | 'FILE_FORMAT_UNSUPPORTED'
  | 'DISK_SPACE_INSUFFICIENT'
  | 'OMR_MODEL_LOAD_FAILED'
  | 'OMR_RECOGNITION_FAILED'
  | 'AMT_MODEL_LOAD_FAILED'
  | 'AMT_TRANSCRIPTION_FAILED'
  | 'AMT_NO_MUSIC_DETECTED'
  | 'YOUTUBE_INVALID_URL'
  | 'YOUTUBE_FETCH_FAILED'
  | 'YOUTUBE_NETWORK_ERROR'
  | 'EDIT_COMMAND_FAILED'
  | 'TRANSPOSE_FAILED'
  | 'PLAYBACK_FAILED'
  | 'REVIEW_ITEM_NOT_FOUND'
  | 'CHANNEL_NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN_ERROR';

/** IPC 공통 에러 타입 */
export interface IPCError {
  /** 에러 코드 */
  code: IPCErrorCode;
  /** 사용자 표시용 에러 메시지 */
  message: string;
  /** 추가 에러 상세 정보 (디버깅용) */
  details?: unknown;
}

/** IPCError 생성 헬퍼 */
export function createIPCError(
  code: IPCErrorCode,
  message: string,
  details?: unknown
): IPCError {
  return { code, message, details };
}

/** 값이 IPCError인지 확인하는 타입 가드 */
export function isIPCError(value: unknown): value is IPCError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as IPCError).code === 'string' &&
    typeof (value as IPCError).message === 'string'
  );
}
