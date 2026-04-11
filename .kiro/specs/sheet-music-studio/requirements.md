# 요구사항 문서

## 소개

Sheet Music Studio는 악보를 디지털로 인식, 편집, 생성할 수 있는 통합 악보 제작 프로그램이다. 사용자는 이미지나 PDF 형태의 악보를 입력하여 편집 가능한 디지털 악보로 변환하고, 조 변환(Transposition) 등의 편집 기능을 활용할 수 있다. 또한 유튜브 영상의 오디오를 분석하여 자동으로 악보를 생성하는 기능을 제공한다.

악보 인식(OMR)과 자동 채보(AMT)에는 딥러닝 기반 AI 모델을 활용하며, 모든 AI 추론은 맥북 에어 M5 기본형(16GB 통합 메모리)에서 로컬로 실행된다. AI 모델은 Apple CoreML 또는 ONNX Runtime으로 최적화하여 배포하고, 편집·조 변환·저장 등 나머지 기능은 규칙 기반 로직으로 구현한다.

## 용어집

- **Sheet_Music_Studio**: 악보 인식, 편집, 생성 기능을 제공하는 통합 악보 제작 시스템
- **OMR_Engine**: 딥러닝 기반 CNN 모델을 활용하여 이미지 또는 PDF에서 음악 기호를 인식하고 디지털 악보 데이터로 변환하는 광학 음악 인식(Optical Music Recognition) 엔진
- **Score_Editor**: 디지털 악보 데이터를 시각적으로 표시하고 편집할 수 있는 악보 편집기
- **Transposer**: 악보의 조(Key)를 변환하는 조 변환 모듈
- **AMT_Engine**: 딥러닝 기반 모델(Basic Pitch, MT3 등)을 활용하여 오디오 신호를 분석하고 음표, 리듬, 박자 등의 음악 정보를 추출하는 자동 채보(Automatic Music Transcription) 엔진
- **YouTube_Fetcher**: 유튜브 영상에서 오디오 스트림을 추출하는 모듈
- **MusicXML**: 악보 데이터를 표현하는 표준 XML 기반 포맷
- **Score_Data**: 음표, 쉼표, 박자, 조표, 다이나믹 등 악보 구성 요소를 포함하는 내부 악보 데이터 구조
- **Score_Renderer**: Score_Data를 시각적 악보 이미지로 렌더링하는 모듈
- **Score_Serializer**: Score_Data를 MusicXML 등 외부 포맷으로 직렬화하거나 역직렬화하는 모듈
- **OMR_Model**: OMR_Engine에서 사용하는 CNN 기반 딥러닝 모델로, 악보 이미지에서 음악 기호(음표, 쉼표, 조표, 박자표 등)를 검출하고 분류하는 경량 모델
- **AMT_Model**: AMT_Engine에서 사용하는 딥러닝 기반 오디오-투-MIDI 변환 모델로, 오디오 신호에서 음높이, 음길이, 박자를 추출하는 경량 모델 (Basic Pitch, MT3 등)
- **CoreML_Runtime**: Apple CoreML 프레임워크 기반의 모델 추론 런타임으로, Apple Neural Engine 및 Apple Silicon GPU를 활용하여 최적화된 추론을 수행하는 환경
- **ONNX_Runtime**: ONNX(Open Neural Network Exchange) 형식의 모델을 실행하는 크로스 플랫폼 추론 런타임
- **Target_Hardware**: 맥북 에어 M5 기본형 (Apple Silicon M5 칩, 16GB 통합 메모리, Apple Neural Engine)

## 요구사항

### 요구사항 1: 이미지/PDF 악보 인식 (OMR) [필수 - MVP]

**사용자 스토리:** 악보 사용자로서, 이미지나 PDF 형태의 악보를 업로드하여 편집 가능한 디지털 악보로 변환하고 싶다. 이를 통해 기존 종이 악보를 디지털화하여 편집할 수 있다.

#### 인수 조건

