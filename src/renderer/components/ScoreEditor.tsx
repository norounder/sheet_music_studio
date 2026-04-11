/**
 * ScoreEditor 컴포넌트
 *
 * ScoreCanvas를 포함하는 메인 편집 영역.
 * 스크롤, 줌(CSS transform), 선택 상태를 관리한다.
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { ScoreData } from '@shared/types';
import type { SelectedElement } from './PropertyPanel';
import ScoreCanvas from './ScoreCanvas';
import type { RenderConfig } from '../engine';

export interface ScoreEditorProps {
  /** 렌더링할 악보 데이터 */
  scoreData: ScoreData;
  /** 현재 줌 레벨 (1.0 = 100%) */
  zoom: number;
  /** 줌 변경 콜백 */
  onZoomChange: (zoom: number) => void;
  /** 선택 변경 콜백 */
  onSelectionChange: (selected: SelectedElement | null) => void;
  /** 현재 선택 */
  selected: SelectedElement | null;
  /** 렌더링 설정 */
  renderConfig?: Partial<RenderConfig>;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;

const ScoreEditor: React.FC<ScoreEditorProps> = ({
  scoreData,
  zoom,
  onZoomChange,
  onSelectionChange,
  selected,
  renderConfig,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // 컨테이너 너비 측정 (리사이즈 대응)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const measure = () => {
      // padding/margin 제외한 실제 사용 가능 너비
      setContainerWidth(el.clientWidth - 64);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // staveWidth 기반으로 한 줄에 들어갈 마디 수 자동 계산
  const autoConfig = useMemo(() => {
    const staveWidth = renderConfig?.staveWidth ?? 350;
    const firstMeasureExtra = 60;
    const availableWidth = containerWidth / zoom;
    // 첫 마디는 extra 포함, 나머지는 staveWidth
    const measuresPerLine = Math.max(1, Math.floor((availableWidth - firstMeasureExtra) / staveWidth));
    return { ...renderConfig, measuresPerLine };
  }, [renderConfig, containerWidth, zoom]);
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const newZoom = Math.min(Math.max(zoom + delta, ZOOM_MIN), ZOOM_MAX);
        onZoomChange(newZoom);
      }
    },
    [zoom, onZoomChange],
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // If clicking on the background (not on a note), clear selection
      const target = e.target as HTMLElement;
      const isNoteElement =
        target.closest('.vf-stavenote') ||
        target.closest('.vf-note') ||
        target.tagName === 'rect' ||
        target.tagName === 'path';

      if (!isNoteElement) {
        onSelectionChange(null);
      }
    },
    [onSelectionChange],
  );

  return (
    <div
      ref={editorRef}
      className="score-editor"
      onWheel={handleWheel}
      onClick={handleCanvasClick}
      role="region"
      aria-label="Score editor canvas"
    >
      <div
        className="score-editor-canvas-wrapper"
        style={{ transform: `scale(${zoom})` }}
      >
        <ScoreCanvas scoreData={scoreData} config={autoConfig} />
      </div>
    </div>
  );
};

export default ScoreEditor;
