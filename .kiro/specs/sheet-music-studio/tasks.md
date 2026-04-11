# 구현 계획: Sheet Music Studio

## 개요

Electron + React + TypeScript 기반 통합 악보 제작 애플리케이션을 구현한다. MVP 필수 기능(OMR, 편집, 조 변환, 저장/내보내기, 하드웨어/AI 환경, 성능)을 먼저 구현하고, 확장 기능(유튜브 AMT, 재생)을 이후에 구현한다.

## Tasks

- [x] 1. 프로젝트 구조 및 핵심 데이터 모델 설정
  - [x] 1.1 Electron + React + TypeScript 프로젝트 초기화
    - Electron main/renderer 프로세스 구조 설정
    - React + TypeScript 빌드 파이프라인 구성 (Vite 또는 Webpack)
    - ESLint, Prettier, tsconfig 설정
    - 디렉토리 구조: `src/main/`, `src/renderer/`, `src/shared/`, `src/native/`
    - _요구사항: 7.1_

  - [x] 1.2 Score_Data 핵심 타입 정의
    - **문서/메타 타입**: `ScoreDocument`, `ScoreMetadata`, `Credit`, `MidiInstrument`
    - **마디 속성 타입**: `MeasureAttributes`, `KeySignature`, `TimeSignature`, `Clef`
    - **음표/쉼표/구조 타입**: `NoteElement`, `RestElement`, `Forward`, `Backup`, `Pitch`, `Duration`
    - **표현 기호 타입**: `BeamInfo`, `TieInfo`, `SlurInfo`, `GraceNoteInfo`, `Articulation`, `Ornament`, `DynamicMark`, `PedalInfo`, `WedgeInfo`, `OctaveShift`, `Fingering`
    - **교정 상태 타입**: `SymbolConfidence`, `AlternativeSymbol`, `ReviewState`, `ReviewItem`, `AlternativeNote`
    - **렌더링/검증/AI 진행 상태 타입**: `BoundingBox`, `ValidationResult`, `OMRProgress`, `AMTProgress`, `FetchProgress`
    - **마디 구조 타입**: `Barline`, `RepeatInfo`, `EndingInfo`, `Direction`, `Lyric`
    - _요구사항: 1.6, 1.7, 2.1, 2.2, 2.6, 3.1, 3.2, 4.5_

  - [ ]* 1.3 Score_Data 타입 단위 테스트
    - 타입 가드 함수 및 팩토리 함수 테스트
    - 기본값 생성 및 유효성 검증 테스트
    - _요구사항: 2.1_

  - [x] 1.4 Electron IPC 통신 레이어 구현
    - IPC 채널 정의 (`IPCChannel` 타입)
    - Main ↔ Renderer 간 타입 안전한 IPC 핸들러 설정
    - Worker Thread 통신 인터페이스 설정
    - 채널별 request/response payload 타입 정의
    - progress/event 채널 분리 (OMR/AMT 진행 상태 등)
    - error payload 공통 형식 정의 (`IPCError` 타입: code, message, details)
    - 채널 목록: `file`, `omr`, `amt`, `youtube`, `edit`, `transpose`, `playback`, `review`
    - _요구사항: 7.1, 8.8_

- [x] 2. 체크포인트 - 프로젝트 빌드 및 Electron 앱 실행 확인
  - Electron 앱이 정상적으로 빌드되고 빈 창이 표시되는지 확인
  - 모든 테스트 통과 확인, 문제 발생 시 사용자에게 질문

