/**
 * App 루트 컴포넌트
 *
 * 메인 레이아웃: Toolbar (상단) + ScoreEditor (중앙) + PropertyPanel (우측)
 * 데모용 C Major Scale ScoreData를 생성하여 앱 시작 시 표시한다.
 * 파일 열기: Toolbar Open → IPC file:open → ScoreController.openFile → 렌더링
 * 편집: PropertyPanel → handlePropertyChange → command → ScoreController → re-render
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ScoreData, NoteElement, RestElement, NoteType, PitchStep, Articulation } from '@shared/types';
import { ScoreController } from '@shared/controller/ScoreController';
import {
  findElementLocation,
  createModifyPitchCommand,
  createModifyNoteCommand,
  createModifyDurationWithFillCommand,
  createToggleArticulationCommand,
  createDeleteNoteWithRestCommand,
  createConvertRestToNoteCommand,
  createModifyRestDurationCommand,
} from '@shared/controller/commands';
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
  const controllerRef = useRef<ScoreController>(new ScoreController());
  const [scoreData, setScoreData] = useState<ScoreData>(createDemoScoreData);
  const [zoom, setZoom] = useState(1.0);
  const [staveWidth, setStaveWidth] = useState(350);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [canUndoState, setCanUndo] = useState(false);
  const [canRedoState, setCanRedo] = useState(false);
  const [showMeasureNumbers, setShowMeasureNumbers] = useState(true);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Initialize controller with demo data
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized) {
      controllerRef.current.setScoreData(createDemoScoreData());
      setInitialized(true);
    }
  }, [initialized]);

  // Subscribe to controller changes
  useEffect(() => {
    return controllerRef.current.onChange((newData) => {
      setScoreData(newData);
      setCanUndo(controllerRef.current.canUndo());
      setCanRedo(controllerRef.current.canRedo());

      // Re-resolve selection by ID
      const sel = selectedRef.current;
      if (sel?.type === 'multi' && sel.elements) {
        // 다중 선택 re-resolve
        const resolved: (NoteElement | RestElement)[] = [];
        for (const elem of sel.elements) {
          const loc = findElementLocation(newData, elem.id);
          if (loc) {
            const el = newData.parts[loc.partIndex].measures[loc.measureIndex].elements[loc.elementIndex];
            if (el.type === 'note' || el.type === 'rest') {
              resolved.push(el as NoteElement | RestElement);
            }
          }
        }
        if (resolved.length > 1) {
          setSelected({ type: 'multi', elements: resolved });
        } else if (resolved.length === 1) {
          setSelected({ type: resolved[0].type as 'note' | 'rest', element: resolved[0] });
        } else {
          setSelected(null);
        }
      } else if (sel?.element) {
        const loc = findElementLocation(newData, sel.element.id);
        if (loc) {
          const el =
            newData.parts[loc.partIndex].measures[loc.measureIndex].elements[
              loc.elementIndex
            ];
          if (el.type === 'note') {
            setSelected({ type: 'note', element: el });
          } else if (el.type === 'rest') {
            setSelected({ type: 'rest', element: el as RestElement });
          }
        } else {
          setSelected(null);
        }
      }
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        controllerRef.current.undo();
      } else if (
        (mod && e.key === 'y') ||
        (mod && e.shiftKey && e.key === 'Z')
      ) {
        e.preventDefault();
        controllerRef.current.redo();
      }
      // Delete key deletes selected note
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = selectedRef.current;
        const sd = controllerRef.current.getScoreData();
        if (sel?.element?.type === 'note' && sd) {
          e.preventDefault();
          try {
            const cmd = createDeleteNoteWithRestCommand(sd, sel.element.id);
            controllerRef.current.executeCommand(cmd);
          } catch (err) {
            console.error('Delete error:', err);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUndo = useCallback(() => controllerRef.current.undo(), []);
  const handleRedo = useCallback(() => controllerRef.current.redo(), []);

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

      if (response.data === null) {
        return;
      }

      const { content } = response.data;
      const doc = controllerRef.current.openFile(content);
      setScoreData(doc.scoreData);
      setCanUndo(false);
      setCanRedo(false);
      setSelected(null);
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
      const currentScoreData = controllerRef.current.getScoreData();
      const sel = selectedRef.current;
      if (!currentScoreData) return;

      // ─── Multi-selection batch operations ───
      if (property.startsWith('multi.') && sel?.type === 'multi' && sel.elements) {
        const batchProp = property.slice(6); // 'multi.stem' → 'stem'
        try {
          for (const elem of sel.elements) {
            const sd = controllerRef.current.getScoreData();
            if (!sd) break;
            let cmd;
            if (batchProp === 'stem' && elem.type === 'note') {
              cmd = createModifyNoteCommand(sd, elem.id, {
                stem: value as NoteElement['stem'],
              });
            } else if (batchProp === 'duration.noteType') {
              cmd = createModifyDurationWithFillCommand(sd, elem.id, {
                noteType: value as NoteType,
              });
            } else if (batchProp === 'delete' && elem.type === 'note') {
              cmd = createDeleteNoteWithRestCommand(sd, elem.id);
            }
            if (cmd) controllerRef.current.executeCommand(cmd);
          }
        } catch (err) {
          console.error('Batch property change error:', err);
        }
        return;
      }

      if (!sel?.element) return;
      const elementId = sel.element.id;

      try {
        let cmd;
        switch (property) {
          // ─── Note properties ───
          case 'pitch.step':
            cmd = createModifyPitchCommand(currentScoreData, elementId, {
              step: value as PitchStep,
            });
            break;
          case 'pitch.octave':
            cmd = createModifyPitchCommand(currentScoreData, elementId, {
              octave: value as number,
            });
            break;
          case 'pitch.alter':
            cmd = createModifyPitchCommand(currentScoreData, elementId, {
              alter: value as number,
            });
            break;
          case 'duration.noteType':
            cmd = createModifyDurationWithFillCommand(currentScoreData, elementId, {
              noteType: value as NoteType,
            });
            break;
          case 'duration.dots':
            cmd = createModifyDurationWithFillCommand(currentScoreData, elementId, {
              dots: value as number,
            });
            break;
          case 'stem':
            cmd = createModifyNoteCommand(currentScoreData, elementId, {
              stem: value as NoteElement['stem'],
            });
            break;
          case 'articulation.toggle':
            cmd = createToggleArticulationCommand(
              currentScoreData,
              elementId,
              value as Articulation,
            );
            break;

          // ─── Delete note (replace with rest) ───
          case 'note.delete':
            cmd = createDeleteNoteWithRestCommand(currentScoreData, elementId);
            break;

          // ─── Rest properties ───
          case 'rest.duration.noteType':
            cmd = createModifyRestDurationCommand(currentScoreData, elementId, {
              noteType: value as NoteType,
            });
            break;
          case 'rest.duration.dots':
            cmd = createModifyRestDurationCommand(currentScoreData, elementId, {
              dots: value as number,
            });
            break;

          // ─── Convert rest to note ───
          case 'rest.convertToNote': {
            const pitch = value as { step: string; octave: number };
            cmd = createConvertRestToNoteCommand(
              currentScoreData,
              elementId,
              pitch,
            );
            break;
          }

          default:
            console.warn('Unknown property:', property);
            return;
        }
        controllerRef.current.executeCommand(cmd);
      } catch (err) {
        console.error('Property change error:', err);
      }
    },
    [],
  );

  const renderConfig = React.useMemo(() => ({ staveWidth, showMeasureNumbers }), [staveWidth, showMeasureNumbers]);

  return (
    <div className="editor-layout">
      <Toolbar
        zoom={zoom}
        onZoomChange={setZoom}
        staveWidth={staveWidth}
        onStaveWidthChange={setStaveWidth}
        onOpen={handleOpen}
        onSave={handleSave}
        canUndo={canUndoState}
        canRedo={canRedoState}
        onUndo={handleUndo}
        onRedo={handleRedo}
        showMeasureNumbers={showMeasureNumbers}
        onShowMeasureNumbersChange={setShowMeasureNumbers}
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