1. WHEN 사용자가 PNG, JPEG, 또는 BMP 형식의 악보 이미지를 업로드하면, THE OMR_Engine SHALL CNN 기반 OMR_Model을 사용하여 이미지에서 음표, 쉼표, 박자표, 조표, 음자리표를 인식하고 Score_Data로 변환한다.
2. WHEN 사용자가 PDF 형식의 악보 파일을 업로드하면, THE OMR_Engine SHALL PDF의 각 페이지를 이미지로 변환한 후 OMR_Model을 사용하여 음악 기호를 인식하고 Score_Data로 변환한다.
3. WHEN OMR_Engine이 악보 인식을 완료하면, THE Score_Editor SHALL 인식된 Score_Data를 시각적 악보로 렌더링하여 사용자에게 표시한다.
4. IF 업로드된 파일이 지원하지 않는 형식이면, THEN THE Sheet_Music_Studio SHALL "지원하지 않는 파일 형식입니다. PNG, JPEG, BMP, PDF 형식을 사용해 주세요."라는 오류 메시지를 표시한다.
5. IF OMR_Engine이 악보 이미지에서 음악 기호를 인식하지 못하면, THEN THE OMR_Engine SHALL 인식 실패 영역을 사용자에게 표시하고 수동 입력을 안내한다.
6. WHEN OMR_Engine이 인식을 완료하면, THE OMR_Engine SHALL 각 인식된 기호에 대해 0.0에서 1.0 사이의 신뢰도 점수를 Score_Data에 포함한다.
7. WHILE 신뢰도 점수가 0.7 미만인 기호가 존재하면, THE Score_Editor SHALL 해당 기호를 시각적으로 강조 표시하여 사용자가 검토할 수 있도록 한다.
8. THE OMR_Engine SHALL OMR_Model을 CoreML_Runtime 또는 ONNX_Runtime을 통해 로컬에서 실행하며, Target_Hardware에서 추론을 수행한다.
9. WHEN OMR_Engine이 모델을 로드하면, THE OMR_Engine SHALL OMR_Model의 메모리 사용량을 2GB 이하로 유지한다.

### 요구사항 2: 악보 편집 [필수 - MVP]

**사용자 스토리:** 악보 사용자로서, 인식된 디지털 악보를 편집하고 싶다. 이를 통해 악보의 오류를 수정하거나 원하는 대로 악보를 수정할 수 있다.

#### 인수 조건

1. THE Score_Editor SHALL 음표, 쉼표, 박자표, 조표, 음자리표, 다이나믹 기호의 추가, 삭제, 수정 기능을 제공한다.
2. WHEN 사용자가 음표를 선택하면, THE Score_Editor SHALL 해당 음표의 음높이, 음길이, 아티큘레이션을 수정할 수 있는 속성 패널을 표시한다.
3. WHEN 사용자가 편집 작업을 수행하면, THE Score_Editor SHALL 실행 취소(Undo) 및 다시 실행(Redo) 기능을 지원한다.
4. WHEN 사용자가 마디를 선택하면, THE Score_Editor SHALL 마디 삽입, 삭제, 복사, 붙여넣기 기능을 제공한다.
5. THE Score_Renderer SHALL 편집 중인 Score_Data를 실시간으로 시각적 악보에 반영하여 표시한다.
6. WHEN 사용자가 악보에 가사를 입력하면, THE Score_Editor SHALL 가사를 해당 음표 아래에 정렬하여 배치한다.

### 요구사항 3: 조 변환 (Transposition) [필수 - MVP]

**사용자 스토리:** 악보 사용자로서, 악보의 조를 원하는 키로 변환하고 싶다. 이를 통해 다른 악기나 음역에 맞게 악보를 조정할 수 있다.

#### 인수 조건

1. WHEN 사용자가 목표 조(Key)를 선택하면, THE Transposer SHALL Score_Data의 모든 음표를 지정된 반음 간격만큼 이동하여 조를 변환한다.
2. WHEN Transposer가 조 변환을 수행하면, THE Transposer SHALL 조표, 임시표를 변환된 조에 맞게 자동으로 갱신한다.
3. WHEN 사용자가 특정 마디 범위를 선택한 상태에서 조 변환을 요청하면, THE Transposer SHALL 선택된 마디 범위에 대해서만 조 변환을 수행한다.
4. THE Transposer SHALL 장조와 단조 간의 관계를 유지하며 조 변환을 수행한다.
5. WHEN 조 변환이 완료되면, THE Score_Editor SHALL 변환된 악보를 즉시 시각적으로 갱신하여 표시한다.
6. FOR ALL 유효한 Score_Data에 대해, 조를 N반음 올린 후 N반음 내리면 원래 Score_Data와 동일한 결과를 생성한다 (왕복 속성).

### 요구사항 4: 악보 저장 및 내보내기 [필수 - MVP]

**사용자 스토리:** 악보 사용자로서, 편집한 악보를 다양한 형식으로 저장하고 내보내고 싶다. 이를 통해 악보를 공유하거나 인쇄할 수 있다.

#### 인수 조건