- [x] 3. Score Serializer 구현 (MusicXML 직렬화/역직렬화)
  - [x] 3.1 MusicXML → Score_Data 파서 구현
    - MusicXML 3.1 XML 파싱 (DOMParser 또는 fast-xml-parser 활용)
    - `<score-partwise>` 구조에서 `Part`, `Measure`, `Note` 매핑
    - `<attributes>` → `MeasureAttributes` (조표, 박자표, 음자리표) 변환
    - `<pitch>`, `<duration>`, `<type>`, `<dot>` → `Pitch`, `Duration` 변환
    - `<chord/>`, `<tie>`, `<tied>`, `<slur>`, `<beam>`, `<grace>` 변환
    - `<articulations>`, `<ornaments>`, `<dynamics>`, `<lyric>`, `<fingering>` 변환
    - `<barline>`, `<repeat>`, `<ending>`, `<direction>` 변환
    - `IScoreSerializer.fromMusicXML()` 인터페이스 구현
    - MVP에서 지원할 MusicXML subset과 후속 지원 항목을 구분한다.
    - _요구사항: 4.2, 4.5_

  - [x] 3.2 Score_Data → MusicXML 시리얼라이저 구현
    - Score_Data의 모든 필드를 MusicXML 3.1 요소로 역변환
    - `IScoreSerializer.toMusicXML()` 인터페이스 구현
    - `IScoreSerializer.validateMusicXML()` 검증 로직 구현
    - _요구사항: 4.1, 4.5_

  - [x] 3.3 MusicXML 왕복(round-trip) 테스트
    - Score_Data → MusicXML → Score_Data 왕복 일치 검증
    - 다양한 악보 샘플(단선율, 다성부, 피아노 대보표, 가사 포함)에 대한 왕복 테스트
    - 필드 단위 일치율 ≥ 99.5% 검증
    - _요구사항: 4.5, 성능 목표: MusicXML round-trip 성공률 ≥ 99.5%_

- [x] 4. Score Renderer (VexFlow) 및 기본 UI 구현
  - [x] 4.1 VexFlow 기반 악보 렌더링 엔진 구현
    - Score_Data → VexFlow 객체 매핑 로직 구현
    - `Part.measures` → `Stave`, `Note` → `StaveNote`, `Rest` → `StaveNote(isRest)` 변환
    - `Beam`, `StaveTie`, `Curve`(슬러), `GraceNote`, `Tuplet` 렌더링
    - `Articulation`, `Ornament`, `TextDynamics`, `Annotation`(가사) 렌더링
    - `TimeSignature`, `KeySignature`, `Clef` 렌더링
    - SVG/Canvas 출력 모드 지원
    - 다성부(voice 분리), 대보표(grand staff), repeat/ending, direction 계열 요소의 최소 지원 범위를 명시한다. MVP에서 지원할 VexFlow 렌더링 subset과 후속 지원 항목을 구분한다.
    - _요구사항: 1.3, 2.5, 8.1_

  - [x] 4.2 Score Editor UI 레이아웃 구현
    - React 기반 메인 레이아웃 (Toolbar, Score Canvas, Property Panel)
    - 악보 스크롤 및 줌 기능
    - 마디/음표 선택 인터랙션 (클릭, 드래그)
    - _요구사항: 2.1, 2.2, 8.8_

  - [x] 4.3 PDF/PNG 내보내기 렌더러 구현
    - `IScoreRendererExport.toPdf()` 구현 (PDFKit 활용)
    - `IScoreRendererExport.toPng()` 구현 (Canvas → PNG 변환)
    - 페이지 크기, 여백, 스케일 옵션 지원
    - _요구사항: 4.3, 4.4_

  - [x] 4.4 렌더링 성능 테스트
    - 1페이지 악보 렌더링 ≤ 1초 검증
    - UI 프레임 레이트 ≥ 30fps 검증
    - _요구사항: 8.1, 8.8_

- [x] 5. 파일 입출력 기본 흐름 및 Score Controller 구현
  - [x] 5.1 Score Controller 구현
    - `IScoreController` 인터페이스 구현
    - UI 이벤트 → 비즈니스 로직 위임 흐름 구현
    - `openFile()`, `saveFile()` 파일 입출력 연동
    - `executeCommand()`, `undo()`, `redo()` 편집 위임
    - `importImage()`, `importPdf()` 위임 (OMR 파이프라인 연결)
    - `importYouTube()`, `importLocalAudio()` 위임 (AMT 파이프라인 연결, 확장 시 구현)
    - `play()`, `pause()`, `stop()`, `setTempo()` 위임 (재생 엔진 연결, 확장 시 구현)
    - `getDocument()`, `getUndoStack()`, `getRedoStack()` 상태 조회
    - 통합 시나리오에서 Controller가 단일 진입점 역할을 수행하도록 설계
    - _요구사항: 4.1, 4.2_

  - [x] 5.2 파일 열기 다이얼로그 및 MusicXML 열기 흐름 구현
    - Electron 네이티브 파일 열기 다이얼로그 연동
    - MusicXML 파일 열기 흐름 구현 (다이얼로그 → 파서 → Score_Data → 렌더링)
    - 지원하지 않는 파일 형식 오류 처리
    - _요구사항: 4.2, 1.4_

