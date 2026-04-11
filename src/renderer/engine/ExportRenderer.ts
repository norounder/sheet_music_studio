/**
 * PDF/PNG 내보내기 렌더러
 *
 * Score_Data를 PDF 또는 PNG 형식으로 내보내는 모듈이다.
 * 내부적으로 ScoreRenderer를 사용하여 SVG를 생성한 후,
 * SVG → Canvas → 이미지 변환 파이프라인을 통해 출력한다.
 *
 * - PDF: jsPDF를 사용하여 Canvas 이미지를 PDF에 삽입
 * - PNG: Canvas.toBlob()을 사용하여 PNG 바이너리 생성
 *
 * 요구사항: 4.3 (PDF 내보내기), 4.4 (PNG 내보내기)
 */

import { jsPDF } from 'jspdf';
import { ScoreRenderer } from './ScoreRenderer';
import type { ScoreData } from '@shared/types';

// ─── 내보내기 옵션 ───

export interface ExportOptions {
  /** 페이지 너비 (pt, 기본: 595 = A4) */
  pageWidth: number;
  /** 페이지 높이 (pt, 기본: 842 = A4) */
  pageHeight: number;
  /** 상단 여백 (pt) */
  marginTop: number;
  /** 하단 여백 (pt) */
  marginBottom: number;
  /** 좌측 여백 (pt) */
  marginLeft: number;
  /** 우측 여백 (pt) */
  marginRight: number;
  /** 스케일 (기본: 1.0) */
  scale: number;
  /** 제목 (PDF 메타데이터 및 상단 표시용) */
  title?: string;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  pageWidth: 595,
  pageHeight: 842,
  marginTop: 50,
  marginBottom: 50,
  marginLeft: 50,
  marginRight: 50,
  scale: 1.0,
};

// ─── 인터페이스 ───

export interface IScoreRendererExport {
  toPdf(scoreData: ScoreData, options?: Partial<ExportOptions>): Promise<Uint8Array>;
  toPng(scoreData: ScoreData, options?: Partial<ExportOptions>): Promise<Uint8Array>;
}

// ─── ExportRenderer 클래스 ───

export class ExportRenderer implements IScoreRendererExport {
  /**
   * Score_Data를 PDF로 내보낸다.
   * SVG 렌더링 → Canvas 변환 → jsPDF로 PDF 생성
   */
  async toPdf(scoreData: ScoreData, options?: Partial<ExportOptions>): Promise<Uint8Array> {
    const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const contentWidth = opts.pageWidth - opts.marginLeft - opts.marginRight;
    const contentHeight = opts.pageHeight - opts.marginTop - opts.marginBottom;

    const svgElement = this.renderToSvg(scoreData, contentWidth, opts.scale);
    const canvas = await this.svgToCanvas(svgElement, opts.scale);

    const pdf = new jsPDF({
      orientation: opts.pageWidth > opts.pageHeight ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [opts.pageWidth, opts.pageHeight],
    });

    if (opts.title) {
      pdf.setProperties({ title: opts.title });
    }

    const imgData = canvas.toDataURL('image/png');

    // 이미지를 페이지에 맞게 스케일링
    const imgAspect = canvas.width / canvas.height;
    const contentAspect = contentWidth / contentHeight;

    let drawWidth: number;
    let drawHeight: number;

    if (imgAspect > contentAspect) {
      drawWidth = contentWidth;
      drawHeight = contentWidth / imgAspect;
    } else {
      drawHeight = contentHeight;
      drawWidth = contentHeight * imgAspect;
    }

    pdf.addImage(imgData, 'PNG', opts.marginLeft, opts.marginTop, drawWidth, drawHeight);

    const arrayBuffer = pdf.output('arraybuffer');
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Score_Data를 PNG로 내보낸다.
   * SVG 렌더링 → Canvas 변환 → PNG Uint8Array
   */
  async toPng(scoreData: ScoreData, options?: Partial<ExportOptions>): Promise<Uint8Array> {
    const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const contentWidth = opts.pageWidth - opts.marginLeft - opts.marginRight;

    const svgElement = this.renderToSvg(scoreData, contentWidth, opts.scale);
    const canvas = await this.svgToCanvas(svgElement, opts.scale);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/png',
      );
    });

    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  // ─── 내부 헬퍼 ───

  /**
   * ScoreData를 오프스크린 컨테이너에 SVG로 렌더링하고 SVG 요소를 반환한다.
   */
  private renderToSvg(scoreData: ScoreData, contentWidth: number, scale: number): SVGSVGElement {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.visibility = 'hidden';
    document.body.appendChild(container);

    try {
      const measuresPerLine = Math.max(1, Math.floor(contentWidth / (300 * scale)));
      const staveWidth = Math.floor((contentWidth / measuresPerLine) / scale);

      const renderer = new ScoreRenderer(container, {
        mode: 'svg',
        staveWidth,
        staveStartX: 10,
        staveStartY: 40,
        staveSpacing: 80,
        systemSpacing: 150,
        measuresPerLine,
      });

      renderer.render(scoreData);

      const svgElement = container.querySelector('svg');
      if (!svgElement) {
        throw new Error('SVG rendering failed: no SVG element found');
      }

      // SVG를 컨테이너에서 분리하여 반환
      const clonedSvg = svgElement.cloneNode(true) as SVGSVGElement;
      return clonedSvg;
    } finally {
      document.body.removeChild(container);
    }
  }

  /**
   * SVG 요소를 Canvas로 변환한다.
   * Image 요소에 SVG data URL을 로드하여 Canvas에 그린다.
   */
  private svgToCanvas(svgElement: SVGSVGElement, scale: number): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const svgWidth = parseFloat(svgElement.getAttribute('width') || '800');
      const svgHeight = parseFloat(svgElement.getAttribute('height') || '600');

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(svgWidth * scale);
      canvas.height = Math.ceil(svgHeight * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas 2d context'));
        return;
      }

      // 흰색 배경
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const img = new Image();

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG as image'));
      };

      img.src = url;
    });
  }
}