1. WHEN 사용자가 저장을 요청하면, THE Score_Serializer SHALL Score_Data를 MusicXML 형식으로 직렬화하여 파일로 저장한다.
2. WHEN 사용자가 MusicXML 파일을 열기 요청하면, THE Score_Serializer SHALL MusicXML 파일을 역직렬화하여 Score_Data로 변환한다.
3. WHEN 사용자가 PDF 내보내기를 요청하면, THE Score_Renderer SHALL Score_Data를 PDF 형식의 악보로 렌더링하여 내보낸다.
4. WHEN 사용자가 이미지 내보내기를 요청하면, THE Score_Renderer SHALL Score_Data를 PNG 형식의 악보 이미지로 렌더링하여 내보낸다.
5. FOR ALL 유효한 Score_Data에 대해, MusicXML로 직렬화한 후 역직렬화하면 원래 Score_Data와 동일한 결과를 생성한다 (왕복 속성).
6. IF 파일 저장 중 디스크 공간이 부족하면, THEN THE Sheet_Music_Studio SHALL "저장 공간이 부족합니다. 디스크 공간을 확보한 후 다시 시도해 주세요."라는 오류 메시지를 표시한다.

### 요구사항 5: 유튜브 영상 기반 자동 채보 (AMT) [선택 - 확장]

**사용자 스토리:** 악보 사용자로서, 유튜브 영상의 URL을 입력하여 자동으로 악보를 생성하고 싶다. 이를 통해 좋아하는 음악의 악보를 손쉽게 얻을 수 있다.

#### 인수 조건

1. WHEN 사용자가 유튜브 URL을 입력하면, THE YouTube_Fetcher SHALL 해당 영상에서 오디오 스트림을 WAV 형식으로 추출한다.
2. WHEN YouTube_Fetcher가 오디오 추출을 완료하면, THE AMT_Engine SHALL 딥러닝 기반 AMT_Model을 사용하여 오디오 신호를 분석하고 음높이, 음길이, 박자, 템포 정보를 추출한다.
3. WHEN AMT_Engine이 음악 정보 추출을 완료하면, THE AMT_Engine SHALL 추출된 정보를 Score_Data로 변환한다.
4. WHEN AMT_Engine이 Score_Data 변환을 완료하면, THE Score_Editor SHALL 생성된 악보를 시각적으로 표시하여 사용자가 편집할 수 있도록 한다.
5. IF 입력된 URL이 유효하지 않거나 접근할 수 없는 영상이면, THEN THE Sheet_Music_Studio SHALL "유효하지 않은 유튜브 URL입니다. URL을 확인한 후 다시 시도해 주세요."라는 오류 메시지를 표시한다.
6. IF 영상의 오디오에서 음악 신호를 감지하지 못하면, THEN THE AMT_Engine SHALL "음악 신호를 감지하지 못했습니다. 음악이 포함된 영상인지 확인해 주세요."라는 오류 메시지를 표시한다.
7. WHEN AMT_Engine이 채보를 수행하면, THE AMT_Engine SHALL 각 인식된 음표에 대해 0.0에서 1.0 사이의 신뢰도 점수를 Score_Data에 포함한다.
8. WHILE 사용자가 악기 종류를 지정하면, THE AMT_Engine SHALL 지정된 악기의 음역과 특성에 맞게 채보를 최적화한다.
9. THE AMT_Engine SHALL AMT_Model을 CoreML_Runtime 또는 ONNX_Runtime을 통해 로컬에서 실행하며, Target_Hardware에서 추론을 수행한다.
10. WHEN AMT_Engine이 모델을 로드하면, THE AMT_Engine SHALL AMT_Model의 메모리 사용량을 4GB 이하로 유지한다.

### 요구사항 6: 악보 재생 [선택 - 확장]

**사용자 스토리:** 악보 사용자로서, 편집 중인 악보를 소리로 재생하여 들어보고 싶다. 이를 통해 악보의 정확성을 청각적으로 확인할 수 있다.

#### 인수 조건

1. WHEN 사용자가 재생 버튼을 누르면, THE Sheet_Music_Studio SHALL Score_Data를 MIDI 신호로 변환하여 오디오로 재생한다.
2. WHEN 악보가 재생 중일 때, THE Score_Editor SHALL 현재 재생 중인 위치를 시각적으로 강조 표시한다.
3. WHEN 사용자가 일시정지 버튼을 누르면, THE Sheet_Music_Studio SHALL 재생을 일시정지하고 현재 위치를 유지한다.
4. WHEN 사용자가 정지 버튼을 누르면, THE Sheet_Music_Studio SHALL 재생을 중지하고 재생 위치를 악보 시작점으로 초기화한다.
5. WHEN 사용자가 템포를 조절하면, THE Sheet_Music_Studio SHALL 지정된 BPM(Beats Per Minute)에 맞게 재생 속도를 변경한다.