- [x] 6. 체크포인트 - MusicXML 파일 열기 및 악보 표시 확인
  - MusicXML 파일을 열어 Score_Data로 변환하고 VexFlow로 렌더링되는지 확인
  - Score Controller를 통한 파일 열기 흐름이 정상 동작하는지 확인
  - 모든 테스트 통과 확인, 문제 발생 시 사용자에게 질문

- [ ] 7. Command Manager 및 Score Editor 편집 기능 구현
  - [ ] 7.1 Command Manager (Undo/Redo) 구현
    - `ICommandManager` 인터페이스 구현 (execute, undo, redo)
    - `EditCommand` 패턴 구현: 각 명령이 `execute()`와 `undo()` 메서드를 가짐
    - Undo/Redo 스택 관리
    - _요구사항: 2.3_

  - [ ] 7.2 음표/쉼표 편집 명령 구현
    - `addNote`, `deleteNote`, `modifyNote` 명령 구현
    - `addRest`, `deleteRest` 명령 구현
    - 음높이, 음길이, 아티큘레이션 수정 명령 구현
    - 속성 패널 UI 연동 (음표 선택 시 속성 표시/수정)
    - 편집 결과 실시간 렌더링 반영
    - _요구사항: 2.1, 2.2, 2.5, 8.4_

  - [ ] 7.3 마디 편집 명령 구현
    - `addMeasure`, `deleteMeasure`, `copyMeasure`, `pasteMeasure` 명령 구현
    - 조표, 박자표, 음자리표 변경 명령 구현
    - _요구사항: 2.4_

  - [ ] 7.4 가사 편집 기능 구현
    - `addLyric`, `modifyLyric`, `deleteLyric` 명령 구현
    - 가사를 해당 음표 아래에 정렬 배치하는 로직
    - _요구사항: 2.6_

  - [ ] 7.5 타이/슬러/아티큘레이션 편집 명령 구현
    - `addTie`, `deleteTie`, `addSlur`, `deleteSlur` 명령 구현
    - `addArticulation`, `deleteArticulation` 명령 구현
    - _요구사항: 2.1_

  - [ ]* 7.6 편집 기능 단위 테스트
    - 각 EditCommand의 execute/undo 왕복 검증
    - Undo/Redo 스택 동작 검증
    - 편집 반응 시간 ≤ 100ms 검증
    - _요구사항: 2.3, 8.4_

- [ ] 8. 파일 저장/내보내기 및 오류 처리 구현
  - [ ] 8.1 파일 저장/내보내기 다이얼로그 및 오류 처리 구현
    - Electron 네이티브 파일 저장 다이얼로그 연동
    - MusicXML 저장 흐름 구현
    - PDF/PNG 내보내기 흐름 구현
    - 디스크 공간 부족 오류 처리 ("저장 공간이 부족합니다..." 메시지)
    - 지원하지 않는 파일 형식 오류 처리
    - _요구사항: 4.1, 4.3, 4.4, 4.6, 1.4_

