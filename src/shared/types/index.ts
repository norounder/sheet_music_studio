/**
 * Score_Data 타입 Barrel Export
 * 모든 악보 관련 타입을 한 곳에서 re-export한다.
 */

// 문서/메타 타입
export type {
  ScoreDocument,
  ScoreMetadata,
  Credit,
  MidiInstrument,
} from './document';

// 마디 속성 타입
export type {
  MeasureAttributes,
  KeySignature,
  TimeSignature,
  Clef,
} from './attributes';

// 음표/쉼표/구조 타입
export type {
  MeasureElement,
  NoteElement,
  RestElement,
  Forward,
  Backup,
  Pitch,
  PitchStep,
  Duration,
  NoteType,
  TupletInfo,
  NotationInfo,
} from './elements';

// 표현 기호 타입
export type {
  BeamInfo,
  TieInfo,
  SlurInfo,
  GraceNoteInfo,
  Articulation,
  Ornament,
  DynamicMark,
  PedalInfo,
  WedgeInfo,
  OctaveShift,
  Fingering,
} from './expressions';

// 교정 상태 타입
export type {
  SymbolType,
  SymbolConfidence,
  AlternativeSymbol,
  ReviewState,
  ReviewItem,
  AlternativeNote,
} from './review';

// 렌더링/검증/AI 진행 상태 타입
export type {
  BoundingBox,
  ValidationResult,
  ValidationError,
  OMRProgress,
  AMTProgress,
  FetchProgress,
} from './progress';

// 마디 구조 타입
export type {
  Barline,
  RepeatInfo,
  EndingInfo,
  DirectionType,
  Direction,
  Lyric,
  Harmony,
  Measure,
  Part,
  ScoreData,
} from './measure';
