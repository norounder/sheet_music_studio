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
  createAddMeasureCommand,
  createDeleteMeasureCommand,
  createChangeKeySignatureCommand,
  createChangeTimeSignatureCommand,
  createChangeClefCommand,
  createAddTieCommand,
  createDeleteTieCommand,
  createAddSlurCommand,
  createDeleteSlurCommand,
  createAddLyricCommand,
  createModifyLyricCommand,
  createDeleteLyricCommand,
} from '@shared/controller/commands';
import { FILE_CHANNELS } from '@shared/ipc/channels';
import type { IPCResponse } from '@shared/ipc/payloads';
import type { ReviewState } from '@shared/types/review';
import type { ScoreDocument } from '@shared/types/document';
import Toolbar from './components/Toolbar';
import ScoreEditor from './components/ScoreEditor';
import PropertyPanel, { type SelectedElement } from './components/PropertyPanel';
import TransposeDialog from './components/TransposeDialog';
import OMRImportDialog from './components/OMRImportDialog';
import ReviewPanel from './components/ReviewPanel';
import { createTransposeCommand } from '@shared/controller/commands';
import { PlaybackEngine, type PlaybackState, type PlaybackPosition } from './playback';
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
  const [showTransposeDialog, setShowTransposeDialog] = useState(false);
  const [omrDialogOpen, setOmrDialogOpen] = useState(false);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [tempo, setTempo] = useState(120);
  const [playbackPosition, setPlaybackPosition] = useState<PlaybackPosition | null>(null);
  const playbackRef = useRef<PlaybackEngine>(new PlaybackEngine());
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
      // Delete key deletes selected note (Backspace 제외 — 텍스트 편집과 충돌 방지)
      if (e.key === 'Delete') {
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

  const handleSave = useCallback(async () => {
    try {
      const xmlContent = controllerRef.current.saveFile();
      const response = await (window.electronAPI.invoke(
        FILE_CHANNELS.SAVE,
        { xmlContent },
      ) as Promise<IPCResponse<{ savedPath: string } | null>>);

      if (!response.success) {
        alert(response.error?.message ?? '파일을 저장할 수 없습니다.');
      } else if (response.data) {
        console.log('Saved:', response.data.savedPath);
      }
    } catch (err) {
      console.error('File save error:', err);
      alert('저장할 문서가 없습니다.');
    }
  }, []);

  const handleExportPdf = useCallback(async () => {
    try {
      const sd = controllerRef.current.getScoreData();
      if (!sd) { alert('내보낼 문서가 없습니다.'); return; }

      const { ExportRenderer } = await import('./engine/ExportRenderer');
      const exporter = new ExportRenderer();
      const uint8 = await exporter.toPdf(sd);

      const response = await (window.electronAPI.invoke(
        FILE_CHANNELS.EXPORT,
        { format: 'pdf', binaryData: Array.from(uint8) },
      ) as Promise<IPCResponse<{ exportedPath: string } | null>>);

      if (!response.success) {
        alert(response.error?.message ?? 'PDF 내보내기에 실패했습니다.');
      } else if (response.data) {
        console.log('Exported PDF:', response.data.exportedPath);
      }
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF 내보내기 중 오류가 발생했습니다.');
    }
  }, []);

  const handleExportPng = useCallback(async () => {
    try {
      const sd = controllerRef.current.getScoreData();
      if (!sd) { alert('내보낼 문서가 없습니다.'); return; }

      const { ExportRenderer } = await import('./engine/ExportRenderer');
      const exporter = new ExportRenderer();
      const uint8 = await exporter.toPng(sd);

      const response = await (window.electronAPI.invoke(
        FILE_CHANNELS.EXPORT,
        { format: 'png', binaryData: Array.from(uint8) },
      ) as Promise<IPCResponse<{ exportedPath: string } | null>>);

      if (!response.success) {
        alert(response.error?.message ?? 'PNG 내보내기에 실패했습니다.');
      } else if (response.data) {
        console.log('Exported PNG:', response.data.exportedPath);
      }
    } catch (err) {
      console.error('PNG export error:', err);
      alert('PNG 내보내기 중 오류가 발생했습니다.');
    }
  }, []);

  const handleTranspose = useCallback(
    (semitones: number, startMeasure?: number, endMeasure?: number) => {
      try {
        const cmd = createTransposeCommand(semitones, startMeasure, endMeasure);
        controllerRef.current.executeCommand(cmd);
      } catch (err) {
        console.error('Transpose error:', err);
        alert('조 변환 중 오류가 발생했습니다.');
      }
    },
    [],
  );

  // ─── OMR handlers ───
  const handleOMRImport = useCallback(() => {
    setOmrDialogOpen(true);
  }, []);

  const handleOMRComplete = useCallback(
    (document: ScoreDocument, processingTimeMs: number) => {
      setOmrDialogOpen(false);
      controllerRef.current.setScoreData(document.scoreData);
      setScoreData(document.scoreData);
      setCanUndo(false);
      setCanRedo(false);
      setSelected(null);

      if (document.reviewState && document.reviewState.items.length > 0) {
        setReviewState(document.reviewState);
      }

      console.log(`OMR completed in ${(processingTimeMs / 1000).toFixed(1)}s`);
    },
    [],
  );

  const handleOMRCancel = useCallback(() => {
    setOmrDialogOpen(false);
  }, []);

  const handleOMRError = useCallback((message: string) => {
    console.error('OMR error:', message);
  }, []);

  const handleReviewAccept = useCallback(
    (itemId: string) => {
      if (!reviewState) return;
      const updated: ReviewState = {
        ...reviewState,
        items: reviewState.items.map((item) =>
          item.id === itemId ? { ...item, status: 'accepted' as const } : item,
        ),
      };
      setReviewState(updated);
    },
    [reviewState],
  );

  const handleReviewSkip = useCallback(
    (itemId: string) => {
      if (!reviewState) return;
      const updated: ReviewState = {
        ...reviewState,
        items: reviewState.items.map((item) =>
          item.id === itemId ? { ...item, status: 'skipped' as const } : item,
        ),
      };
      setReviewState(updated);
    },
    [reviewState],
  );

  const handleReviewClose = useCallback(() => {
    setReviewState(null);
  }, []);

  // Playback engine lifecycle
  useEffect(() => {
    const pb = playbackRef.current;
    const unsub1 = pb.onStateChange(setPlaybackState);
    const unsub2 = pb.onPositionChange(setPlaybackPosition);
    return () => { unsub1(); unsub2(); pb.dispose(); };
  }, []);

  // Reload score into playback engine when scoreData changes
  useEffect(() => {
    playbackRef.current.loadScore(scoreData, tempo);
  }, [scoreData, tempo]);

  const handlePlay = useCallback(() => {
    playbackRef.current.play().catch((err) => console.error('Playback error:', err));
  }, []);
  const handlePause = useCallback(() => playbackRef.current.pause(), []);
  const handleStop = useCallback(() => playbackRef.current.stop(), []);
  const handleTempoChange = useCallback((bpm: number) => {
    setTempo(bpm);
    playbackRef.current.setTempo(bpm);
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

      // ─── Measure operations ───
      if (property.startsWith('measure.') && sel?.type === 'measure' && sel.measureIndex != null) {
        const mIdx = sel.measureIndex;
        try {
          let cmd;
          switch (property) {
            case 'measure.addAfter':
              cmd = createAddMeasureCommand(0, mIdx);
              break;
            case 'measure.delete':
              cmd = createDeleteMeasureCommand(currentScoreData, 0, mIdx);
              break;
            case 'measure.keySignature':
              cmd = createChangeKeySignatureCommand(currentScoreData, 0, mIdx, {
                fifths: value as number,
                mode: 'major',
              });
              break;
            case 'measure.timeSignature': {
              const ts = value as { beats: number; beatType: number };
              cmd = createChangeTimeSignatureCommand(currentScoreData, 0, mIdx, ts);
              break;
            }
            case 'measure.clef':
              cmd = createChangeClefCommand(currentScoreData, 0, mIdx, {
                sign: value as 'G' | 'F' | 'C' | 'percussion',
                line: value === 'G' ? 2 : value === 'F' ? 4 : 3,
                staffNumber: 1,
              });
              break;
          }
          if (cmd) controllerRef.current.executeCommand(cmd);
        } catch (err) {
          console.error('Measure property change error:', err);
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

          // ─── Tie ───
          case 'tie.toggle': {
            const noteEl = sel.element as NoteElement;
            if (noteEl.tie) {
              cmd = createDeleteTieCommand(currentScoreData, elementId);
            } else {
              cmd = createAddTieCommand(currentScoreData, elementId, { type: 'start' });
            }
            break;
          }

          // ─── Slur ───
          case 'slur.addStart':
            cmd = createAddSlurCommand(currentScoreData, elementId, {
              type: 'start',
              number: 1,
            });
            break;
          case 'slur.delete':
            cmd = createDeleteSlurCommand(currentScoreData, elementId, value as number);
            break;

          // ─── Lyrics ───
          case 'lyric.add': {
            const noteEl2 = sel.element as NoteElement;
            const nextNum = (noteEl2.lyrics?.length ?? 0) + 1;
            cmd = createAddLyricCommand(currentScoreData, elementId, {
              number: nextNum,
              syllabic: 'single',
              text: '',
            });
            break;
          }
          case 'lyric.modify': {
            const lm = value as { number: number; text: string };
            cmd = createModifyLyricCommand(currentScoreData, elementId, lm.number, lm.text);
            break;
          }
          case 'lyric.delete':
            cmd = createDeleteLyricCommand(currentScoreData, elementId, value as number);
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
        onExportPdf={handleExportPdf}
        onExportPng={handleExportPng}
        onOMRImport={handleOMRImport}
        canUndo={canUndoState}
        canRedo={canRedoState}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onTranspose={() => setShowTransposeDialog(true)}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        playbackState={playbackState}
        tempo={tempo}
        onTempoChange={handleTempoChange}
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
          playbackPosition={playbackPosition}
        />
        <PropertyPanel
          selected={selected}
          onPropertyChange={handlePropertyChange}
        />
      </div>
      {showTransposeDialog && (
        <TransposeDialog
          totalMeasures={scoreData.parts[0]?.measures.length ?? 0}
          onTranspose={handleTranspose}
          onClose={() => setShowTransposeDialog(false)}
        />
      )}
      {omrDialogOpen && (
        <OMRImportDialog
          onComplete={handleOMRComplete}
          onCancel={handleOMRCancel}
          onError={handleOMRError}
        />
      )}
      {reviewState && (
        <ReviewPanel
          reviewState={reviewState}
          onAccept={handleReviewAccept}
          onSkip={handleReviewSkip}
          onClose={handleReviewClose}
        />
      )}
    </div>
  );
};

export default App;