- [ ] 9. Transposer (조 변환) 엔진 구현
  - [ ] 9.1 규칙 기반 조 변환 로직 구현
    - `ITransposer.transpose()` 구현: 모든 음표를 지정된 반음 간격만큼 이동
    - 조표(`KeySignature.fifths`) 자동 갱신
    - 임시표(`Pitch.alter`) 변환된 조에 맞게 갱신
    - 장조/단조 관계 유지 로직
    - `detectKey()`, `getTargetKey()` 구현
    - _요구사항: 3.1, 3.2, 3.4, 7.7_

  - [ ] 9.2 부분 범위 조 변환 구현
    - `MeasureRange` 기반 선택 범위 조 변환
    - 변환 후 Score_Editor 즉시 시각적 갱신
    - _요구사항: 3.3, 3.5_

  - [ ] 9.3 조 변환 UI 연동
    - 목표 조 선택 UI (드롭다운 또는 반음 단위 슬라이더)
    - 마디 범위 선택 상태에서 조 변환 요청 흐름
    - Score Controller를 통한 transpose 위임
    - _요구사항: 3.1, 3.3, 3.5_

  - [ ] 9.4 조 변환 왕복(round-trip) 테스트
    - N반음 올린 후 N반음 내리면 원래 Score_Data와 동일한지 검증
    - 다양한 조(장조/단조, 샤프/플랫 조)에 대한 왕복 테스트
    - 100마디 기준 조 변환 시간 ≤ 500ms 검증
    - _요구사항: 3.6, 8.5_

- [ ] 10. 체크포인트 - 편집 및 조 변환 통합 확인
  - MusicXML 열기 → 편집 → 조 변환 → 저장 흐름이 정상 동작하는지 확인
  - 모든 테스트 통과 확인, 문제 발생 시 사용자에게 질문

- [ ] 11. Native Bridge Layer (CoreML/ONNX) 구현
  - [ ] 11.1 N-API 네이티브 모듈 구조 설정
    - `node-addon-api` 기반 네이티브 모듈 프로젝트 설정 (binding.gyp)
    - C++ ↔ TypeScript 인터페이스 정의
    - _요구사항: 7.3, 7.4_

  - [ ] 11.2 CoreML Runtime Bridge 구현
    - `INativeBridge.coreml` 인터페이스 구현 (Objective-C++ 바인딩)
    - `loadModel()`, `predict()`, `unloadModel()` 구현
    - `isAvailable()` Apple Neural Engine 가용성 확인
    - `getMemoryUsage()` 메모리 사용량 모니터링
    - _요구사항: 7.3, 7.4, 7.5, 7.6_

  - [ ] 11.3 ONNX Runtime Bridge 구현
    - `INativeBridge.onnx` 인터페이스 구현
    - `loadModel()`, `predict()`, `unloadModel()` 구현
    - CoreML 불가 시 폴백 런타임으로 동작
    - _요구사항: 7.3_

  - [ ] 11.4 Model Loader 구현
    - CoreML 우선, ONNX 폴백 전략 구현
    - 모델 로드 실패 시 오류 메시지 처리 ("AI 모델을 로드할 수 없습니다..." 메시지)
    - 모델 메모리 사용량 모니터링 (OMR ≤ 2GB, AMT ≤ 4GB)
    - OMR/AMT 모델 동시 로드 방지 로직
    - _요구사항: 7.4, 7.5, 7.8, 1.8, 1.9_

  - [ ]* 11.5 Native Bridge 단위 테스트
    - 모델 로드/언로드 사이클 테스트
    - 메모리 사용량 상한 검증
    - CoreML → ONNX 폴백 동작 검증
    - _요구사항: 7.5, 7.6_

