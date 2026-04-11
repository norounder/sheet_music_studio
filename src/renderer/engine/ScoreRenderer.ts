/**
 * VexFlow 기반 악보 렌더링 엔진
 *
 * Score_Data를 VexFlow 객체로 변환하여 SVG/Canvas에 렌더링한다.
 * 순수 함수적 접근: 주어진 ScoreData로부터 렌더링 결과를 생성하며,
 * 대상 컨테이너의 DOM 조작 외에 부수 효과가 없다.
 *
 * MVP 지원 범위:
 * - 단일 보표, 대보표 (2 staves)
 * - 보표당 최대 2개 성부 (voice)
 * - 기본 마디선 및 반복 마디선
 * - 조표, 박자표, 음자리표
 * - 음표, 쉼표, 빔, 타이, 슬러
 * - 아티큘레이션, 다이나믹, 가사
 * - 장식음 (trill, mordent, turn 등)
 * - 꾸밈음 (grace notes)
 * - 잇단음표 (tuplets)
 * - 볼타 괄호 (repeat endings)
 *
 * Post-MVP:
 * - 복잡한 다파트 악보 (오케스트라)
 * - 페달 라인, 헤어핀(wedge) 렌더링
 * - 옥타브 시프트 라인
 * - 복잡한 잇단음표 중첩
 */

import {
  Renderer,
  Stave,
  StaveNote,
  GraceNote,
  GraceNoteGroup,
  Beam,
  StaveTie,
  Curve,
  Tuplet,
  Formatter,
  Voice,
  StaveConnector,
  Articulation as VexArticulation,
  Ornament as VexOrnament,
  Annotation,
  Volta,
  Accidental,
  Dot,
  type RenderContext,
} from 'vexflow';

import type {
  ScoreData,
  Part,
  Measure,
  MeasureElement,
  NoteElement,
  RestElement,
  Clef,
  KeySignature,
  TimeSignature,
  Barline as BarlineType,
  EndingInfo,
  Direction,
} from '@shared/types';

import {
  mapPitchToVexKey,
  mapAlterToVexAccidental,
  mapDurationToVexDuration,
  mapClefToVexClef,
  mapKeySignatureToVexKey,
  mapTimeSignatureToVexTime,
  mapArticulationToVex,
  mapOrnamentToVex,
  mapBarlineStyleToVex,
} from './VexFlowMapper';

// ─── 렌더링 설정 ───

export interface RenderConfig {
  /** 출력 모드: SVG (기본) 또는 Canvas */
  mode: 'svg' | 'canvas';
  /** 보표 너비 (px) — 슬라이더로 조절 가능 */
  staveWidth: number;
  /** 보표 시작 X 좌표 */
  staveStartX: number;
  /** 첫 보표 시작 Y 좌표 */
  staveStartY: number;
  /** 보표 간 수직 간격 (같은 시스템 내 대보표) */
  staveSpacing: number;
  /** 시스템 간 수직 간격 (줄 바꿈) */
  systemSpacing: number;
  /** 한 줄에 표시할 마디 수 */
  measuresPerLine: number;
}

const DEFAULT_CONFIG: RenderConfig = {
  mode: 'svg',
  staveWidth: 350,
  staveStartX: 20,
  staveStartY: 60,
  staveSpacing: 120,
  systemSpacing: 180,
  measuresPerLine: 4,
};

// ─── 내부 타입 ───

/** 렌더링된 음표 정보 (타이/슬러 연결용) */
interface RenderedNote {
  staveNote: StaveNote;
  element: NoteElement;
  measureIndex: number;
  voice: number;
  staff: number;
}

/** 빔 그룹 추적용 */
interface BeamGroup {
  notes: StaveNote[];
  voice: number;
  staff: number;
}

// ─── ScoreRenderer 클래스 ───

export class ScoreRenderer {
  private container: HTMLElement;
  private config: RenderConfig;
  private renderer: Renderer | null = null;
  private context: RenderContext | null = null;
  private renderedNotes: RenderedNote[] = [];

  constructor(container: HTMLElement, config?: Partial<RenderConfig>) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * ScoreData를 렌더링한다.
   * 컨테이너를 초기화하고 VexFlow 객체를 생성하여 렌더링한다.
   */
  render(scoreData: ScoreData): void {
    this.clear();
    this.initRenderer(scoreData);

    if (!this.context) return;

    for (const part of scoreData.parts) {
      this.renderPart(part);
    }

    // SVG 요소에 data-element-id 속성 부착 (클릭 선택용)
    this.attachElementIds();
  }

  /** 컨테이너 내용을 초기화한다 */
  clear(): void {
    this.container.innerHTML = '';
    this.renderer = null;
    this.context = null;
    this.renderedNotes = [];
  }

