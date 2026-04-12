/**
 * MusicXML → Score_Data 파서 구현 (DOMParser 기반)
 * MusicXML 3.1 score-partwise 형식을 파싱하여 Score_Data로 변환한다.
 * DOMParser를 사용하여 원래 XML 요소 순서를 보존한다.
 *
 * MVP 지원 범위:
 * - score-partwise 형식 (score-timewise 미지원)
 * - part-list, part, measure, attributes, note, rest, forward, backup
 * - pitch, duration, type, dot, chord, tie, tied, slur, beam, grace
 * - articulations, ornaments, dynamics, lyric, fingering
 * - barline, repeat, ending, direction (tempo, dynamic, wedge, pedal, rehearsal, segno, coda, words)
 * - harmony (chord symbols)
 */

import { DOMParser } from '@xmldom/xmldom';
import type {
  ScoreData,
  Part,
  Measure,
  MeasureAttributes,
  KeySignature,
  TimeSignature,
  Clef,
  MeasureElement,
  NoteElement,
  RestElement,
  Forward,
  Backup,
  Pitch,
  PitchStep,
  Duration,
  NoteType,
  BeamInfo,
  TieInfo,
  SlurInfo,
  GraceNoteInfo,
  Articulation,
  Ornament,
  DynamicMark,
  Fingering,
  Lyric,
  Harmony,
  Barline,
  EndingInfo,
  Direction,
  DirectionType,
  WedgeInfo,
  PedalInfo,
  Credit,
} from '../types';
import type { IScoreSerializer } from './IScoreSerializer';

// ─── ID generator ───

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

// ─── DOM helpers ───

/** Get text content of a direct child element (direct children only, not descendants) */
function getChildText(el: Element, tag: string): string | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 1 && (child as Element).tagName === tag) {
      return (child as Element).textContent?.trim() ?? null;
    }
  }
  return null;
}

/** Get numeric value of a direct child element */
function getChildNumber(el: Element, tag: string, fallback: number = 0): number {
  const text = getChildText(el, tag);
  return text != null ? Number(text) : fallback;
}

/** Get attribute value */
function getAttr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/** Get direct child elements with a specific tag name */
function directChildren(el: Element, tag: string): Element[] {
  const result: Element[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const child = el.childNodes[i];
    if (child.nodeType === 1 && (child as Element).tagName === tag) {
      result.push(child as Element);
    }
  }
  return result;
}

/** Check if element has a direct child with the given tag */
function hasChild(el: Element, tag: string): boolean {
  return directChildren(el, tag).length > 0;
}

// ─── Static maps ───

const NOTE_TYPE_MAP: Record<string, NoteType> = {
  whole: 'whole', half: 'half', quarter: 'quarter', eighth: 'eighth',
  '16th': '16th', '32nd': '32nd', '64th': '64th', '128th': '128th',
};

const ARTICULATION_MAP: Record<string, Articulation> = {
  staccato: 'staccato', staccatissimo: 'staccatissimo', tenuto: 'tenuto',
  accent: 'accent', 'strong-accent': 'strong-accent', marcato: 'marcato',
  fermata: 'fermata', 'detached-legato': 'detached-legato',
  spiccato: 'spiccato', 'breath-mark': 'breath-mark',
};

const ORNAMENT_MAP: Record<string, Ornament> = {
  'trill-mark': 'trill', turn: 'turn', 'inverted-turn': 'inverted-turn',
  mordent: 'mordent', 'inverted-mordent': 'inverted-mordent',
  tremolo: 'tremolo', shake: 'shake',
};

const DYNAMIC_VALUES = new Set<string>([
  'pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff',
  'sfz', 'sfp', 'fp', 'rf', 'rfz',
]);

const BARLINE_STYLE_MAP: Record<string, Barline['style']> = {
  regular: 'regular', dotted: 'dotted', dashed: 'dashed', heavy: 'heavy',
  'light-light': 'light-light', 'light-heavy': 'light-heavy',
  'heavy-light': 'heavy-light', 'heavy-heavy': 'heavy-heavy', none: 'none',
};