- [ ] 12. OMR Engine 구현
  - [ ] 12.1 OMR 전처리 파이프라인 구현
    - 이미지 입력 처리 (PNG, JPEG, BMP 지원)
    - PDF → 이미지 변환 (pdf.js 활용, 페이지별 처리)
    - 이미지 정규화, 리사이즈, 텐서 변환
    - 지원하지 않는 파일 형식 오류 처리
    - _요구사항: 1.1, 1.2, 1.4_

  - [ ] 12.2 OMR 추론 및 후처리 구현
    - Native Bridge를 통한 OMR_Model 추론 호출
    - 모델 출력 → 음악 기호 검출/분류 후처리
    - 각 기호에 신뢰도 점수(0.0~1.0) 부여
    - 대체 후보(alternatives) 상위 3~5개 생성
    - 인식 실패 영역(`failedRegions`) 검출
    - Worker Thread에서 비동기 실행
    - _요구사항: 1.1, 1.5, 1.6, 1.8, 1.9_

  - [ ] 12.3 OMR 결과 → Score_Data 변환 구현
    - 인식된 기호를 Score_Data 구조로 조립
    - 마디 구분, 보표 할당, 성부(voice) 추론
    - 진행 상태 콜백 (`OMRProgress`) 구현
    - _요구사항: 1.1, 1.2, 1.3_

  - [ ] 12.4 OMR 교정 UI (Review Panel) 구현
    - 신뢰도 0.7 미만 기호 시각적 강조 (0.5 미만: 빨간색, 0.5~0.7: 주황색)
    - 대체 후보 팝업 표시 (상위 3~5개)
    - 키보드 네비게이션 (Tab/Shift+Tab, 숫자 키 선택)
    - 일괄 승인 기능 (임계값 이상 일괄 처리)
    - 교정 진행률 표시 바
    - `IReviewPanel` 인터페이스 구현
    - _요구사항: 1.5, 1.6, 1.7_

  - [ ]* 12.5 OMR 파이프라인 단위 테스트
    - 전처리 (이미지 정규화, PDF 변환) 테스트
    - 후처리 (기호 분류, 신뢰도 계산) 테스트
    - Score_Data 변환 정합성 테스트
    - 1페이지 OMR 처리 시간 ≤ 30초 검증
    - _요구사항: 1.1, 1.2, 8.6_

- [ ] 13. 체크포인트 - OMR 인식 및 교정 흐름 확인
  - 이미지/PDF 업로드 → OMR 인식 → 교정 → 편집 → 저장 흐름이 정상 동작하는지 확인
  - 모든 테스트 통과 확인, 문제 발생 시 사용자에게 질문

- [ ] 14. 통합 및 성능 최적화 (MVP 완성)
  - [ ] 14.1 MVP 통합 시나리오 연결
    - 시나리오 1: PDF 업로드 → OMR → 편집 → 조 변환 → MusicXML 저장 흐름 연결
    - 시나리오 4: 이미지 업로드 → OMR → 신뢰도 낮은 기호 교정 → 저장 흐름 연결
    - Score Controller를 통한 전체 흐름 통합
    - _요구사항: 통합 시나리오 1, 4_

  - [ ] 14.2 성능 최적화 및 메모리 관리
    - 앱 시작 시간 ≤ 5초 (모델 제외) 최적화
    - AI 모델 로드 시간 ≤ 10초 최적화
    - 전체 앱 메모리 ≤ 8GB 상한 관리
    - Electron 메모리 최적화 (불필요한 모듈 지연 로딩)
    - _요구사항: 7.5, 7.6, 8.2, 8.3_

  - [ ] 14.3 MVP 통합 테스트
    - End-to-End 시나리오 1, 4 자동화 테스트
    - 성능 지표 검증 (렌더링, 편집 반응, 조 변환 시간)
    - _요구사항: 8.1, 8.4, 8.5, 8.6_

- [ ] 15. 체크포인트 - MVP 기능 전체 확인
  - 모든 MVP 필수 기능이 정상 동작하는지 확인
  - 모든 테스트 통과 확인, 문제 발생 시 사용자에게 질문