  /** 렌더링 설정을 업데이트한다 */
  updateConfig(config: Partial<RenderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ─── SVG data attribute 부착 (클릭 선택용) ───

  private attachElementIds(): void {
    for (const rn of this.renderedNotes) {
      const svgEl = rn.staveNote.getSVGElement();
      if (svgEl) {
        svgEl.setAttribute('data-element-id', rn.element.id);
        svgEl.style.cursor = 'pointer';
      }
    }
  }

  // ─── 초기화 ───

  private initRenderer(scoreData: ScoreData): void {
    const totalHeight = this.estimateHeight(scoreData);
    const totalWidth = this.estimateTotalWidth();

    this.renderer = new Renderer(
      this.container as HTMLDivElement,
      this.config.mode === 'svg' ? Renderer.Backends.SVG : Renderer.Backends.CANVAS,
    );
    this.renderer.resize(totalWidth, totalHeight);
    this.context = this.renderer.getContext();
  }

  private estimateHeight(scoreData: ScoreData): number {
    const { measuresPerLine, staveSpacing, systemSpacing, staveStartY } = this.config;
    // 가장 마디가 많은 파트 기준
    let maxMeasures = 0;
    let maxStaves = 1;
    for (const part of scoreData.parts) {
      if (part.measures.length > maxMeasures) {
        maxMeasures = part.measures.length;
        maxStaves = part.staves || 1;
      }
    }
    const numLines = Math.ceil(maxMeasures / measuresPerLine);
    return staveStartY + numLines * (maxStaves * staveSpacing + systemSpacing) + 100;
  }

  private estimateTotalWidth(): number {
    const { staveStartX, staveWidth, measuresPerLine } = this.config;
    // 첫 마디 extra + 나머지 마디
    return staveStartX + (staveWidth + 60) + (measuresPerLine - 1) * staveWidth + 40;
  }

  // ─── Part 렌더링 ───

  private renderPart(part: Part): void {
    if (!this.context) return;

    const measures = part.measures;
    const numStaves = part.staves || 1;
    const { measuresPerLine, staveStartX, staveWidth, staveStartY, staveSpacing, systemSpacing } = this.config;

    // 첫 마디 추가 너비 (음자리표+조표+박자표 공간)
    const firstMeasureExtra = 60;

    // 렌더링된 음표 추적 (타이/슬러 연결 및 클릭 선택용)
    const allRenderedNotes: RenderedNote[] = [];

    // 현재 조표 추적 (마디 간 전파)
    let currentKeyFifths = 0;

    // 현재 음자리표 추적 (보표별, 마디 간 전파)
    // key: staffNumber, value: VexFlow clef string ('treble', 'bass', 'alto', ...)
    const currentClefs = new Map<number, string>();
    // 기본값 설정
    currentClefs.set(1, 'treble');
    if (numStaves >= 2) currentClefs.set(2, 'bass');

    for (let mIdx = 0; mIdx < measures.length; mIdx++) {
      const measure = measures[mIdx];

      // 조표가 변경되면 업데이트
      if (measure.attributes?.keySignature != null) {
        currentKeyFifths = measure.attributes.keySignature.fifths;
      }

      // 음자리표가 변경되면 업데이트
      if (measure.attributes?.clef) {
        for (const c of measure.attributes.clef) {
          currentClefs.set(c.staffNumber, mapClefToVexClef(c));
        }
      }

      const lineIndex = Math.floor(mIdx / measuresPerLine);
      const posInLine = mIdx % measuresPerLine;
      const isFirstInLine = posInLine === 0;

      // 첫 마디는 음자리표/박자표 공간만큼 더 넓게
      const thisWidth = isFirstInLine ? staveWidth + firstMeasureExtra : staveWidth;

      // X 좌표 계산: 첫 마디 이후는 extra 만큼 밀림
      let x = staveStartX;
      if (posInLine > 0) {
        x = staveStartX + (staveWidth + firstMeasureExtra) + (posInLine - 1) * staveWidth;
      }

      const baseY = staveStartY + lineIndex * (numStaves * staveSpacing + systemSpacing);

      // 각 보표(staff) 렌더링
      const staves: Stave[] = [];
      for (let staffNum = 1; staffNum <= numStaves; staffNum++) {
        const y = baseY + (staffNum - 1) * staveSpacing;
        const stave = this.createStave(x, y, thisWidth, measure, staffNum, isFirstInLine, part, currentKeyFifths);
        stave.setContext(this.context).draw();
        staves.push(stave);
      }

      // 대보표 연결선 (grand staff connector)
      if (numStaves > 1 && isFirstInLine && staves.length >= 2) {
        const connector = new StaveConnector(staves[0], staves[staves.length - 1]);
        connector.setType('brace');
        connector.setContext(this.context).draw();

        const lineConnector = new StaveConnector(staves[0], staves[staves.length - 1]);
        lineConnector.setType('singleLeft');
        lineConnector.setContext(this.context).draw();
      }

      // 마디 끝 연결선 (대보표)
      if (numStaves > 1 && staves.length >= 2) {
        const endConnector = new StaveConnector(staves[0], staves[staves.length - 1]);
        endConnector.setType('singleRight');
        endConnector.setContext(this.context).draw();
      }

      // 음표/쉼표 렌더링
      const measureNotes = this.renderMeasureElements(measure, staves, numStaves, mIdx, allRenderedNotes, currentKeyFifths, currentClefs);

      // Direction 렌더링 (다이나믹, 템포 등)
      this.renderDirections(measure.directions, staves);

      // 볼타 괄호 렌더링
      if (measure.barline?.ending) {
        this.renderEnding(measure.barline.ending, staves[0]);
      }

      // 빔 렌더링: MusicXML 명시적 빔 그룹 우선, 없으면 자동 빔 생성 폴백
      if (measureNotes.hasExplicitBeamData && measureNotes.beamGroups.length > 0) {
        // 명시적 빔 그룹 렌더링
        for (const beamGroup of measureNotes.beamGroups) {
          if (beamGroup.notes.length >= 2) {
            try {
              const beam = new Beam(beamGroup.notes);
              beam.setContext(this.context!).draw();
            } catch {
              // Skip invalid beam groups
            }
          }
        }
      } else {
        // 자동 빔 생성 폴백 — whole/half notes 필터링, beamRests 활성화
        const NON_BEAMABLE = new Set(['w', 'h', 'wr', 'hr']);
        for (const noteGroup of measureNotes.vexNotesByVoice) {
          try {
            const beamable = noteGroup.filter(
              (n) => !NON_BEAMABLE.has(n.getDuration() + (n.isRest() ? 'r' : '')),
            );
            if (beamable.length >= 2) {
              const autoBeams = Beam.generateBeams(beamable, {
                maintainStemDirections: true,
                beamRests: true,
              });
              for (const beam of autoBeams) {
                beam.setContext(this.context!).draw();
              }
            }
          } catch (e) {
            console.warn('Beam generation failed:', e);
          }
        }
      }

      // 잇단음표 렌더링
      for (const tupletGroup of measureNotes.tupletGroups) {
        if (tupletGroup.notes.length > 0) {
          try {
            const tuplet = new Tuplet(tupletGroup.notes, {
              numNotes: tupletGroup.actualNotes,
              notesOccupied: tupletGroup.normalNotes,
            });
            tuplet.setContext(this.context!).draw();
          } catch (e) {
            console.warn('[ScoreRenderer] tuplet rendering failed:', { measureIndex: mIdx, actualNotes: tupletGroup.actualNotes, normalNotes: tupletGroup.normalNotes, error: e });
          }
        }
      }
    }

    // 타이 렌더링
    this.renderTies(allRenderedNotes);

    // 슬러 렌더링
    this.renderSlurs(allRenderedNotes);

    // 인스턴스에 렌더링된 음표 저장 (클릭 선택용)
    this.renderedNotes.push(...allRenderedNotes);
  }

  // ─── Stave 생성 ───

  private createStave(
    x: number,
    y: number,
    width: number,
    measure: Measure,
    staffNumber: number,
    isFirstInLine: boolean,
    part: Part,
    currentKeyFifths: number,
  ): Stave {
    const stave = new Stave(x, y, width);

    // 첫 마디 또는 줄 시작 시 음자리표/조표/박자표 표시
    if (isFirstInLine || measure.number === 1) {
      const clef = this.getClefForStaff(measure, staffNumber, part);
      if (clef) {
        stave.addClef(mapClefToVexClef(clef));
      }

      // 조표: 현재 추적 중인 조표를 사용 (마디에 없어도 전파된 값)
      const ks = measure.attributes?.keySignature ?? { fifths: currentKeyFifths, mode: 'major' as const };
      stave.addKeySignature(mapKeySignatureToVexKey(ks));
    }

    // 박자표는 첫 마디 또는 변경 시에만 표시
    if (measure.attributes?.timeSignature && (measure.number === 1 || isFirstInLine)) {
      stave.addTimeSignature(mapTimeSignatureToVexTime(measure.attributes.timeSignature));
    }

    // 마디선 처리
    if (measure.barline) {
      this.applyBarline(stave, measure.barline);
    }

    return stave;
  }

  private getClefForStaff(measure: Measure, staffNumber: number, part: Part): Clef | null {
    // 현재 마디의 attributes에서 해당 보표의 음자리표 찾기
    if (measure.attributes?.clef) {
      const clef = measure.attributes.clef.find(c => c.staffNumber === staffNumber);
      if (clef) return clef;
    }
    // 기본값: staff 1 = treble, staff 2 = bass
    if (staffNumber === 1) {
      return { sign: 'G', line: 2, staffNumber: 1 };
    }
    if (staffNumber === 2 && part.staves >= 2) {
      return { sign: 'F', line: 4, staffNumber: 2 };
    }
    return { sign: 'G', line: 2, staffNumber };
  }

  private applyBarline(stave: Stave, barline: BarlineType): void {
    const barType = mapBarlineStyleToVex(barline.style, barline.repeat);
    if (barline.location === 'left' || barline.location === 'right') {
      stave.setBegBarType(barline.location === 'left' ? barType : 0);
      if (barline.location === 'right') {
        stave.setEndBarType(barType);
      }
    } else {
      stave.setEndBarType(barType);
    }
  }

  // ─── 마디 요소 렌더링 ───

  private renderMeasureElements(
    measure: Measure,
    staves: Stave[],
    numStaves: number,
    measureIndex: number,
    allRenderedNotes: RenderedNote[],
    currentKeyFifths: number,
    currentClefs: Map<number, string>,
  ): { beamGroups: BeamGroup[]; tupletGroups: TupletGroup[]; vexNotesByVoice: StaveNote[][]; hasExplicitBeamData: boolean } {
    if (!this.context) return { beamGroups: [], tupletGroups: [], vexNotesByVoice: [], hasExplicitBeamData: false };

    // 성부별로 요소 분류
    const voiceMap = this.groupElementsByVoiceAndStaff(measure.elements, numStaves);
    const beamGroups: BeamGroup[] = [];
    const tupletGroups: TupletGroup[] = [];
    const vexNotesByVoice: StaveNote[][] = [];
    let hasExplicitBeamData = false;

    // 각 보표별로 성부 렌더링
    for (let staffNum = 1; staffNum <= numStaves; staffNum++) {
      const staffVoices = voiceMap.get(staffNum);
      if (!staffVoices || staffVoices.size === 0) continue;

      const stave = staves[staffNum - 1];
      if (!stave) continue;

      const vexVoices: Voice[] = [];

      const isMultiVoice = staffVoices.size > 1;

      for (const [voiceNum, elements] of staffVoices) {
        const result = this.convertElementsToVexNotes(
          elements, staffNum, voiceNum, measureIndex, measure, currentKeyFifths, isMultiVoice, currentClefs,
        );
        const { vexNotes, beams, tuplets, rendered } = result;
        if (result.hasExplicitBeamData) hasExplicitBeamData = true;

        allRenderedNotes.push(...rendered);

        if (vexNotes.length === 0) continue;

        // 빔 자동 생성용 음표 그룹 수집
        vexNotesByVoice.push([...vexNotes]);

        // Voice 생성 (softmax 모드로 유연한 타이밍 허용)
        const beats = measure.attributes?.timeSignature?.beats ?? 4;
        const beatValue = measure.attributes?.timeSignature?.beatType ?? 4;
        const voice = new Voice({ numBeats: beats, beatValue }).setMode(Voice.Mode.SOFT);

        voice.addTickables(vexNotes);
        vexVoices.push(voice);
        beamGroups.push(...beams);
        tupletGroups.push(...tuplets);
      }

      if (vexVoices.length > 0) {
        try {
          const noteStartX = stave.getNoteStartX();
          const noteEndX = stave.getNoteEndX();
          const availableWidth = Math.max(noteEndX - noteStartX - 10, 100);
          new Formatter()
            .joinVoices(vexVoices)
            .format(vexVoices, availableWidth, { alignRests: true });
          for (const v of vexVoices) {
            v.draw(this.context!, stave);
          }
        } catch (e) {
          console.warn('[ScoreRenderer] format/draw failed:', { measureIndex, staffNum, error: e });
        }
      }
    }

    return { beamGroups, tupletGroups, vexNotesByVoice, hasExplicitBeamData };
  }

  // ─── 요소 분류 ───

  private groupElementsByVoiceAndStaff(
    elements: MeasureElement[],
    numStaves: number,
  ): Map<number, Map<number, MeasureElement[]>> {
    const result = new Map<number, Map<number, MeasureElement[]>>();

    for (let s = 1; s <= numStaves; s++) {
      result.set(s, new Map());
    }

    for (const el of elements) {
      if (el.type === 'backup') continue; // backup은 성부 전환 마커

      const staff = ('staff' in el ? el.staff : 1) || 1;
      const voice = ('voice' in el ? el.voice : 1) || 1;

      if (!result.has(staff)) {
        result.set(staff, new Map());
      }
      const staffMap = result.get(staff)!;
      if (!staffMap.has(voice)) {
        staffMap.set(voice, []);
      }
      staffMap.get(voice)!.push(el);
    }

    return result;
  }

  // ─── VexFlow 음표 변환 ───

  private convertElementsToVexNotes(
    elements: MeasureElement[],
    staffNum: number,
    voiceNum: number,
    measureIndex: number,
    measure: Measure,
    currentKeyFifths: number,
    isMultiVoice: boolean,
    currentClefs: Map<number, string>,
  ): {
    vexNotes: StaveNote[];
    beams: BeamGroup[];
    tuplets: TupletGroup[];
    rendered: RenderedNote[];
    hasExplicitBeamData: boolean;
  } {
    const vexNotes: StaveNote[] = [];
    const rendered: RenderedNote[] = [];
    const beams: BeamGroup[] = [];
    const tuplets: TupletGroup[] = [];

    // 빔 추적 (MusicXML beam 정보가 있으면 명시적 빔 그룹 사용)
    const currentBeamNotes: StaveNote[] = [];
    let hasExplicitBeamData = false;

    // 잇단음표 추적
    const currentTupletNotes: StaveNote[] = [];
    const currentTupletInfo: { actualNotes: number; normalNotes: number } = { actualNotes: 0, normalNotes: 0 };

    // 꾸밈음 대기열: 다음 일반 음표에 부착할 GraceNote 목록
    let pendingGraceNotes: GraceNote[] = [];

    // 화음 그룹 추적
    let chordKeys: string[] = [];
    let chordElement: NoteElement | null = null;

    /** 대기 중인 꾸밈음을 StaveNote에 부착한다 */
    const attachPendingGraceNotes = (staveNote: StaveNote): void => {
      if (pendingGraceNotes.length > 0) {
        const graceGroup = new GraceNoteGroup(pendingGraceNotes);
        staveNote.addModifier(graceGroup);
        pendingGraceNotes = [];
      }
    };

    const flushChord = () => {
      if (chordElement && chordKeys.length > 0) {
        const sn = this.createStaveNote(chordElement, chordKeys, voiceNum, measure, currentKeyFifths, isMultiVoice, staffNum, currentClefs);
        if (sn) {
          attachPendingGraceNotes(sn);
          vexNotes.push(sn);
          rendered.push({
            staveNote: sn,
            element: chordElement,
            measureIndex,
            voice: voiceNum,
            staff: staffNum,
          });

          // 빔 추적: MusicXML beam 정보가 있으면 명시적 빔 그룹 수집
          if (chordElement.beam && chordElement.beam.length > 0) {
            hasExplicitBeamData = true;
            this.trackBeam(chordElement, sn, currentBeamNotes, beams, voiceNum, staffNum);
          }

          // 잇단음표 추적
          if (chordElement.duration.tuplet) {
            this.trackTuplet(chordElement, sn, currentTupletNotes, currentTupletInfo, tuplets);
          }
        }
        chordKeys = [];
        chordElement = null;
      }
    };

    for (const el of elements) {
      if (el.type === 'forward') continue;

      if (el.type === 'note') {
        // 꾸밈음: GraceNote를 생성하여 대기열에 추가, StaveNote는 생성하지 않음
        if (el.graceNote) {
          try {
            const graceKeys = [mapPitchToVexKey(el.pitch)];
            const graceNote = new GraceNote({
              keys: graceKeys,
              duration: '8',
              slash: el.graceNote?.slash ?? true,
            });
            pendingGraceNotes.push(graceNote);
          } catch (e) {
            console.warn('[ScoreRenderer] createGraceNote failed:', { measureIndex, elementId: el.id, error: e });
          }
          continue;
        }

        if (el.chord) {
          // 화음: 이전 음표에 키 추가
          chordKeys.push(mapPitchToVexKey(el.pitch));
        } else {
          // 이전 화음 그룹 플러시
          flushChord();
          chordKeys = [mapPitchToVexKey(el.pitch)];
          chordElement = el;
        }
      } else if (el.type === 'rest') {
        flushChord();
        const sn = this.createRestNote(el, voiceNum, measure, isMultiVoice, staffNum, currentClefs);
        if (sn) {
          attachPendingGraceNotes(sn);
          vexNotes.push(sn);
          rendered.push({
            staveNote: sn,
            element: el as unknown as NoteElement,
            measureIndex,
            voice: voiceNum,
            staff: staffNum,
          });
        }
      }
    }

    // 마지막 화음 그룹 플러시
    flushChord();

    // 잔여 빔 그룹 플러시 (end 없이 끝난 경우)
    if (currentBeamNotes.length >= 2) {
      beams.push({ notes: [...currentBeamNotes], voice: voiceNum, staff: staffNum });
    }

    // 잔여 잇단음표 그룹 플러시
    if (currentTupletNotes.length > 0 && currentTupletInfo.actualNotes > 0) {
      tuplets.push({
        notes: [...currentTupletNotes],
        actualNotes: currentTupletInfo.actualNotes,
        normalNotes: currentTupletInfo.normalNotes,
      });
    }

    return { vexNotes, beams, tuplets, rendered, hasExplicitBeamData };
  }

  // ─── StaveNote 생성 ───

  private createStaveNote(
    element: NoteElement,
    keys: string[],
    voiceNum: number,
    measure: Measure,
    currentKeyFifths: number,
    isMultiVoice: boolean,
    staffNum: number,
    currentClefs: Map<number, string>,
  ): StaveNote | null {
    try {
      const duration = mapDurationToVexDuration(element.duration);
      const clef = currentClefs.get(staffNum) ?? 'treble';

      // 꾸밈음은 convertElementsToVexNotes()에서 직접 처리되므로 여기서는 도달하지 않음
      // (안전장치로 남겨둠)
      if (element.graceNote) {
        return null;
      }

      const noteParams: ConstructorParameters<typeof StaveNote>[0] = {
        keys,
        duration,
        clef,
      };

      // 줄기 방향: 다성부면 voice 1=위, voice 2=아래. 단일 성부면 VexFlow 자동
      if (element.stem) {
        noteParams.stemDirection = element.stem === 'down' ? -1 : 1;
      } else if (isMultiVoice) {
        noteParams.stemDirection = voiceNum <= 1 ? 1 : -1;
      }
      // 단일 성부: stemDirection 미설정 → VexFlow가 음높이 기반으로 자동 결정

      const staveNote = new StaveNote(noteParams);

      // 임시표 추가 — 조표에 이미 포함된 변화음은 제외
      if (element.pitch.alter != null && element.pitch.alter !== 0) {
        if (!this.isAlterInKeySignature(element.pitch.step, element.pitch.alter, currentKeyFifths)) {
          const acc = mapAlterToVexAccidental(element.pitch.alter);
          if (acc) {
            staveNote.addModifier(new Accidental(acc), 0);
          }
        }
      }

      // 점음표 추가
      for (let d = 0; d < element.duration.dots; d++) {
        Dot.buildAndAttach([staveNote]);
      }

      // 아티큘레이션 추가
      if (element.articulations) {
        for (const art of element.articulations) {
          const code = mapArticulationToVex(art);
          staveNote.addModifier(new VexArticulation(code));
        }
      }

      // 장식음 추가
      if (element.ornaments) {
        for (const orn of element.ornaments) {
          const code = mapOrnamentToVex(orn);
          staveNote.addModifier(new VexOrnament(code));
        }
      }

      // 다이나믹 추가
      // TextDynamics extends Note (not Modifier) in VexFlow 5, so it cannot be
      // attached as a modifier to StaveNote. Use Annotation as a workaround.
      if (element.dynamics) {
        staveNote.addModifier(
          new Annotation(element.dynamics)
            .setVerticalJustification(Annotation.VerticalJustify.BOTTOM),
        );
      }

      // 가사 추가
      if (element.lyrics) {
        for (const lyric of element.lyrics) {
          staveNote.addModifier(
            new Annotation(lyric.text)
              .setFont('Arial', 10)
              .setVerticalJustification(Annotation.VerticalJustify.BOTTOM),
          );
        }
      }

      return staveNote;
    } catch (e) {
      console.warn('[ScoreRenderer] createStaveNote failed:', { measureIndex: undefined, elementId: element.id, error: e });
      return null;
    }
  }

  private createRestNote(
    element: RestElement,
    voiceNum: number,
    measure: Measure,
    isMultiVoice: boolean,
    staffNum: number,
    currentClefs: Map<number, string>,
  ): StaveNote | null {
    try {
      const duration = mapDurationToVexDuration(element.duration) + 'r';
      const clef = currentClefs.get(staffNum) ?? 'treble';

      // 쉼표 위치 결정: displayStep/displayOctave > 다성부 오프셋 > 오선 중앙
      let restKey: string;
      if (element.displayStep && element.displayOctave != null) {
        // MusicXML에서 지정한 위치 사용
        restKey = `${element.displayStep.toLowerCase()}/${element.displayOctave}`;
      } else if (isMultiVoice) {
        // 다성부: 충돌 방지를 위해 voice별 오프셋
        if (clef === 'bass') {
          restKey = voiceNum <= 1 ? 'f/3' : 'b/2';
        } else if (clef === 'alto' || clef === 'tenor') {
          restKey = voiceNum <= 1 ? 'd/4' : 'f/3';
        } else {
          restKey = voiceNum <= 1 ? 'd/5' : 'f/4';
        }
      } else {
        // 단일 성부: 오선 중앙
        if (clef === 'bass') {
          restKey = 'd/3';
        } else if (clef === 'alto' || clef === 'tenor') {
          restKey = 'b/3';
        } else {
          restKey = 'b/4';
        }
      }

      const staveNote = new StaveNote({
        keys: [restKey],
        duration,
        clef,
      });

      for (let d = 0; d < element.duration.dots; d++) {
        Dot.buildAndAttach([staveNote]);
      }

      return staveNote;
    } catch (e) {
      console.warn('[ScoreRenderer] createRestNote failed:', { elementId: element.id, staffNum, error: e });
      return null;
    }
  }

  private createGraceNoteAttached(
    element: NoteElement,
    keys: string[],
    duration: string,
    voiceNum: number,
    clef: string,
  ): StaveNote | null {
    try {
      // 꾸밈음은 GraceNote로 생성하고 다음 음표에 붙여야 하지만,
      // 단순화를 위해 일반 음표로 렌더링 (MVP)
      const graceNote = new GraceNote({
        keys,
        duration: '8', // 꾸밈음은 보통 8분음표
        slash: element.graceNote?.slash ?? true,
      });

      // GraceNoteGroup으로 감싸서 반환하려면 다음 음표가 필요하므로
      // 여기서는 일반 StaveNote로 대체
      const staveNote = new StaveNote({
        keys,
        duration,
        clef,
        stemDirection: voiceNum === 2 ? -1 : 1,
      });

      const graceGroup = new GraceNoteGroup([graceNote]);
      staveNote.addModifier(graceGroup);

      return staveNote;
    } catch (e) {
      console.warn('[ScoreRenderer] createGraceNoteAttached failed:', { elementId: element.id, error: e });
      return null;
    }
  }

  // ─── 빔 추적 ───

  private trackBeam(
    element: NoteElement,
    staveNote: StaveNote,
    currentBeamNotes: StaveNote[],
    beams: BeamGroup[],
    voiceNum: number,
    staffNum: number,
  ): void {
    if (!element.beam || element.beam.length === 0) return;

    const primaryBeam = element.beam[0];
    if (primaryBeam.type === 'begin') {
      // 이전 빔 그룹 플러시
      if (currentBeamNotes.length >= 2) {
        beams.push({ notes: [...currentBeamNotes], voice: voiceNum, staff: staffNum });
      }
      currentBeamNotes.length = 0;
      currentBeamNotes.push(staveNote);
    } else if (primaryBeam.type === 'continue') {
      currentBeamNotes.push(staveNote);
    } else if (primaryBeam.type === 'end') {
      currentBeamNotes.push(staveNote);
      if (currentBeamNotes.length >= 2) {
        beams.push({ notes: [...currentBeamNotes], voice: voiceNum, staff: staffNum });
      }
      currentBeamNotes.length = 0;
    }
  }

  // ─── 잇단음표 추적 ───

  private trackTuplet(
    element: NoteElement,
    staveNote: StaveNote,
    currentTupletNotes: StaveNote[],
    currentTupletInfo: { actualNotes: number; normalNotes: number },
    tuplets: TupletGroup[],
  ): void {
    if (!element.duration.tuplet) return;

    const tupletInfo = element.duration.tuplet;
    if (tupletInfo.type === 'start') {
      // 이전 잇단음표 그룹 플러시
      if (currentTupletNotes.length > 0 && currentTupletInfo.actualNotes > 0) {
        tuplets.push({
          notes: [...currentTupletNotes],
          actualNotes: currentTupletInfo.actualNotes,
          normalNotes: currentTupletInfo.normalNotes,
        });
      }
      currentTupletNotes.length = 0;
      currentTupletNotes.push(staveNote);
      // Update info via mutation (since we pass by reference)
      currentTupletInfo.actualNotes = tupletInfo.actualNotes;
      currentTupletInfo.normalNotes = tupletInfo.normalNotes;
    } else if (tupletInfo.type === 'stop') {
      currentTupletNotes.push(staveNote);
      if (currentTupletNotes.length > 0 && currentTupletInfo.actualNotes > 0) {
        tuplets.push({
          notes: [...currentTupletNotes],
          actualNotes: currentTupletInfo.actualNotes,
          normalNotes: currentTupletInfo.normalNotes,
        });
      }
      currentTupletNotes.length = 0;
      currentTupletInfo.actualNotes = 0;
      currentTupletInfo.normalNotes = 0;
    } else {
      currentTupletNotes.push(staveNote);
    }
  }

  // ─── 타이 렌더링 ───

  private renderTies(allRenderedNotes: RenderedNote[]): void {
    if (!this.context) return;

    const tieStarts = new Map<string, RenderedNote>();

    for (const rn of allRenderedNotes) {
      if (rn.element.type !== 'note') continue;
      const note = rn.element;

      if (note.tie?.type === 'start') {
        const key = `${rn.voice}-${rn.staff}-${mapPitchToVexKey(note.pitch)}`;
        tieStarts.set(key, rn);
      } else if (note.tie?.type === 'stop') {
        const key = `${rn.voice}-${rn.staff}-${mapPitchToVexKey(note.pitch)}`;
        const startNote = tieStarts.get(key);
        if (startNote) {
          try {
            const tie = new StaveTie({
              firstNote: startNote.staveNote,
              lastNote: rn.staveNote,
              firstIndexes: [0],
              lastIndexes: [0],
            });
            tie.setContext(this.context!).draw();
          } catch (e) {
            console.warn('[ScoreRenderer] tie rendering failed:', { key, error: e });
          }
          tieStarts.delete(key);
        }
      }
    }
  }

  // ─── 슬러 렌더링 ───

  private renderSlurs(allRenderedNotes: RenderedNote[]): void {
    if (!this.context) return;

    const slurStarts = new Map<string, RenderedNote>();

    for (const rn of allRenderedNotes) {
      if (rn.element.type !== 'note') continue;
      const note = rn.element;

      if (note.slur) {
        for (const slur of note.slur) {
          const key = `${slur.number}-${rn.voice}-${rn.staff}`;
          if (slur.type === 'start') {
            slurStarts.set(key, rn);
          } else if (slur.type === 'stop') {
            const startNote = slurStarts.get(key);
            if (startNote) {
              try {
                const curve = new Curve(startNote.staveNote, rn.staveNote, {
                  cps: [
                    { x: 0, y: 20 },
                    { x: 0, y: 20 },
                  ],
                });
                curve.setContext(this.context!).draw();
              } catch (e) {
                console.warn('[ScoreRenderer] slur rendering failed:', { key, error: e });
              }
              slurStarts.delete(key);
            }
          }
        }
      }
    }
  }

  // ─── Direction 렌더링 ───

  private renderDirections(directions: Direction[], staves: Stave[]): void {
    if (!this.context || !directions) return;

    for (const dir of directions) {
      const staffIdx = (dir.staff ?? 1) - 1;
      const stave = staves[staffIdx] ?? staves[0];
      if (!stave) continue;

      switch (dir.type.kind) {
        case 'tempo':
          stave.setTempo({ bpm: dir.type.bpm, name: dir.type.text ?? '' }, 0);
          break;
        // rehearsal, words, dynamic, wedge, pedal — post-MVP에서 텍스트 렌더링 구현
        default:
          break;
      }
    }
  }

  // ─── 조표 변화음 판별 ───

  /** 5도권 기반 샤프/플랫 음이름 테이블 */
  private static readonly SHARP_ORDER: readonly string[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  private static readonly FLAT_ORDER: readonly string[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

  /**
   * 주어진 음의 alter가 현재 조표에 이미 포함된 변화음인지 판별한다.
   * 예: Bb장조(fifths=-2)에서 Bb(alter=-1)과 Eb(alter=-1)은 조표에 포함 → true
   */
  private isAlterInKeySignature(step: string, alter: number, fifths: number): boolean {
    if (fifths === 0) return false;

    if (fifths > 0 && alter === 1) {
      const sharpNotes = ScoreRenderer.SHARP_ORDER.slice(0, fifths);
      return sharpNotes.includes(step);
    }

    if (fifths < 0 && alter === -1) {
      const flatNotes = ScoreRenderer.FLAT_ORDER.slice(0, Math.abs(fifths));
      return flatNotes.includes(step);
    }

    return false;
  }

  // ─── 볼타 괄호 렌더링 ───

  private renderEnding(ending: EndingInfo, stave: Stave): void {
    if (!this.context) return;

    try {
      const voltaType = ending.type === 'start'
        ? Volta.type.BEGIN
        : ending.type === 'stop'
          ? Volta.type.END
          : Volta.type.MID;

      const text = ending.text ?? ending.number.join(', ') + '.';
      stave.setVoltaType(voltaType, text, 0);
    } catch (e) {
      console.warn('[ScoreRenderer] volta rendering failed:', { endingType: ending.type, endingNumber: ending.number, error: e });
    }
  }
}

// ─── 잇단음표 그룹 타입 ───

interface TupletGroup {
  notes: StaveNote[];
  actualNotes: number;
  normalNotes: number;
}