// ─── Parsing functions ───

function parseAttributes(el: Element): MeasureAttributes {
  const result: MeasureAttributes = {};

  const divText = getChildText(el, 'divisions');
  if (divText != null) result.divisions = Number(divText);

  const stavesText = getChildText(el, 'staves');
  if (stavesText != null) result.staves = Number(stavesText);

  const keyEl = directChildren(el, 'key')[0];
  if (keyEl) result.keySignature = parseKeySignature(keyEl);

  const timeEl = directChildren(el, 'time')[0];
  if (timeEl) result.timeSignature = parseTimeSignature(timeEl);

  const clefEls = directChildren(el, 'clef');
  if (clefEls.length > 0) {
    result.clef = clefEls.map((c, i) => parseClef(c, i));
  }

  return result;
}

function parseKeySignature(el: Element): KeySignature {
  return {
    fifths: getChildNumber(el, 'fifths', 0),
    mode: getChildText(el, 'mode') === 'minor' ? 'minor' : 'major',
  };
}

function parseTimeSignature(el: Element): TimeSignature {
  const result: TimeSignature = {
    beats: getChildNumber(el, 'beats', 4),
    beatType: getChildNumber(el, 'beat-type', 4),
  };
  const symbol = getAttr(el, 'symbol');
  if (symbol === 'common') result.symbol = 'common';
  else if (symbol === 'cut') result.symbol = 'cut';
  return result;
}

function parseClef(el: Element, index: number): Clef {
  const numAttr = getAttr(el, 'number');
  const staffNum = numAttr != null ? Number(numAttr) : index + 1;
  const result: Clef = {
    sign: (getChildText(el, 'sign') as Clef['sign']) ?? 'G',
    line: getChildNumber(el, 'line', 2),
    staffNumber: staffNum,
  };
  const octChange = getChildText(el, 'clef-octave-change');
  if (octChange != null) result.octaveChange = Number(octChange);
  return result;
}

function parsePitch(el: Element): Pitch {
  const result: Pitch = {
    step: (getChildText(el, 'step') as PitchStep) ?? 'C',
    octave: getChildNumber(el, 'octave', 4),
  };
  const alterText = getChildText(el, 'alter');
  if (alterText != null) result.alter = Number(alterText);
  return result;
}

function parseDuration(noteEl: Element, currentDivisions: number): Duration {
  const durText = getChildText(noteEl, 'duration');
  const divisions = durText != null ? Number(durText) : currentDivisions;
  const typeText = getChildText(noteEl, 'type');
  const noteType = NOTE_TYPE_MAP[typeText ?? ''] ?? 'quarter';
  const dots = directChildren(noteEl, 'dot').length;

  const result: Duration = { divisions, noteType, dots };

  // Tuplet from time-modification
  const timeMod = directChildren(noteEl, 'time-modification')[0];
  if (timeMod) {
    let tupletType: 'start' | 'stop' = 'start';
    const notationsEl = directChildren(noteEl, 'notations')[0];
    if (notationsEl) {
      const tupletEl = directChildren(notationsEl, 'tuplet')[0];
      if (tupletEl && getAttr(tupletEl, 'type') === 'stop') {
        tupletType = 'stop';
      }
    }
    result.tuplet = {
      actualNotes: getChildNumber(timeMod, 'actual-notes', 3),
      normalNotes: getChildNumber(timeMod, 'normal-notes', 2),
      type: tupletType,
    };
  }

  return result;
}

function parseBeams(noteEl: Element): BeamInfo[] | undefined {
  const beamEls = directChildren(noteEl, 'beam');
  if (beamEls.length === 0) return undefined;

  return beamEls.map((b) => {
    const text = b.textContent?.trim() ?? 'continue';
    let type: BeamInfo['type'] = 'continue';
    if (text === 'begin') type = 'begin';
    else if (text === 'end') type = 'end';
    return {
      number: Number(getAttr(b, 'number') ?? 1),
      type,
    };
  });
}

