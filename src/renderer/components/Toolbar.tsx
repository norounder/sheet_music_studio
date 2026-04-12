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
  /** 마디 번호 표시 여부 */
  showMeasureNumbers?: boolean;
  /** 마디 번호 표시 변경 콜백 */
  onShowMeasureNumbersChange?: (show: boolean) => void;
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
  onUndo,
  onRedo,
  onTranspose,
  canUndo = false,
  canRedo = false,
  showMeasureNumbers = true,
  onShowMeasureNumbersChange,
}) => {
  const handleZoomIn = () => {
    onZoomChange(Math.min(zoom + ZOOM_STEP, ZOOM_MAX));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(zoom - ZOOM_STEP, ZOOM_MIN));
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Score editor toolbar">
      <span className="toolbar-title">Sheet Music Studio</span>

      {/* File operations */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onOpen} title="Open file">
          <span className="icon">📂</span>
          <span>Open</span>
        </button>
        <button className="toolbar-btn" onClick={onSave} title="Save file">
          <span className="icon">💾</span>
          <span>Save</span>
        </button>
        <button className="toolbar-btn" onClick={onExportPdf} title="Export as PDF">
          <span className="icon">📄</span>
          <span>PDF</span>
        </button>
        <button className="toolbar-btn" onClick={onExportPng} title="Export as PNG">
          <span className="icon">🖼️</span>
          <span>PNG</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Edit operations */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <span className="icon">↩️</span>
          <span>Undo</span>
        </button>
        <button
          className="toolbar-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <span className="icon">↪️</span>
          <span>Redo</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Transpose */}
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onTranspose} title="Transpose">
          <span className="icon">🎵</span>
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
          <span className="icon">#</span>
          <span>Measure No.</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Note spacing */}
      <div className="toolbar-group">
        <span className="zoom-display" title="Measure width">↔ {staveWidth}</span>
        <input
          type="range"
          min={200}
          max={600}
          step={25}
          value={staveWidth}
          onChange={(e) => onStaveWidthChange(Number(e.target.value))}
          title="Measure width"
          style={{ width: 80, accentColor: '#cba6f7' }}
        />
      </div>

      <div className="toolbar-spacer" />

      {/* Zoom controls */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={handleZoomOut}
          disabled={zoom <= ZOOM_MIN}
          title="Zoom out"
        >
          <span className="icon">➖</span>
        </button>
        <span className="zoom-display">{Math.round(zoom * 100)}%</span>
        <button
          className="toolbar-btn"
          onClick={handleZoomIn}
          disabled={zoom >= ZOOM_MAX}
          title="Zoom in"
        >
          <span className="icon">➕</span>
        </button>
      </div>

      <div className="toolbar-separator" />

      {/* Playback controls (disabled for now) */}
      <div className="toolbar-group">
        <button className="toolbar-btn" disabled title="Play (coming soon)">
          <span className="icon">▶️</span>
        </button>
        <button className="toolbar-btn" disabled title="Pause (coming soon)">
          <span className="icon">⏸️</span>
        </button>
        <button className="toolbar-btn" disabled title="Stop (coming soon)">
          <span className="icon">⏹️</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
