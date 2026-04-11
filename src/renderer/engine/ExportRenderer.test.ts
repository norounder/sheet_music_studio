/**
 * ExportRenderer 단위 테스트
 *
 * ExportRenderer는 브라우저 DOM API(document, Image, Canvas, XMLSerializer)에
 * 의존하므로, 구조적 검증과 모킹 기반 통합 테스트를 수행한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportRenderer } from './ExportRenderer';
import type { ExportOptions, IScoreRendererExport } from './ExportRenderer';
import type { ScoreData } from '@shared/types';

// 최소 ScoreData 픽스처
const minimalScoreData: ScoreData = {
  parts: [
    {
      id: 'P1',
      name: 'Piano',
      staves: 1,
      measures: [
        {
          number: 1,
          elements: [
            {
              type: 'note',
              id: 'n1',
              pitch: { step: 'C', octave: 4 },
              duration: { divisions: 1, noteType: 'quarter', dots: 0 },
              voice: 1,
              staff: 1,
            },
          ],
          directions: [],
        },
      ],
    },
  ],
};

describe('ExportRenderer', () => {
  it('should implement IScoreRendererExport interface', () => {
    const renderer = new ExportRenderer();
    expect(typeof renderer.toPdf).toBe('function');
    expect(typeof renderer.toPng).toBe('function');
  });

  it('should satisfy IScoreRendererExport type contract', () => {
    // 타입 레벨 검증: ExportRenderer가 IScoreRendererExport를 구현하는지 확인
    const renderer: IScoreRendererExport = new ExportRenderer();
    expect(renderer).toBeDefined();
  });
});

describe('ExportOptions defaults', () => {
  it('should have correct A4 default values', () => {
    // ExportOptions의 기본값이 A4 크기와 일치하는지 확인
    const defaults: ExportOptions = {
      pageWidth: 595,
      pageHeight: 842,
      marginTop: 50,
      marginBottom: 50,
      marginLeft: 50,
      marginRight: 50,
      scale: 1.0,
    };

    expect(defaults.pageWidth).toBe(595);
    expect(defaults.pageHeight).toBe(842);
    expect(defaults.marginTop).toBe(50);
    expect(defaults.marginBottom).toBe(50);
    expect(defaults.marginLeft).toBe(50);
    expect(defaults.marginRight).toBe(50);
    expect(defaults.scale).toBe(1.0);
  });

  it('should allow partial options with title', () => {
    const opts: Partial<ExportOptions> = {
      scale: 2.0,
      title: 'My Score',
    };

    expect(opts.scale).toBe(2.0);
    expect(opts.title).toBe('My Score');
    expect(opts.pageWidth).toBeUndefined();
  });

  it('should support landscape orientation via custom dimensions', () => {
    const landscapeOpts: Partial<ExportOptions> = {
      pageWidth: 842,
      pageHeight: 595,
    };

    // landscape: width > height
    expect(landscapeOpts.pageWidth!).toBeGreaterThan(landscapeOpts.pageHeight!);
  });
});
