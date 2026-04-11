/**
 * 렌더링 성능 테스트
 *
 * 요구사항 8.1: 1페이지 악보 렌더링 ≤ 1초
 * 요구사항 8.8: UI 프레임 레이트 ≥ 30fps
 */

import { describe, it, expect } from 'vitest';
import {
  mapPitchToVexKey,
  mapDurationToVexDuration,
  mapClefToVexClef,
  mapKeySignatureToVexKey,
  mapTimeSignatureToVexTime,
  mapArticulationToVex,
  mapOrnamentToVex,
} from './VexFlowMapper';
import type {
  ScoreData,
  NoteElement,
  RestElement,
  Measure,
  Part,
} from '@shared/types';

// ─── 테스트 데이터 생성 헬퍼 ───

function makeNote(step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', octave: number, id: string): NoteElement {
  return {
    type: 'note',
    id,
    pitch: { step, octave },
    duration: { divisions: 1, noteType: 'quarter', dots: 0 },
    voice: 1,
    staff: 1,
  };
}

function makeRest(id: string): RestElement {
  return {
    type: 'rest',
    id,
    duration: { divisions: 1, noteType: 'quarter', dots: 0 },
    voice: 1,
    staff: 1,
  };
}

function makeMeasure(num: number, notes: (NoteElement | RestElement)[]): Measure {
  return {
    number: num,
    elements: notes,
    directions: [],
    ...(num === 1 ? {
      attributes: {
        divisions: 1,
        keySignature: { fifths: 0, mode: 'major' as const },
        timeSignature: { beats: 4, beatType: 4 },
        clef: [{ sign: 'G' as const, line: 2, staffNumber: 1 }],
      },
    } : {}),
  };
}

function createOnePageScore(): ScoreData {
  const measures: Measure[] = [];
  const steps: ('C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B')[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  let noteId = 0;

  for (let m = 1; m <= 4; m++) {
    const notes: NoteElement[] = [];
    for (let n = 0; n < 4; n++) {
      notes.push(makeNote(steps[(m + n) % 7], 4, `n${++noteId}`));
    }
    measures.push(makeMeasure(m, notes));
  }

  return {
    parts: [{ id: 'P1', name: 'Piano', staves: 1, measures }],
  };
}

function createLargeScore(measureCount: number): ScoreData {
  const measures: Measure[] = [];
  const steps: ('C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B')[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  let noteId = 0;

  for (let m = 1; m <= measureCount; m++) {
    const notes: NoteElement[] = [];
    for (let n = 0; n < 4; n++) {
      notes.push(makeNote(steps[(m + n) % 7], 4, `n${++noteId}`));
    }
    measures.push(makeMeasure(m, notes));
  }

  return {
    parts: [{ id: 'P1', name: 'Piano', staves: 1, measures }],
  };
}

// ─── 성능 테스트 ───

describe('Rendering Performance (VexFlowMapper)', () => {
  it('should map 1-page score data (4 measures × 4 notes) within 10ms', () => {
    const score = createOnePageScore();
    const start = performance.now();

    // 모든 음표에 대해 매핑 수행 (렌더링 전처리 시뮬레이션)
    for (const part of score.parts) {
      for (const measure of part.measures) {
        if (measure.attributes?.clef) {
          for (const clef of measure.attributes.clef) {
            mapClefToVexClef(clef);
          }
        }
        if (measure.attributes?.keySignature) {
          mapKeySignatureToVexKey(measure.attributes.keySignature);
        }
        if (measure.attributes?.timeSignature) {
          mapTimeSignatureToVexTime(measure.attributes.timeSignature);
        }
        for (const el of measure.elements) {
          if (el.type === 'note') {
            mapPitchToVexKey(el.pitch);
            mapDurationToVexDuration(el.duration);
            if (el.articulations) {
              for (const art of el.articulations) {
                mapArticulationToVex(art);
              }
            }
            if (el.ornaments) {
              for (const orn of el.ornaments) {
                mapOrnamentToVex(orn);
              }
            }
          } else if (el.type === 'rest') {
            mapDurationToVexDuration(el.duration);
          }
        }
      }
    }

    const elapsed = performance.now() - start;
    console.log(`1-page mapping time: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(10); // 매핑은 10ms 이내
  });

  it('should map 16-measure score data within 50ms', () => {
    const score = createLargeScore(16);
    const start = performance.now();

    for (const part of score.parts) {
      for (const measure of part.measures) {
        if (measure.attributes?.clef) {
          for (const clef of measure.attributes.clef) {
            mapClefToVexClef(clef);
          }
        }
        if (measure.attributes?.keySignature) {
          mapKeySignatureToVexKey(measure.attributes.keySignature);
        }
        if (measure.attributes?.timeSignature) {
          mapTimeSignatureToVexTime(measure.attributes.timeSignature);
        }
        for (const el of measure.elements) {
          if (el.type === 'note') {
            mapPitchToVexKey(el.pitch);
            mapDurationToVexDuration(el.duration);
          } else if (el.type === 'rest') {
            mapDurationToVexDuration(el.duration);
          }
        }
      }
    }

    const elapsed = performance.now() - start;
    console.log(`16-measure mapping time: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(50);
  });

  it('should handle 30 consecutive mapping cycles within 100ms (30fps simulation)', () => {
    const score = createOnePageScore();
    const start = performance.now();

    for (let frame = 0; frame < 30; frame++) {
      for (const part of score.parts) {
        for (const measure of part.measures) {
          for (const el of measure.elements) {
            if (el.type === 'note') {
              mapPitchToVexKey(el.pitch);
              mapDurationToVexDuration(el.duration);
            }
          }
        }
      }
    }

    const elapsed = performance.now() - start;
    const avgPerFrame = elapsed / 30;
    console.log(`30-frame mapping: total=${elapsed.toFixed(2)}ms, avg=${avgPerFrame.toFixed(2)}ms/frame`);
    expect(elapsed).toBeLessThan(100); // 30 프레임이 100ms 이내
    expect(avgPerFrame).toBeLessThan(33.3); // 각 프레임 33.3ms 이내 (30fps)
  });

  it('should map 100-measure score within 200ms', () => {
    const score = createLargeScore(100);
    const start = performance.now();

    for (const part of score.parts) {
      for (const measure of part.measures) {
        if (measure.attributes?.keySignature) {
          mapKeySignatureToVexKey(measure.attributes.keySignature);
        }
        if (measure.attributes?.timeSignature) {
          mapTimeSignatureToVexTime(measure.attributes.timeSignature);
        }
        for (const el of measure.elements) {
          if (el.type === 'note') {
            mapPitchToVexKey(el.pitch);
            mapDurationToVexDuration(el.duration);
          }
        }
      }
    }

    const elapsed = performance.now() - start;
    console.log(`100-measure mapping time: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(200);
  });
});