function parseTie(noteEl: Element): TieInfo | undefined {
  const tieEls = directChildren(noteEl, 'tie');
  if (tieEls.length === 0) return undefined;
  if (tieEls.length >= 2) return { type: 'continue' };
  const tieType = getAttr(tieEls[0], 'type') ?? 'start';
  return { type: tieType as TieInfo['type'] };
}

function parseSlurs(noteEl: Element): SlurInfo[] | undefined {
  const notationsEl = directChildren(noteEl, 'notations')[0];
  if (!notationsEl) return undefined;
  const slurEls = directChildren(notationsEl, 'slur');
  if (slurEls.length === 0) return undefined;

  return slurEls.map((s) => {
    const result: SlurInfo = {
      number: Number(getAttr(s, 'number') ?? 1),
      type: (getAttr(s, 'type') as SlurInfo['type']) ?? 'start',
    };
    const placement = getAttr(s, 'placement');
    if (placement) result.placement = placement as 'above' | 'below';
    return result;
  });
}

function parseGraceNote(noteEl: Element): GraceNoteInfo | undefined {
  const graceEl = directChildren(noteEl, 'grace')[0];
  if (!graceEl) return undefined;
  return {
    slash: getAttr(graceEl, 'slash') === 'yes',
    stealTimePrevious: getAttr(graceEl, 'steal-time-previous') != null
      ? Number(getAttr(graceEl, 'steal-time-previous')) : undefined,
    stealTimeFollowing: getAttr(graceEl, 'steal-time-following') != null
      ? Number(getAttr(graceEl, 'steal-time-following')) : undefined,
  };
}

function parseArticulations(noteEl: Element): Articulation[] | undefined {
  const notationsEl = directChildren(noteEl, 'notations')[0];
  if (!notationsEl) return undefined;
  const artEls = directChildren(notationsEl, 'articulations');
  if (artEls.length === 0) return undefined;

  const result: Articulation[] = [];
  for (const artGroup of artEls) {
    for (let i = 0; i < artGroup.childNodes.length; i++) {
      const child = artGroup.childNodes[i];
      if (child.nodeType === 1) {
        const mapped = ARTICULATION_MAP[(child as Element).tagName];
        if (mapped) result.push(mapped);
      }
    }
  }
  return result.length > 0 ? result : undefined;
}

function parseOrnaments(noteEl: Element): Ornament[] | undefined {
  const notationsEl = directChildren(noteEl, 'notations')[0];
  if (!notationsEl) return undefined;
  const ornEls = directChildren(notationsEl, 'ornaments');
  if (ornEls.length === 0) return undefined;

  const result: Ornament[] = [];
  for (const ornGroup of ornEls) {
    for (let i = 0; i < ornGroup.childNodes.length; i++) {
      const child = ornGroup.childNodes[i];
      if (child.nodeType === 1) {
        const mapped = ORNAMENT_MAP[(child as Element).tagName];
        if (mapped) result.push(mapped);
      }
    }
  }
  return result.length > 0 ? result : undefined;
}

function parseDynamicsFromNotations(noteEl: Element): DynamicMark | undefined {
  const notationsEl = directChildren(noteEl, 'notations')[0];
  if (!notationsEl) return undefined;
  const dynEls = directChildren(notationsEl, 'dynamics');
  if (dynEls.length === 0) return undefined;

  for (const dynGroup of dynEls) {
    for (let i = 0; i < dynGroup.childNodes.length; i++) {
      const child = dynGroup.childNodes[i];
      if (child.nodeType === 1 && DYNAMIC_VALUES.has((child as Element).tagName)) {
        return (child as Element).tagName as DynamicMark;
      }
    }
  }
  return undefined;
}

function parseLyrics(noteEl: Element): Lyric[] | undefined {
  const lyricEls = directChildren(noteEl, 'lyric');
  if (lyricEls.length === 0) return undefined;

  return lyricEls.map((l) => ({
    number: Number(getAttr(l, 'number') ?? 1),
    syllabic: (getChildText(l, 'syllabic') as Lyric['syllabic']) ?? 'single',
    text: getChildText(l, 'text') ?? '',
  }));
}

