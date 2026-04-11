/**
 * IPC 모듈 Barrel Export
 * 채널 정의, 페이로드 타입, 에러 타입, 이벤트 타입을 한 곳에서 re-export한다.
 */

// 채널 정의
export {
  IPC_CHANNELS,
  FILE_CHANNELS,
  OMR_CHANNELS,
  AMT_CHANNELS,
  YOUTUBE_CHANNELS,
  EDIT_CHANNELS,
  TRANSPOSE_CHANNELS,
  PLAYBACK_CHANNELS,
  REVIEW_CHANNELS,
  ALL_IPC_CHANNELS,
} from './channels';
export type { IPCChannel, IPCEventChannel } from './channels';

// 에러 타입
export { createIPCError, isIPCError } from './errors';
export type { IPCError, IPCErrorCode } from './errors';

// 페이로드 타입
export type {
  IPCResponse,
  IPCSuccessResponse,
  IPCErrorResponse,
  FileOpenRequest,
  FileOpenResponse,
  FileSaveRequest,
  FileSaveResponse,
  FileExportRequest,
  FileExportResponse,
  OMRRecognizeRequest,
  OMRRecognizeResponse,
  AMTTranscribeRequest,
  AMTTranscribeResponse,
  YouTubeFetchRequest,
  YouTubeFetchResponse,
  EditExecuteCommandRequest,
  EditExecuteCommandResponse,
  EditUndoRequest,
  EditUndoResponse,
  EditRedoRequest,
  EditRedoResponse,
  TransposeRequest,
  TransposeResponse,
  PlaybackPlayRequest,
  PlaybackPlayResponse,
  PlaybackPauseRequest,
  PlaybackPauseResponse,
  PlaybackStopRequest,
  PlaybackStopResponse,
  PlaybackSetTempoRequest,
  PlaybackSetTempoResponse,
  ReviewGetItemsRequest,
  ReviewGetItemsResponse,
  ReviewAcceptRequest,
  ReviewAcceptResponse,
  ReviewRejectRequest,
  ReviewRejectResponse,
  ReviewSkipRequest,
  ReviewSkipResponse,
} from './payloads';

// 이벤트 타입
export type { IPCEventMap, IPCEventCallback, IPCEventUnsubscribe } from './events';
