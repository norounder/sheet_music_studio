/**
 * ScoreCanvas React 컴포넌트
 *
 * ScoreData를 받아 VexFlow로 악보를 렌더링하는 컴포넌트.
 * ScoreData가 변경되면 자동으로 다시 렌더링한다.
 */

import React, { useRef, useEffect, useState } from 'react';
import type { ScoreData } from '@shared/types';
import { ScoreRenderer, type RenderConfig } from '../engine';

export interface ScoreCanvasProps {
  /** 렌더링할 악보 데이터 */
  scoreData: ScoreData;
  /** 렌더링 설정 (선택) */
  config?: Partial<RenderConfig>;
  /** 컨테이너 CSS 클래스 */
  className?: string;
  /** 컨테이너 인라인 스타일 */
  style?: React.CSSProperties;
}

/**
 * ScoreData를 VexFlow로 렌더링하는 React 컴포넌트
 */
const ScoreCanvas: React.FC<ScoreCanvasProps> = ({
  scoreData,
  config,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ScoreRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // config가 바뀌면 렌더러를 새로 생성 (VexFlow는 설정 변경 시 재생성 필요)
      rendererRef.current = new ScoreRenderer(containerRef.current, config);
      rendererRef.current.render(scoreData);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('ScoreCanvas render error:', err);
      setError(msg);
    }

    return () => {
      rendererRef.current?.clear();
    };
  }, [scoreData, config]);

  return (
    <div style={{ overflow: 'auto', ...style }}>
      {error && (
        <div style={{ padding: 16, color: '#f38ba8', fontSize: 13 }}>
          Render error: {error}
        </div>
      )}
      <div
        ref={containerRef}
        className={className}
        role="img"
        aria-label="Sheet music score"
      />
    </div>
  );
};

export default ScoreCanvas;