function parseFingering(noteEl: Element): Fingering | undefined {
  const notationsEl = directChildren(noteEl, 'notations')[0];
  if (!notationsEl) return undefined;
  const technicalEl = directChildren(notationsEl, 'technical')[0];
  if (!technicalEl) return undefined;
  const fingeringEl = directChildren(technicalEl, 'fingering')[0];
  if (!fingeringEl) return undefined;

  const finger = Number(fingeringEl.textContent?.trim() ?? NaN);
  if (isNaN(finger)) return undefined;

  const result: Fingering = { finger };
  const placement = getAttr(fingeringEl, 'placement');
  if (placement) result.placement = placement as 'above' | 'below';
  return result;
}

function parseNoteElement(noteEl: Element, currentDivisions: number): NoteElement | RestElement {
  const isRest = hasChild(noteEl, 'rest');
  const voice = getChildNumber(noteEl, 'voice', 1);
  const staff = getChildNumber(noteEl, 'staff', 1);
  const isGrace = hasChild(noteEl, 'grace');

  const duration = isGrace
    ? {
        divisions: 0,
        noteType: NOTE_TYPE_MAP[getChildText(noteEl, 'type') ?? ''] ?? ('eighth' as NoteType),
        dots: directChildren(noteEl, 'dot').length,
      }
    : parseDuration(noteEl, currentDivisions);

  if (isRest) {
    const rest: RestElement = { type: 'rest', id: nextId('rest'), duration, voice, staff };
    const restEl = directChildren(noteEl, 'rest')[0];
    if (restEl) {
      const ds = getChildText(restEl, 'display-step');
      const doct = getChildText(restEl, 'display-octave');
      if (ds) rest.displayStep = ds;
      if (doct) rest.displayOctave = Number(doct);
    }
    return rest;
  }

  // Note
  const pitchEl = directChildren(noteEl, 'pitch')[0];
  const note: NoteElement = {
    type: 'note',
    id: nextId('note'),
    pitch: pitchEl ? parsePitch(pitchEl) : { step: 'C', octave: 4 },
    duration,
    voice,
    staff,
  };

  // Stem
  const stemText = getChildText(noteEl, 'stem');
  if (stemText === 'up' || stemText === 'down' || stemText === 'none') {
    note.stem = stemText;
  }

  // Chord
  if (hasChild(noteEl, 'chord')) note.chord = true;

  // Grace
  const graceNote = parseGraceNote(noteEl);
  if (graceNote) note.graceNote = graceNote;

  // Beam
  const beams = parseBeams(noteEl);
  if (beams) note.beam = beams;

  // Tie
  const tie = parseTie(noteEl);
  if (tie) note.tie = tie;

  // Slur
  const slurs = parseSlurs(noteEl);
  if (slurs) note.slur = slurs;

  // Articulations
  const articulations = parseArticulations(noteEl);
  if (articulations) note.articulations = articulations;

  // Ornaments
  const ornaments = parseOrnaments(noteEl);
  if (ornaments) note.ornaments = ornaments;

  // Dynamics (from notations)
  const dynamics = parseDynamicsFromNotations(noteEl);
  if (dynamics) note.dynamics = dynamics;

  // Lyrics
  const lyrics = parseLyrics(noteEl);
  if (lyrics) note.lyrics = lyrics;

  // Fingering
  const fingering = parseFingering(noteEl);
  if (fingering) note.fingering = fingering;

  return note;
}

function parseForward(el: Element): Forward {
  return {
    type: 'forward',
    duration: {
      divisions: getChildNumber(el, 'duration', 0),
      noteType: 'quarter',
      dots: 0,
    },
    voice: getChildNumber(el, 'voice', 1),
    staff: getChildNumber(el, 'staff', 1),
  };
}

function parseBackup(el: Element): Backup {
  return {
    type: 'backup',
    duration: {
      divisions: getChildNumber(el, 'duration', 0),
      noteType: 'quarter',
      dots: 0,
    },
  };
}

