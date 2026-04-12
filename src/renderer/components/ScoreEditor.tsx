/**
 * ScoreEditor 컴포넌트
 *
 * ScoreCanvas를 포함하는 메인 편집 영역.
 * 스크롤, 줌(CSS transform), 선택 상태를 관리한다.
 * 클릭으로 단일 선택, 드래그로 다중 선택을 지원한다.
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

/** 드래그 판정 최소 거리 (px) */
const DRAG_THRESHOLD = 5;

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
}

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
  const [drag, setDrag] = useState<DragState | null>(null);

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

  /** 에디터 기준 마우스 좌표 계산 (스크롤 보정) */
  const getEditorRelativePos = useCallback((e: React.MouseEvent | MouseEvent) => {
    const container = editorRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + container.scrollLeft,
      y: e.clientY - rect.top + container.scrollTop,
    };
  }, []);

  /** 선택 영역 내 모든 data-element-id 요소 찾기 */
  const findElementsInRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const container = editorRef.current;
      if (!container) return [];

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const right = Math.max(x1, x2);
      const bottom = Math.max(y1, y2);

      const elements: (NoteElement | RestElement)[] = [];
      const noteGroups = container.querySelectorAll('[data-element-id]');

      const containerRect = container.getBoundingClientRect();

      for (const group of noteGroups) {
        const rect = group.getBoundingClientRect();

        // 요소의 중심점을 에디터 기준 좌표로 변환 (스크롤 보정)
        const centerX = rect.left + rect.width / 2 - containerRect.left + container.scrollLeft;
        const centerY = rect.top + rect.height / 2 - containerRect.top + container.scrollTop;

        // 중심점이 선택 영역 내에 있는지 확인
        if (centerX >= left && centerX <= right && centerY >= top && centerY <= bottom) {
          const elementId = group.getAttribute('data-element-id');
          if (elementId) {
            const loc = findElementLocation(scoreData, elementId);
            if (loc) {
              const el = scoreData.parts[loc.partIndex].measures[loc.measureIndex].elements[loc.elementIndex];
              if (el.type === 'note' || el.type === 'rest') {
                elements.push(el as NoteElement | RestElement);
              }
            }
          }
        }
      }

      return elements;
    },
    [scoreData],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 좌클릭만, Ctrl+스크롤(줌)과 충돌 방지
      if (e.button !== 0 || e.ctrlKey || e.metaKey) return;

      // 브라우저 기본 텍스트/콘텐츠 드래그 선택 방지
      e.preventDefault();

      const pos = getEditorRelativePos(e);
      setDrag({
        startX: pos.x,
        startY: pos.y,
        currentX: pos.x,
        currentY: pos.y,
        isDragging: false,
      });
    },
    [getEditorRelativePos],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drag) return;

      const pos = getEditorRelativePos(e);
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      setDrag({
        ...drag,
        currentX: pos.x,
        currentY: pos.y,
        isDragging: distance >= DRAG_THRESHOLD,
      });
    },
    [drag, getEditorRelativePos],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!drag) return;

      if (drag.isDragging) {
        // 드래그 완료 → 영역 내 요소 다중 선택
        const elements = findElementsInRect(
          drag.startX, drag.startY,
          drag.currentX, drag.currentY,
        );
        if (elements.length > 1) {
          onSelectionChange({ type: 'multi', elements });
        } else if (elements.length === 1) {
          const el = elements[0];
          onSelectionChange({
            type: el.type as 'note' | 'rest',
            element: el,
          });
        } else {
          onSelectionChange(null);
        }
      } else {
        // 클릭 → 단일 선택
        const target = e.target as HTMLElement;
        const noteGroup = target.closest('[data-element-id]') as HTMLElement | null;

        if (noteGroup) {
          const elementId = noteGroup.getAttribute('data-element-id');
          if (elementId) {
            const loc = findElementLocation(scoreData, elementId);
            if (loc) {
              const el = scoreData.parts[loc.partIndex].measures[loc.measureIndex].elements[loc.elementIndex];
              if (el.type === 'note') {
                onSelectionChange({ type: 'note', element: el as NoteElement });
                setDrag(null);
                return;
              } else if (el.type === 'rest') {
                onSelectionChange({ type: 'rest', element: el as RestElement });
                setDrag(null);
                return;
              }
            }
          }
        }
        onSelectionChange(null);
      }

      setDrag(null);
    },
    [drag, findElementsInRect, onSelectionChange, scoreData],
  );

  // 선택된 음표에 시각적 하이라이트 적용
  useEffect(() => {
    const container = editorRef.current;
    if (!container) return;

    // 이전 하이라이트 제거
    container.querySelectorAll('.note-selected').forEach((el) => {
      el.classList.remove('note-selected');
    });

    // 단일 선택 하이라이트
    if (selected?.element) {
      const el = container.querySelector(
        `[data-element-id="${selected.element.id}"]`,
      );
      if (el) {
        el.classList.add('note-selected');
      }
    }

    // 다중 선택 하이라이트
    if (selected?.type === 'multi' && selected.elements) {
      for (const elem of selected.elements) {
        const el = container.querySelector(
          `[data-element-id="${elem.id}"]`,
        );
        if (el) {
          el.classList.add('note-selected');
        }
      }
    }
  }, [selected]);

  // 선택 영역 사각형 좌표 계산
  const selectionRect = drag?.isDragging
    ? {
        left: Math.min(drag.startX, drag.currentX),
        top: Math.min(drag.startY, drag.currentY),
        width: Math.abs(drag.currentX - drag.startX),
        height: Math.abs(drag.currentY - drag.startY),
      }
    : null;

  return (
    <div
      ref={editorRef}
      className="score-editor"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      role="region"
      aria-label="Score editor canvas"
    >
      <div
        className="score-editor-canvas-wrapper"
        style={{ transform: `scale(${zoom})` }}
      >
        <ScoreCanvas scoreData={scoreData} config={autoConfig} />
      </div>
      {selectionRect && (
        <div
          className="selection-rect"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      )}
    </div>
  );
};

export default ScoreEditor;