### 요구사항 7: 타겟 하드웨어 및 AI 모델 실행 환경 (비기능 요구사항) [필수 - MVP]

**사용자 스토리:** 악보 사용자로서, 맥북 에어 M5 기본형에서 모든 AI 기능을 원활하게 사용하고 싶다. 이를 통해 클라우드 연결 없이도 악보 인식과 자동 채보를 수행할 수 있다.

#### 인수 조건

1. THE Sheet_Music_Studio SHALL Target_Hardware(맥북 에어 M5 기본형, Apple Silicon M5 칩, 16GB 통합 메모리, Apple Neural Engine)에서 모든 기능을 실행할 수 있도록 설계한다.
2. THE Sheet_Music_Studio SHALL 모든 AI 모델 추론을 네트워크 연결 없이 로컬에서 수행한다.
3. THE Sheet_Music_Studio SHALL AI 모델을 Apple CoreML 형식 또는 ONNX 형식으로 최적화하여 배포한다.
4. WHERE Apple Neural Engine이 사용 가능한 환경이면, THE Sheet_Music_Studio SHALL CoreML_Runtime을 통해 Apple Neural Engine을 우선 활용하여 AI 모델 추론을 수행한다.
5. WHILE OMR_Model과 AMT_Model이 동시에 메모리에 로드되지 않는 경우, THE Sheet_Music_Studio SHALL 전체 AI 모델 메모리 사용량을 4GB 이하로 유지한다.
6. WHILE OMR_Engine 또는 AMT_Engine이 추론을 수행하는 동안, THE Sheet_Music_Studio SHALL 전체 애플리케이션 메모리 사용량을 8GB 이하로 유지한다.
7. THE Sheet_Music_Studio SHALL 편집, 조 변환, 저장, 재생 기능을 규칙 기반 로직으로 구현하며, AI 모델 추론을 사용하지 않는다.
8. WHEN AI 모델 로드에 실패하면, THEN THE Sheet_Music_Studio SHALL "AI 모델을 로드할 수 없습니다. 애플리케이션을 재시작하거나 모델 파일을 확인해 주세요."라는 오류 메시지를 표시한다.

### 요구사항 8: 성능 및 응답 시간 (비기능 요구사항) [필수 - MVP]

**사용자 스토리:** 악보 사용자로서, 악보 렌더링, 편집, 변환 등의 작업이 빠르게 처리되기를 원한다. 이를 통해 작업 흐름이 끊기지 않고 원활한 사용 경험을 얻을 수 있다.

#### 인수 조건

1. THE Score_Renderer SHALL 1페이지 분량의 악보를 1초 이내에 렌더링한다.
2. THE Sheet_Music_Studio SHALL AI 모델 로드를 제외한 애플리케이션 시작 시간을 5초 이내로 유지한다.
3. WHEN Sheet_Music_Studio가 AI 모델을 초기 로드하면, THE Sheet_Music_Studio SHALL 모델 로드 시간을 10초 이내로 완료한다.
4. WHEN 사용자가 음표 추가, 삭제, 또는 수정 편집 작업을 수행하면, THE Score_Editor SHALL 100밀리초 이내에 편집 결과를 반영한다.
5. WHEN 사용자가 조 변환을 요청하면, THE Transposer SHALL 100마디 기준 악보에 대해 500밀리초 이내에 조 변환을 완료한다.
6. WHEN 사용자가 1페이지 분량의 악보 이미지를 업로드하면, THE OMR_Engine SHALL 30초 이내에 OMR 인식 처리를 완료한다.
7. WHEN AMT_Engine이 오디오 채보를 수행하면, THE AMT_Engine SHALL 오디오 길이의 2배 이내의 시간으로 채보 처리를 완료한다.
8. WHILE 사용자가 악보를 편집하거나 탐색하는 동안, THE Sheet_Music_Studio SHALL UI 프레임 레이트를 30fps 이상으로 유지한다.

## 통합 테스트 시나리오

여러 요구사항이 연계되는 End-to-End 시나리오를 정의하여, 기능 간 통합이 올바르게 동작하는지 검증한다.

### 시나리오 1: PDF 업로드 → OMR 인식 → 편집 → 조 변환 → MusicXML 저장