// ─── Harmony parsing ───

/** MusicXML kind → display suffix mapping */
const HARMONY_KIND_MAP: Record<string, string> = {
  major: '', minor: 'm', dominant: '7', 'major-seventh': 'maj7',
  'minor-seventh': 'm7', diminished: 'dim', augmented: 'aug',
  'diminished-seventh': 'dim7', 'half-diminished': 'm7b5',
  'major-minor': 'mMaj7', 'major-sixth': '6', 'minor-sixth': 'm6',
  suspended: 'sus', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4',
  power: '5', none: '',
};

function parseHarmony(el: Element): Harmony | null {
  const rootEl = directChildren(el, 'root')[0];
  if (!rootEl) return null;

  const rootStep = getChildText(rootEl, 'root-step') as PitchStep | null;
  if (!rootStep) return null;

  const rootAlterText = getChildText(rootEl, 'root-alter');
  const root: Harmony['root'] = { step: rootStep };
  if (rootAlterText != null) root.alter = Number(rootAlterText);

  const kind = getChildText(el, 'kind') ?? 'major';
  const result: Harmony = { root, kind };

  // Bass note (for inversions like C/G)
  const bassEl = directChildren(el, 'bass')[0];
  if (bassEl) {
    const bassStep = getChildText(bassEl, 'bass-step') as PitchStep | null;
    if (bassStep) {
      result.bass = { step: bassStep };
      const bassAlterText = getChildText(bassEl, 'bass-alter');
      if (bassAlterText != null) result.bass.alter = Number(bassAlterText);
    }
  }

  // Offset
  const offsetText = getChildText(el, 'offset');
  if (offsetText != null) result.offset = Number(offsetText);

  return result;
}

// ─── Barline parsing ───

function parseBarline(el: Element): Barline {
  const location = (getAttr(el, 'location') as Barline['location']) ?? 'right';
  const style = BARLINE_STYLE_MAP[getChildText(el, 'bar-style') ?? ''] ?? 'regular';
  const result: Barline = { location, style };

  // Repeat
  const repeatEl = directChildren(el, 'repeat')[0];
  if (repeatEl) {
    result.repeat = {
      direction: getAttr(repeatEl, 'direction') === 'forward' ? 'forward' : 'backward',
    };
    const times = getAttr(repeatEl, 'times');
    if (times != null) result.repeat.times = Number(times);
  }

  // Ending
  const endingEls = directChildren(el, 'ending');
  if (endingEls.length > 0) {
    const endingEl = endingEls[0];
    const numberStr = getAttr(endingEl, 'number') ?? '1';
    const numbers = numberStr.split(/[,\s]+/).map(Number).filter((n) => !isNaN(n));
    const endingInfo: EndingInfo = {
      number: numbers.length > 0 ? numbers : [1],
      type: (getAttr(endingEl, 'type') as EndingInfo['type']) ?? 'start',
    };
    const text = endingEl.textContent?.trim();
    if (text) endingInfo.text = text;
    result.ending = endingInfo;
  }

  return result;
}

// ─── Direction parsing ───

function parseDirection(el: Element): Direction | null {
  const placement = (getAttr(el, 'placement') as Direction['placement']) ?? 'above';
  const staffText = getChildText(el, 'staff');
  const staff = staffText != null ? Number(staffText) : undefined;
  const offsetText = getChildText(el, 'offset');
  const offset = offsetText != null ? Number(offsetText) : undefined;

  const dirTypeEl = directChildren(el, 'direction-type')[0];
  if (!dirTypeEl) return null;

  const parsedType = parseDirectionType(dirTypeEl, el);
  if (!parsedType) return null;

  const result: Direction = { type: parsedType, placement };
  if (offset != null) result.offset = offset;
  if (staff != null) result.staff = staff;
  return result;
}