- [ ] 16. [확장] YouTube Fetcher 및 AMT Engine 구현
  - [ ] 16.1 YouTube Fetcher 구현
    - `IYouTubeFetcher` 인터페이스 구현
    - `validateUrl()`: 유튜브 URL 유효성 검증 및 영상 정보 조회
    - `extractAudio()`: yt-dlp subprocess를 통한 오디오 추출 (WAV 변환)
    - 진행 상태 콜백 (`FetchProgress`) 구현
    - 유효하지 않은 URL 오류 처리 ("유효하지 않은 유튜브 URL입니다..." 메시지)
    - 네트워크 연결 확인 로직
    - _요구사항: 5.1, 5.5_

  - [ ] 16.2 AMT 전처리/추론/후처리 파이프라인 구현
    - 오디오 전처리 (WAV → 스펙트로그램/텐서 변환)
    - Native Bridge를 통한 AMT_Model 추론 호출 (Basic Pitch)
    - 모델 출력 → MIDI 데이터 → Score_Data 변환
    - 각 음표에 신뢰도 점수 부여 및 대체 후보 생성
    - 악기 타입별 최적화 (`AMTOptions.instrument`)
    - 템포, 조 자동 감지
    - 음악 신호 미감지 오류 처리
    - Worker Thread에서 비동기 실행
    - _요구사항: 5.2, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ] 16.3 AMT 교정 UI 연동
    - OMR Review Panel 재활용 (AMT 신뢰도 기반 교정)
    - AMT 결과 → Score_Editor 표시 흐름 연결
    - _요구사항: 5.4, 5.7_

  - [ ] 16.4 로컬 오디오 가져오기 흐름 구현
    - Electron 네이티브 파일 선택 다이얼로그 (WAV, MP3, FLAC 등 오디오 파일)
    - 지원 오디오 포맷 검증 및 비지원 형식 오류 처리
    - ScoreController `importLocalAudio()` 경로 연결
    - 로컬 오디오 → AMT 전처리/추론/후처리 → Review Panel → Score Editor 흐름 연결
    - 설계 문서의 "오프라인 기능으로서의 로컬 오디오 AMT"와 일치
    - _요구사항: 5.2, 5.3, 5.4, 7.2_

  - [ ]* 16.5 AMT 파이프라인 단위 테스트
    - 오디오 전처리 테스트
    - Score_Data 변환 정합성 테스트
    - 3분 오디오 채보 시간 ≤ 360초 검증
    - _요구사항: 5.2, 5.3, 8.7_

- [ ] 17. [확장] Playback Engine (악보 재생) 구현
  - [ ] 17.1 MIDI 변환 및 재생 엔진 구현
    - `IPlaybackEngine` 인터페이스 구현
    - Score_Data → MIDI 이벤트 변환 로직
    - Tone.js / Web Audio API 기반 MIDI 합성 재생
    - `play()`, `pause()`, `stop()` 구현
    - `setTempo()` BPM 조절 구현
    - _요구사항: 6.1, 6.3, 6.4, 6.5_

  - [ ] 17.2 재생 위치 동기화 UI 구현
    - 현재 재생 위치 시각적 강조 (Score_Editor 연동)
    - `PlaybackPosition` 기반 실시간 위치 업데이트
    - 재생 컨트롤 UI (재생/일시정지/정지 버튼, 템포 슬라이더)
    - _요구사항: 6.2, 6.3, 6.4, 6.5_

  - [ ]* 17.3 재생 기능 단위 테스트
    - MIDI 변환 정확성 테스트
    - 재생/일시정지/정지 상태 전환 테스트
    - _요구사항: 6.1, 6.3, 6.4_

- [ ] 18. [확장] 통합 시나리오 연결 및 최종 확인
  - [ ] 18.1 확장 기능 통합 시나리오 연결
    - 시나리오 2: 유튜브 URL → AMT 채보 → 편집 → PDF 내보내기 흐름 연결
    - 시나리오 3: MusicXML 열기 → 편집 → 재생 → 조 변환 → PNG 내보내기 흐름 연결
    - _요구사항: 통합 시나리오 2, 3_

  - [ ]* 18.2 확장 기능 통합 테스트
    - End-to-End 시나리오 2, 3 자동화 테스트
    - AMT 성능 지표 검증
    - _요구사항: 8.7_

- [ ] 19. 최종 체크포인트 - 전체 기능 확인
  - MVP 및 확장 기능 전체가 정상 동작하는지 확인
  - 모든 테스트 통과 확인, 문제 발생 시 사용자에게 질문

## 참고 사항

- `*` 표시된 태스크는 선택 사항으로, 빠른 MVP 구현을 위해 건너뛸 수 있습니다
- 태스크 1~15는 MVP 필수 기능 (요구사항 1, 2, 3, 4, 7, 8)
- 태스크 16~19는 확장 기능 (요구사항 5, 6)
- 각 태스크는 해당 요구사항을 참조하여 추적 가능합니다
- 체크포인트에서 점진적으로 기능을 검증합니다
- 3.3, 4.4, 9.4, 14.3 테스트 태스크는 핵심 품질 보증을 위해 필수로 지정되었습니다
