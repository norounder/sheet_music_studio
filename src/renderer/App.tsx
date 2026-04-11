/**
 * App 루트 컴포넌트
 *
 * 메인 레이아웃: Toolbar (상단) + ScoreEditor (중앙) + PropertyPanel (우측)
 * 데모용 C Major Scale ScoreData를 생성하여 앱 시작 시 표시한다.
 * 파일 열기: Toolbar Open → IPC file:open → ScoreController.openFile → 렌더링
 */

import React, { useState, useCallback, useRef } from 'react';
import type { ScoreData, NoteElement } from '@shared/types';
import { ScoreController } from '@shared/controller/ScoreController';
import { FILE_CHANNELS } from '@shared/ipc/channels';
import type { IPCResponse } from '@shared/ipc/payloads';
import Toolbar from './components/Toolbar';
import ScoreEditor from './components/ScoreEditor';
import PropertyPanel, { type SelectedElement } from './components/PropertyPanel';
import './styles/editor.css';

/** file:open IPC 응답 데이터 */
interface FileOpenDialogResult {
  filePath: string;
  content: string;
}

/** 데모용 C Major Scale ScoreData (C D E F | G A B C, 4/4 treble clef) */
function createDemoScoreData(): ScoreData {
  const divisions = 1; // 1 division = quarter note

  const makeNote = (
    id: string,
    step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B',
    octave: number,
  ): NoteElement => ({
    type: 'note',
    id,
    pitch: { step, octave },
    duration: { divisions, noteType: 'quarter', dots: 0 },
    voice: 1,
    staff: 1,
  });

  return {
    parts: [
      {
        id: 'P1',
        name: 'Piano',
        staves: 1,
        measures: [
          {
            number: 1,
            attributes: {
              divisions,
              keySignature: { fifths: 0, mode: 'major' },
              timeSignature: { beats: 4, beatType: 4 },
              clef: [{ sign: 'G', line: 2, staffNumber: 1 }],
            },
            elements: [
              makeNote('n1', 'C', 4),
              makeNote('n2', 'D', 4),
              makeNote('n3', 'E', 4),
              makeNote('n4', 'F', 4),
            ],
            directions: [],
          },
          {
            number: 2,
            elements: [
              makeNote('n5', 'G', 4),
              makeNote('n6', 'A', 4),
              makeNote('n7', 'B', 4),
              makeNote('n8', 'C', 5),
            ],
            directions: [],
          },
        ],
      },
    ],
    credits: [{ type: 'title', text: 'C Major Scale' }],
  };
}

const App: React.FC = () => {
  const [scoreData, setScoreData] = useState<ScoreData>(createDemoScoreData);
  const [zoom, setZoom] = useState(1.0);
  const [staveWidth, setStaveWidth] = useState(350);
  const [selected, setSelected] = useState<SelectedElement | null>(null);

  const controllerRef = useRef<ScoreController>(new ScoreController());

  const handleOpen = useCallback(async () => {
    try {
      const response = await (window.electronAPI.invoke(
        FILE_CHANNELS.OPEN,
      ) as Promise<IPCResponse<FileOpenDialogResult | null>>);

      if (!response.success) {
        const errMsg = response.error?.message ?? '파일을 열 수 없습니다.';
        alert(errMsg);
        return;
      }

      // 사용자가 다이얼로그를 취소한 경우
      if (response.data === null) {
        return;
      }

      const { content } = response.data;
      const doc = controllerRef.current.openFile(content);
      setScoreData(doc.scoreData);
    } catch (err) {
      console.error('File open error:', err);
      alert('파일을 여는 중 오류가 발생했습니다.');
    }
  }, []);

  const handleSave = useCallback(() => {
    try {
      const xmlContent = controllerRef.current.saveFile();
      console.log('Saved MusicXML content length:', xmlContent.length);
    } catch (err) {
      console.error('File save error:', err);
      alert('저장할 문서가 없습니다.');
    }
  }, []);

  const handlePropertyChange = useCallback(
    (property: string, value: unknown) => {
      console.log('Property change:', property, value);
    },
    [],
  );

  const renderConfig = React.useMemo(() => ({ staveWidth }), [staveWidth]);

  return (
    <div className="editor-layout">
      <Toolbar
        zoom={zoom}
        onZoomChange={setZoom}
        staveWidth={staveWidth}
        onStaveWidthChange={setStaveWidth}
        onOpen={handleOpen}
        onSave={handleSave}
        canUndo={false}
        canRedo={false}
      />
      <div className="main-area">
        <ScoreEditor
          scoreData={scoreData}
          zoom={zoom}
          onZoomChange={setZoom}
          onSelectionChange={setSelected}
          selected={selected}
          renderConfig={renderConfig}
        />
        <PropertyPanel
          selected={selected}
          onPropertyChange={handlePropertyChange}
        />
      </div>
    </div>
  );
};

export default App;