function parseDirectionType(dirTypeEl: Element, dirEl: Element): DirectionType | null {
  // Tempo (from sound element)
  const soundEl = directChildren(dirEl, 'sound')[0];
  if (soundEl) {
    const tempoAttr = getAttr(soundEl, 'tempo');
    if (tempoAttr != null) {
      const result: DirectionType = { kind: 'tempo', bpm: Number(tempoAttr) };
      // Check for metronome element (more detailed tempo info)
      const metronomeEl = directChildren(dirTypeEl, 'metronome')[0];
      if (metronomeEl) {
        const perMinute = getChildText(metronomeEl, 'per-minute');
        if (perMinute) (result as { bpm: number }).bpm = Number(perMinute);
      }
      const wordsEl = directChildren(dirTypeEl, 'words')[0];
      if (wordsEl) {
        const text = wordsEl.textContent?.trim();
        if (text) (result as { kind: 'tempo'; bpm: number; text?: string }).text = text;
      }
      return result;
    }
  }

  // Dynamics
  const dynEl = directChildren(dirTypeEl, 'dynamics')[0];
  if (dynEl) {
    for (let i = 0; i < dynEl.childNodes.length; i++) {
      const child = dynEl.childNodes[i];
      if (child.nodeType === 1 && DYNAMIC_VALUES.has((child as Element).tagName)) {
        return { kind: 'dynamic', value: (child as Element).tagName as DynamicMark };
      }
    }
  }

  // Wedge
  const wedgeEl = directChildren(dirTypeEl, 'wedge')[0];
  if (wedgeEl) {
    const wedgeType = getAttr(wedgeEl, 'type') ?? 'stop';
    let value: WedgeInfo;
    if (wedgeType === 'crescendo') value = { type: 'crescendo' };
    else if (wedgeType === 'diminuendo') value = { type: 'diminuendo' };
    else value = { type: 'stop' };
    return { kind: 'wedge', value };
  }

  // Pedal
  const pedalEl = directChildren(dirTypeEl, 'pedal')[0];
  if (pedalEl) {
    const pedalType = (getAttr(pedalEl, 'type') ?? 'start') as PedalInfo['type'];
    const value: PedalInfo = { type: pedalType };
    const line = getAttr(pedalEl, 'line');
    if (line != null) value.line = line === 'yes';
    return { kind: 'pedal', value };
  }

  // Rehearsal
  const rehEl = directChildren(dirTypeEl, 'rehearsal')[0];
  if (rehEl) {
    return { kind: 'rehearsal', text: rehEl.textContent?.trim() ?? '' };
  }

  // Segno
  if (directChildren(dirTypeEl, 'segno').length > 0) return { kind: 'segno' };

  // Coda
  if (directChildren(dirTypeEl, 'coda').length > 0) return { kind: 'coda' };

  // Words (generic text direction)
  const wordsEl = directChildren(dirTypeEl, 'words')[0];
  if (wordsEl) {
    return { kind: 'words', text: wordsEl.textContent?.trim() ?? '' };
  }

  return null;
}

// ─── Measure parsing (preserves original XML order) ───

function parseMeasure(
  measureEl: Element,
  currentDivisions: number,
): { measure: Measure; divisions: number } {
  const rawNumber = Number(getAttr(measureEl, 'number') ?? 1);
  const number = isNaN(rawNumber) ? 0 : rawNumber;
  const measure: Measure = { number, elements: [], directions: [] };
  let divisions = currentDivisions;

  // Iterate children in original XML order — the core advantage of DOMParser
  for (let i = 0; i < measureEl.childNodes.length; i++) {
    const child = measureEl.childNodes[i];
    if (child.nodeType !== 1) continue;
    const el = child as Element;

    switch (el.tagName) {
      case 'attributes': {
        measure.attributes = parseAttributes(el);
        if (measure.attributes.divisions != null) {
          divisions = measure.attributes.divisions;
        }
        break;
      }
      case 'note':
        measure.elements.push(parseNoteElement(el, divisions));
        break;
      case 'forward':
        measure.elements.push(parseForward(el));
        break;
      case 'backup':
        measure.elements.push(parseBackup(el));
        break;
      case 'direction': {
        const dir = parseDirection(el);
        if (dir) measure.directions.push(dir);
        break;
      }
      case 'barline':
        measure.barline = parseBarline(el);
        break;
      case 'harmony': {
          const h = parseHarmony(el);
          if (h) {
            if (!measure.harmonies) measure.harmonies = [];
            measure.harmonies.push(h);
          }
          break;
        }
    }
  }

  return { measure, divisions };
}

