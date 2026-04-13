/**
 * Toolbar 컴포넌트
 *
 * 파일 조작, 편집(Undo/Redo), 조 변환, 줌, 재생 컨트롤을 제공하는 상단 툴바.
 */

import React from 'react';

export interface ToolbarProps {
  /** 현재 줌 레벨 (1.0 = 100%) */
  zoom: number;
  /** 줌 변경 콜백 */
  onZoomChange: (zoom: number) => void;
  /** 현재 마디 너비 (px) */
  staveWidth: number;
  /** 마디 너비 변경 콜백 */
  onStaveWidthChange: (width: number) => void;
  /** 파일 열기 콜백 */
  onOpen?: () => void;
  /** 파일 저장 콜백 */
  onSave?: () => void;
  /** PDF 내보내기 콜백 */
  onExportPdf?: () => void;
  /** PNG 내보내기 콜백 */
  onExportPng?: () => void;
  /** OMR 가져오기 콜백 */
  onOMRImport?: () => void;
  /** Undo 콜백 */
  onUndo?: () => void;
  /** Redo 콜백 */
  onRedo?: () => void;
  /** 조 변환 콜백 */
  onTranspose?: () => void;
  /** Undo 가능 여부 */
  canUndo?: boolean;
  /** Redo 가능 여부 */
  canRedo?: boolean;
  /** 재생 콜백 */
  onPlay?: () => void;
  /** 일시정지 콜백 */
  onPause?: () => void;
  /** 정지 콜백 */
  onStop?: () => void;
  /** 현재 재생 상태 */
  playbackState?: 'stopped' | 'playing' | 'paused';
  /** 현재 템포 */
  tempo?: number;
  /** 템포 변경 콜백 */
  onTempoChange?: (bpm: number) => void;
  /** 마디 번호 표시 여부 */
  showMeasureNumbers?: boolean;
  /** 마디 번호 표시 변경 콜백 */
  onShowMeasureNumbersChange?: (show: boolean) => void;
  /** 설정 열기 콜백 */
  onSettings?: () => void;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;

const Toolbar: React.FC<ToolbarProps> = ({
  zoom,
  onZoomChange,
  staveWidth,
  onStaveWidthChange,
  onOpen,
  onSave,
  onExportPdf,
  onExportPng,
  onOMRImport,
  onUndo,
  onRedo,
  onTranspose,
  canUndo = false,
  canRedo = false,
  onPlay,
  onPause,
  onStop,
  playbackState = 'stopped',
  tempo = 120,
  onTempoChange,
  showMeasureNumbers = true,
  onShowMeasureNumbersChange,
  onSettings,
}) => {
  const handleZoomIn = () => {
    onZoomChange(Math.min(zoom + ZOOM_STEP, ZOOM_MAX));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(zoom - ZOOM_STEP, ZOOM_MIN));
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Score editor toolbar">
      {/* File operations */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onOpen} title="Open file">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M1 3.5A1.5 1.5 0 012.5 2h3.879a1.5 1.5 0 011.06.44l1.122 1.12A1.5 1.5 0 009.62 4H13.5A1.5 1.5 0 0115 5.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z" fill="currentColor"/></svg>
          <span>Open</span>
        </button>
        <button className="toolbar-btn" onClick={onSave} title="Save file">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M2 2.5A1.5 1.5 0 013.5 1h6.586a1.5 1.5 0 011.06.44l2.415 2.414A1.5 1.5 0 0114 4.914V12.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-10zM5 11h6V8H5v3z" fill="currentColor"/></svg>
          <span>Save</span>
        </button>
        <button className="toolbar-btn" onClick={onExportPdf} title="Export as PDF">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M4 1.5A1.5 1.5 0 015.5 0h4.586a1.5 1.5 0 011.06.44l2.415 2.414A1.5 1.5 0 0114 3.914V14.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 014 14.5v-13z" fill="currentColor"/></svg>
          <span>PDF</span>
        </button>
        <button className="toolbar-btn" onClick={onExportPng} title="Export as PNG">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M1 4.5A1.5 1.5 0 012.5 3h11A1.5 1.5 0 0115 4.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 11.5v-7zM4 7a1 1 0 100-2 1 1 0 000 2zm8 3.5L9.5 7 7 10l-2-1.5L3 11h9v-.5z" fill="currentColor"/></svg>
          <span>PNG</span>
        </button>
        <button className="toolbar-btn" onClick={onOMRImport} title="Import via OMR">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.656a5 5 0 110-10 5 5 0 010 10z" fill="currentColor"/></svg>
          <span>OMR</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Edit operations */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onUndo} disabled={!canUndo} title="Undo">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M8 3a5 5 0 110 10A5 5 0 018 3zM6.5 7.5L4 5l2.5-2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>Undo</span>
        </button>
        <button className="toolbar-btn" onClick={onRedo} disabled={!canRedo} title="Redo">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M8 3a5 5 0 100 10A5 5 0 008 3zM9.5 7.5L12 5 9.5 2.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>Redo</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Transpose */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onTranspose} title="Transpose">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M8 2v10M5 9l3 3 3-3M3 14h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>Transpose</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Measure numbers toggle */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${showMeasureNumbers ? 'active' : ''}`}
          onClick={() => onShowMeasureNumbersChange?.(!showMeasureNumbers)}
          title="Toggle measure numbers"
        >
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M4 3h2v10H4zM8 5h2v8H8zM12 1h2v12h-2z" fill="currentColor" opacity="0.8"/><path d="M2 14h12" stroke="currentColor" strokeWidth="1.5"/></svg>
          <span>No.</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Note density (staveWidth slider controls density scaling: 350=1.0x) */}
      <div className="toolbar-group">
        <span className="zoom-display" title="Note density scaling">
          {(staveWidth / 350).toFixed(1)}x
        </span>
        <input
          type="range"
          min={200}
          max={600}
          step={25}
          value={staveWidth}
          onChange={(e) => onStaveWidthChange(Number(e.target.value))}
          title="Note density — adjusts spacing between notes"
          style={{ width: 80, accentColor: '#cba6f7' }}
        />
      </div>

      <div className="toolbar-spacer" />

      {/* Zoom controls */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN} title="Zoom out">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
        <span className="zoom-display">{Math.round(zoom * 100)}%</span>
        <button className="toolbar-btn" onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX} title="Zoom in">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Playback controls */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${playbackState === 'playing' ? 'active' : ''}`}
          onClick={playbackState === 'playing' ? onPause : onPlay}
          title={playbackState === 'playing' ? 'Pause' : 'Play'}
        >
          {playbackState === 'playing' ? (
            <svg className="tb-icon" viewBox="0 0 16 16"><rect x="4" y="3" width="3" height="10" rx="0.5" fill="currentColor"/><rect x="9" y="3" width="3" height="10" rx="0.5" fill="currentColor"/></svg>
          ) : (
            <svg className="tb-icon" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>
          )}
        </button>
        <button className="toolbar-btn" onClick={onStop} disabled={playbackState === 'stopped'} title="Stop">
          <svg className="tb-icon" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/></svg>
        </button>
        <input
          type="number"
          className="tempo-input"
          min={20}
          max={300}
          value={tempo}
          onChange={(e) => onTempoChange?.(parseInt(e.target.value, 10) || 120)}
          title="Tempo (BPM)"
          style={{ width: 48, marginLeft: 4 }}
        />
        <span className="zoom-display">BPM</span>
      </div>

      <div className="toolbar-separator" />

      {/* Settings */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onSettings} title="Settings">
          <svg className="tb-icon" viewBox="0 0 16 16"><path d="M8 10a2 2 0 100-4 2 2 0 000 4z" fill="currentColor"/><path d="M7 1l-.6 1.8a5.5 5.5 0 00-1.7 1L3 3.2l-1 1.7 1.4 1.2a5.5 5.5 0 000 1.8L2 9.1l1 1.7 1.7-.6a5.5 5.5 0 001.7 1L7 13h2l.6-1.8a5.5 5.5 0 001.7-1l1.7.6 1-1.7-1.4-1.2a5.5 5.5 0 000-1.8L14 4.9l-1-1.7-1.7.6a5.5 5.5 0 00-1.7-1L9 1H7z" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