**관련 요구사항:** 요구사항 1 [필수], 요구사항 2 [필수], 요구사항 3 [필수], 요구사항 4 [필수]

#### 시나리오 흐름

1. WHEN 사용자가 PDF 형식의 악보 파일을 업로드하면, THE OMR_Engine SHALL 악보를 인식하여 Score_Data로 변환하고, THE Score_Editor SHALL 인식된 악보를 시각적으로 표시한다.
2. WHEN 사용자가 인식된 악보에서 음표를 수정하면, THE Score_Editor SHALL 편집 결과를 실시간으로 악보에 반영한다.
3. WHEN 사용자가 편집된 악보에 대해 조 변환을 요청하면, THE Transposer SHALL 모든 음표를 지정된 반음 간격만큼 이동하고, THE Score_Editor SHALL 변환된 악보를 즉시 표시한다.
4. WHEN 사용자가 저장을 요청하면, THE Score_Serializer SHALL 최종 Score_Data를 MusicXML 형식으로 직렬화하여 파일로 저장한다.

### 시나리오 2: 유튜브 URL 입력 → AMT 채보 → 편집 → PDF 내보내기

**관련 요구사항:** 요구사항 5 [선택], 요구사항 2 [필수], 요구사항 4 [필수]

#### 시나리오 흐름

1. WHEN 사용자가 유튜브 URL을 입력하면, THE YouTube_Fetcher SHALL 오디오 스트림을 추출하고, THE AMT_Engine SHALL 오디오를 분석하여 Score_Data로 변환한다.
2. WHEN AMT_Engine이 채보를 완료하면, THE Score_Editor SHALL 생성된 악보를 시각적으로 표시한다.
3. WHEN 사용자가 채보된 악보에서 음표를 편집하면, THE Score_Editor SHALL 편집 결과를 실시간으로 반영한다.
4. WHEN 사용자가 PDF 내보내기를 요청하면, THE Score_Renderer SHALL 최종 Score_Data를 PDF 형식으로 렌더링하여 내보낸다.

### 시나리오 3: MusicXML 열기 → 편집 → 재생 → 조 변환 → 이미지 내보내기

**관련 요구사항:** 요구사항 4 [필수], 요구사항 2 [필수], 요구사항 6 [선택], 요구사항 3 [필수]

#### 시나리오 흐름

1. WHEN 사용자가 MusicXML 파일을 열기 요청하면, THE Score_Serializer SHALL 파일을 역직렬화하여 Score_Data로 변환하고, THE Score_Editor SHALL 악보를 시각적으로 표시한다.
2. WHEN 사용자가 악보를 편집하면, THE Score_Editor SHALL 편집 결과를 실시간으로 반영한다.
3. WHEN 사용자가 재생 버튼을 누르면, THE Sheet_Music_Studio SHALL Score_Data를 MIDI 신호로 변환하여 재생하고, THE Score_Editor SHALL 현재 재생 위치를 시각적으로 강조 표시한다.
4. WHEN 사용자가 조 변환을 요청하면, THE Transposer SHALL 악보의 조를 변환하고, THE Score_Editor SHALL 변환된 악보를 즉시 표시한다.
5. WHEN 사용자가 이미지 내보내기를 요청하면, THE Score_Renderer SHALL 최종 Score_Data를 PNG 형식의 악보 이미지로 렌더링하여 내보낸다.

### 시나리오 4: 이미지 업로드 → OMR 인식 → 신뢰도 낮은 기호 수동 수정 → 저장

**관련 요구사항:** 요구사항 1 [필수], 요구사항 2 [필수], 요구사항 4 [필수]

#### 시나리오 흐름

1. WHEN 사용자가 악보 이미지를 업로드하면, THE OMR_Engine SHALL 이미지에서 음악 기호를 인식하고 각 기호에 신뢰도 점수를 포함한 Score_Data로 변환한다.
2. WHILE 신뢰도 점수가 0.7 미만인 기호가 존재하면, THE Score_Editor SHALL 해당 기호를 시각적으로 강조 표시하여 사용자에게 검토를 안내한다.
3. WHEN 사용자가 강조 표시된 기호를 선택하여 수동으로 수정하면, THE Score_Editor SHALL 수정된 기호를 Score_Data에 반영하고 시각적 악보를 갱신한다.
4. WHEN 사용자가 모든 검토를 완료하고 저장을 요청하면, THE Score_Serializer SHALL 최종 Score_Data를 MusicXML 형식으로 직렬화하여 파일로 저장한다.