// ─── Part parsing ───

interface PartInfo {
  id: string;
  name: string;
  abbreviation?: string;
}

function parsePartList(partListEl: Element): PartInfo[] {
  const scoreParts = directChildren(partListEl, 'score-part');
  return scoreParts.map((sp) => {
    const info: PartInfo = {
      id: getAttr(sp, 'id') ?? '',
      name: getChildText(sp, 'part-name') ?? '',
    };
    const abbr = getChildText(sp, 'part-abbreviation');
    if (abbr != null) info.abbreviation = abbr;
    return info;
  });
}

function parsePart(partEl: Element, partInfo: PartInfo): Part {
  const measureEls = directChildren(partEl, 'measure');
  const part: Part = {
    id: partInfo.id,
    name: partInfo.name,
    staves: 1,
    measures: [],
  };

  if (partInfo.abbreviation) part.abbreviation = partInfo.abbreviation;

  let currentDivisions = 1;
  for (const measureEl of measureEls) {
    const { measure, divisions } = parseMeasure(measureEl, currentDivisions);
    currentDivisions = divisions;
    part.measures.push(measure);
  }

  // Determine staves count
  for (const m of part.measures) {
    if (m.attributes?.staves != null && m.attributes.staves > part.staves) {
      part.staves = m.attributes.staves;
    }
  }

  return part;
}

// ─── Credits parsing ───

function parseCredits(scoreEl: Element): Credit[] {
  const creditEls = directChildren(scoreEl, 'credit');
  const result: Credit[] = [];

  for (const creditEl of creditEls) {
    const wordEls = directChildren(creditEl, 'credit-words');
    if (wordEls.length === 0) continue;

    const text = wordEls[0].textContent?.trim() ?? '';

    let type: Credit['type'] = 'title';
    const typeText = getChildText(creditEl, 'credit-type')?.toLowerCase();
    if (typeText) {
      if (typeText.includes('composer')) type = 'composer';
      else if (typeText.includes('arranger')) type = 'arranger';
      else if (typeText.includes('lyricist')) type = 'lyricist';
      else if (typeText.includes('subtitle')) type = 'subtitle';
    }

    result.push({ type, text });
  }

  return result;
}

// ─── Main parser class ───

export class MusicXMLParser implements Pick<IScoreSerializer, 'fromMusicXML'> {
  /**
   * MusicXML 문자열을 파싱하여 ScoreData로 변환한다.
   * score-partwise 형식만 지원한다.
   */
  fromMusicXML(xml: string): ScoreData {
    resetIdCounter();

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    // Cast to global Element type for compatibility with both @xmldom and browser DOM
    const scorePartwise = doc.getElementsByTagName('score-partwise')[0] as unknown as Element;

    if (!scorePartwise) {
      throw new Error(
        'Unsupported MusicXML format: only <score-partwise> is supported.',
      );
    }

    // Parse part-list
    const partListEl = directChildren(scorePartwise, 'part-list')[0];
    const partInfos = partListEl ? parsePartList(partListEl) : [];

    const partInfoMap = new Map<string, PartInfo>();
    for (const info of partInfos) {
      partInfoMap.set(info.id, info);
    }

    // Parse parts
    const partEls = directChildren(scorePartwise, 'part');
    const parts: Part[] = partEls.map((partEl) => {
      const partId = getAttr(partEl, 'id') ?? '';
      const info = partInfoMap.get(partId) ?? { id: partId, name: '' };
      return parsePart(partEl, info);
    });

    // Parse credits
    const credits = parseCredits(scorePartwise);

    const result: ScoreData = { parts };
    if (credits.length > 0) result.credits = credits;

    return result;
  }
}
