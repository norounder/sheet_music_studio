/**
 * ScoreEditor 컴포넌트
 *
 * ScoreCanvas를 포함하는 메인 편집 영역.
 * 스크롤, 줌(CSS transform), 선택 상태를 관리한다.
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import type { ScoreData, NoteElement, RestElement } from '@shared/types';
import type { SelectedElement } from './PropertyPanel';
import { findElementLocation } from '@shared/controller/commands/scoreDataUtils';
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
      const target = e.target as HTMLElement;

      // data-element-id를 가진 가장 가까운 조상 SVG 그룹 찾기
      const noteGroup = target.closest('[data-element-id]') as HTMLElement | null;

      if (noteGroup) {
        const elementId = noteGroup.getAttribute('data-element-id');
        if (elementId) {
          const loc = findElementLocation(scoreData, elementId);
          if (loc) {
            const el = scoreData.parts[loc.partIndex].measures[loc.measureIndex].elements[loc.elementIndex];
            if (el.type === 'note') {
              onSelectionChange({ type: 'note', element: el as NoteElement });
              return;
            } else if (el.type === 'rest') {
              onSelectionChange({ type: 'rest', element: el as RestElement });
              return;
            }
          }
        }
      }

      // 배경 클릭 시 선택 해제
      onSelectionChange(null);
    },
    [onSelectionChange, scoreData],
  );

  // 선택된 음표에 시각적 하이라이트 적용
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    // 이전 하이라이트 제거
    container.querySelectorAll('.note-selected').forEach((el) => {
      el.classList.remove('note-selected');
    });

    // 새 하이라이트 적용
    if (selected?.element) {
      const el = container.querySelector(
        `[data-element-id="${selected.element.id}"]`,
      );
      if (el) {
        el.classList.add('note-selected');
      }
    }
  }, [selected]);

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
