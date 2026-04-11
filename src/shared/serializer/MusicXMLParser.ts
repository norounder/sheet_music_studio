/**
 * MusicXML → Score_Data 파서 구현
 * MusicXML 3.1 score-partwise 형식을 파싱하여 Score_Data로 변환한다.
 *
 * MVP 지원 범위:
 * - score-partwise 형식 (score-timewise 미지원)
 * - part-list, part, measure, attributes, note, rest, forward, backup
 * - pitch, duration, type, dot, chord, tie, tied, slur, beam, grace
 * - articulations, ornaments, dynamics, lyric, fingering
 * - barline, repeat, ending, direction (tempo, dynamic, wedge, pedal, rehearsal, segno, coda, words)
 *
 * 후속 지원 항목:
 * - score-timewise 형식
 * - figured-bass, harmony, print, sound (일부)
 * - 복잡한 tuplet 중첩
 * - 다중 credit 페이지 레이아웃
 */

import { XMLParser } from 'fast-xml-parser';
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
  TupletInfo,
  BeamInfo,
  TieInfo,
  SlurInfo,
  GraceNoteInfo,
  Articulation,
  Ornament,
  DynamicMark,
  Fingering,
  Lyric,
  Barline,
  EndingInfo,
  Direction,
  DirectionType,
  WedgeInfo,
  PedalInfo,
  Credit,
} from '../types';
import type { IScoreSerializer } from './IScoreSerializer';
import type { ValidationResult } from '../types';

// ─── Helper: ensure value is always an array ───

function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

// ─── Helper: unique ID generator ───

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

// ─── XML Parser configuration ───

const ALWAYS_ARRAY_TAGS = new Set([
  'part',
  'score-part',
  'measure',
  'note',
  'direction',
  'barline',
  'clef',
  'beam',
  'slur',
  'tied',
  'tie',
  'lyric',
  'credit',
  'credit-words',
  'dot',
  'forward',
  'backup',
  'ending',
  'articulations',
  'ornaments',
  'dynamics',
]);

function createXMLParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name: string) => ALWAYS_ARRAY_TAGS.has(name),
    parseTagValue: false,
    trimValues: true,
  });
}

// ─── Note type mapping ───

const NOTE_TYPE_MAP: Record<string, NoteType> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': '16th',
  '32nd': '32nd',
  '64th': '64th',
  '128th': '128th',
};

// ─── Articulation mapping ───

const ARTICULATION_MAP: Record<string, Articulation> = {
  staccato: 'staccato',
  staccatissimo: 'staccatissimo',
  tenuto: 'tenuto',
  accent: 'accent',
  'strong-accent': 'strong-accent',
  marcato: 'marcato',
  fermata: 'fermata',
  'detached-legato': 'detached-legato',
  spiccato: 'spiccato',
  'breath-mark': 'breath-mark',
};

// ─── Ornament mapping ───

const ORNAMENT_MAP: Record<string, Ornament> = {
  'trill-mark': 'trill',
  turn: 'turn',
  'inverted-turn': 'inverted-turn',
  mordent: 'mordent',
  'inverted-mordent': 'inverted-mordent',
  tremolo: 'tremolo',
  shake: 'shake',
};

// ─── Dynamic mapping ───

const DYNAMIC_VALUES = new Set<string>([
  'pppp', 'ppp', 'pp', 'p', 'mp',
  'mf', 'f', 'ff', 'fff', 'ffff',
  'sfz', 'sfp', 'fp', 'rf', 'rfz',
]);

// ─── Barline style mapping ───

const BARLINE_STYLE_MAP: Record<string, Barline['style']> = {
  regular: 'regular',
  dotted: 'dotted',
  dashed: 'dashed',
  heavy: 'heavy',
  'light-light': 'light-light',
  'light-heavy': 'light-heavy',
  'heavy-light': 'heavy-light',
  'heavy-heavy': 'heavy-heavy',
  none: 'none',
};

// ─── Parsing functions ───

function parseAttributes(attrXml: unknown): MeasureAttributes {
  const attr = attrXml as Record<string, unknown>;
  const result: MeasureAttributes = {};

  if (attr.divisions != null) {
    result.divisions = Number(attr.divisions);
  }

  if (attr.staves != null) {
    result.staves = Number(attr.staves);
  }

  if (attr.key != null) {
    result.keySignature = parseKeySignature(attr.key);
  }

  if (attr.time != null) {
    result.timeSignature = parseTimeSignature(attr.time);
  }

  if (attr.clef != null) {
    result.clef = ensureArray(attr.clef).map((c, i) => parseClef(c, i));
  }

  return result;
}

function parseKeySignature(keyXml: unknown): KeySignature {
  const key = keyXml as Record<string, unknown>;
  return {
    fifths: Number(key.fifths ?? 0),
    mode: (key.mode as string) === 'minor' ? 'minor' : 'major',
  };
}

function parseTimeSignature(timeXml: unknown): TimeSignature {
  const time = timeXml as Record<string, unknown>;
  const result: TimeSignature = {
    beats: Number(time.beats ?? 4),
    beatType: Number(time['beat-type'] ?? 4),
  };

  const symbol = (time as Record<string, unknown>)['@_symbol'] as string | undefined;
  if (symbol === 'common') result.symbol = 'common';
  else if (symbol === 'cut') result.symbol = 'cut';

  return result;
}

function parseClef(clefXml: unknown, index: number): Clef {
  const clef = clefXml as Record<string, unknown>;
  const staffNum = clef['@_number'] != null ? Number(clef['@_number']) : index + 1;
  const result: Clef = {
    sign: (clef.sign as string as Clef['sign']) ?? 'G',
    line: Number(clef.line ?? 2),
    staffNumber: staffNum,
  };

  if (clef['clef-octave-change'] != null) {
    result.octaveChange = Number(clef['clef-octave-change']);
  }

  return result;
}

function parsePitch(pitchXml: unknown): Pitch {
  const p = pitchXml as Record<string, unknown>;
  const result: Pitch = {
    step: (p.step as string as PitchStep) ?? 'C',
    octave: Number(p.octave ?? 4),
  };

  if (p.alter != null) {
    result.alter = Number(p.alter);
  }

  return result;
}

function parseDuration(noteXml: Record<string, unknown>, currentDivisions: number): Duration {
  const divisions = noteXml.duration != null ? Number(noteXml.duration) : currentDivisions;
  const noteType = NOTE_TYPE_MAP[noteXml.type as string] ?? 'quarter';
  const dots = ensureArray(noteXml.dot).length;

  const result: Duration = {
    divisions,
    noteType,
    dots,
  };

  // Parse tuplet from time-modification
  if (noteXml['time-modification'] != null) {
    const tm = noteXml['time-modification'] as Record<string, unknown>;
    // Tuplet type comes from notations/tuplet
    let tupletType: 'start' | 'stop' = 'start';
    const notations = noteXml.notations as Record<string, unknown> | undefined;
    if (notations?.tuplet != null) {
      const tupletXml = notations.tuplet as Record<string, unknown>;
      tupletType = (tupletXml['@_type'] as string) === 'stop' ? 'stop' : 'start';
    }

    result.tuplet = {
      actualNotes: Number(tm['actual-notes'] ?? 3),
      normalNotes: Number(tm['normal-notes'] ?? 2),
      type: tupletType,
    };
  }

  return result;
}

function parseBeams(noteXml: Record<string, unknown>): BeamInfo[] | undefined {
  const beams = ensureArray(noteXml.beam);
  if (beams.length === 0) return undefined;

  return beams.map((b) => {
    if (typeof b === 'object' && b !== null) {
      const beam = b as Record<string, unknown>;
      return {
        number: Number(beam['@_number'] ?? 1),
        type: parseBeamType(beam['#text'] as string ?? String(beam)),
      };
    }
    return {
      number: 1,
      type: parseBeamType(String(b)),
    };
  });
}

function parseBeamType(value: string): BeamInfo['type'] {
  if (value === 'begin') return 'begin';
  if (value === 'end') return 'end';
  return 'continue';
}

function parseTie(noteXml: Record<string, unknown>): TieInfo | undefined {
  const ties = ensureArray(noteXml.tie);
  if (ties.length === 0) return undefined;

  // If there are two ties (stop + start), it's a continue
  if (ties.length >= 2) {
    return { type: 'continue' };
  }

  const tie = ties[0] as Record<string, unknown>;
  const tieType = (tie['@_type'] as string) ?? 'start';
  return { type: tieType as TieInfo['type'] };
}

function parseSlurs(noteXml: Record<string, unknown>): SlurInfo[] | undefined {
  const notations = noteXml.notations as Record<string, unknown> | undefined;
  if (!notations) return undefined;

  const slurs = ensureArray(notations.slur);
  if (slurs.length === 0) return undefined;

  return slurs.map((s) => {
    const slur = s as Record<string, unknown>;
    const result: SlurInfo = {
      number: Number(slur['@_number'] ?? 1),
      type: (slur['@_type'] as string as SlurInfo['type']) ?? 'start',
    };
    if (slur['@_placement']) {
      result.placement = slur['@_placement'] as 'above' | 'below';
    }
    return result;
  });
}

function parseGraceNote(noteXml: Record<string, unknown>): GraceNoteInfo | undefined {
  if (noteXml.grace == null) return undefined;

  const grace = noteXml.grace as Record<string, unknown>;
  return {
    slash: grace['@_slash'] === 'yes',
    stealTimePrevious: grace['@_steal-time-previous'] != null
      ? Number(grace['@_steal-time-previous']) : undefined,
    stealTimeFollowing: grace['@_steal-time-following'] != null
      ? Number(grace['@_steal-time-following']) : undefined,
  };
}

function parseArticulations(noteXml: Record<string, unknown>): Articulation[] | undefined {
  const notations = noteXml.notations as Record<string, unknown> | undefined;
  if (!notations) return undefined;

  const articulationsArr = ensureArray(notations.articulations);
  if (articulationsArr.length === 0) return undefined;

  const result: Articulation[] = [];
  for (const artGroup of articulationsArr) {
    const group = artGroup as Record<string, unknown>;
    for (const [key, _value] of Object.entries(group)) {
      if (key.startsWith('@_')) continue;
      const mapped = ARTICULATION_MAP[key];
      if (mapped) result.push(mapped);
    }
  }

  return result.length > 0 ? result : undefined;
}

function parseOrnaments(noteXml: Record<string, unknown>): Ornament[] | undefined {
  const notations = noteXml.notations as Record<string, unknown> | undefined;
  if (!notations) return undefined;

  const ornamentsArr = ensureArray(notations.ornaments);
  if (ornamentsArr.length === 0) return undefined;

  const result: Ornament[] = [];
  for (const ornGroup of ornamentsArr) {
    const group = ornGroup as Record<string, unknown>;
    for (const [key, _value] of Object.entries(group)) {
      if (key.startsWith('@_')) continue;
      const mapped = ORNAMENT_MAP[key];
      if (mapped) result.push(mapped);
    }
  }

  return result.length > 0 ? result : undefined;
}

function parseDynamicsFromNotations(noteXml: Record<string, unknown>): DynamicMark | undefined {
  const notations = noteXml.notations as Record<string, unknown> | undefined;
  if (!notations) return undefined;

  const dynamicsArr = ensureArray(notations.dynamics);
  if (dynamicsArr.length === 0) return undefined;

  for (const dynGroup of dynamicsArr) {
    const group = dynGroup as Record<string, unknown>;
    for (const key of Object.keys(group)) {
      if (key.startsWith('@_')) continue;
      if (DYNAMIC_VALUES.has(key)) return key as DynamicMark;
    }
  }

  return undefined;
}

function parseLyrics(noteXml: Record<string, unknown>): Lyric[] | undefined {
  const lyrics = ensureArray(noteXml.lyric);
  if (lyrics.length === 0) return undefined;

  return lyrics.map((l) => {
    const lyric = l as Record<string, unknown>;
    return {
      number: Number(lyric['@_number'] ?? 1),
      syllabic: (lyric.syllabic as string as Lyric['syllabic']) ?? 'single',
      text: String(lyric.text ?? ''),
    };
  });
}

function parseFingering(noteXml: Record<string, unknown>): Fingering | undefined {
  const notations = noteXml.notations as Record<string, unknown> | undefined;
  if (!notations) return undefined;

  const technical = notations.technical as Record<string, unknown> | undefined;
  if (!technical?.fingering) return undefined;

  const f = technical.fingering as Record<string, unknown>;
  const finger = typeof f === 'object'
    ? Number(f['#text'] ?? f)
    : Number(f);

  const result: Fingering = { finger };

  if (typeof f === 'object' && f['@_placement']) {
    result.placement = f['@_placement'] as 'above' | 'below';
  }

  return isNaN(result.finger) ? undefined : result;
}

function parseNoteElement(
  noteXml: Record<string, unknown>,
  currentDivisions: number,
): NoteElement | RestElement {
  const isRest = noteXml.rest != null;
  const voice = Number(noteXml.voice ?? 1);
  const staff = Number(noteXml.staff ?? 1);

  // Grace notes have no duration element
  const isGrace = noteXml.grace != null;

  const duration = isGrace
    ? { divisions: 0, noteType: NOTE_TYPE_MAP[noteXml.type as string] ?? 'eighth' as NoteType, dots: ensureArray(noteXml.dot).length }
    : parseDuration(noteXml, currentDivisions);

  if (isRest) {
    const rest: RestElement = {
      type: 'rest',
      id: nextId('rest'),
      duration,
      voice,
      staff,
    };

    const restData = noteXml.rest as Record<string, unknown> | undefined;
    if (restData && typeof restData === 'object') {
      if (restData['display-step']) rest.displayStep = String(restData['display-step']);
      if (restData['display-octave']) rest.displayOctave = Number(restData['display-octave']);
    }

    return rest;
  }

  // It's a note
  const note: NoteElement = {
    type: 'note',
    id: nextId('note'),
    pitch: parsePitch(noteXml.pitch),
    duration,
    voice,
    staff,
  };

  // Stem
  if (noteXml.stem != null) {
    note.stem = noteXml.stem as NoteElement['stem'];
  }

  // Chord
  if (noteXml.chord != null) {
    note.chord = true;
  }

  // Grace note
  const graceNote = parseGraceNote(noteXml);
  if (graceNote) note.graceNote = graceNote;

  // Beam
  const beams = parseBeams(noteXml);
  if (beams) note.beam = beams;

  // Tie
  const tie = parseTie(noteXml);
  if (tie) note.tie = tie;

  // Slur
  const slurs = parseSlurs(noteXml);
  if (slurs) note.slur = slurs;

  // Articulations
  const articulations = parseArticulations(noteXml);
  if (articulations) note.articulations = articulations;

  // Ornaments
  const ornaments = parseOrnaments(noteXml);
  if (ornaments) note.ornaments = ornaments;

  // Dynamics (from notations)
  const dynamics = parseDynamicsFromNotations(noteXml);
  if (dynamics) note.dynamics = dynamics;

  // Lyrics
  const lyrics = parseLyrics(noteXml);
  if (lyrics) note.lyrics = lyrics;

  // Fingering
  const fingering = parseFingering(noteXml);
  if (fingering) note.fingering = fingering;

  return note;
}

function parseForward(fwdXml: unknown): Forward {
  const fwd = fwdXml as Record<string, unknown>;
  return {
    type: 'forward',
    duration: {
      divisions: Number(fwd.duration ?? 0),
      noteType: 'quarter',
      dots: 0,
    },
    voice: Number(fwd.voice ?? 1),
    staff: Number(fwd.staff ?? 1),
  };
}

function parseBackup(bkpXml: unknown): Backup {
  const bkp = bkpXml as Record<string, unknown>;
  return {
    type: 'backup',
    duration: {
      divisions: Number(bkp.duration ?? 0),
      noteType: 'quarter',
      dots: 0,
    },
  };
}

// ─── Barline parsing ───

function parseBarline(barlineXml: unknown): Barline {
  const bl = barlineXml as Record<string, unknown>;
  const location = (bl['@_location'] as string as Barline['location']) ?? 'right';
  const style = BARLINE_STYLE_MAP[bl['bar-style'] as string] ?? 'regular';

  const result: Barline = { location, style };

  // Repeat
  if (bl.repeat != null) {
    const rep = bl.repeat as Record<string, unknown>;
    result.repeat = {
      direction: (rep['@_direction'] as string) === 'forward' ? 'forward' : 'backward',
    };
    if (rep['@_times'] != null) {
      result.repeat.times = Number(rep['@_times']);
    }
  }

  // Ending
  const endings = ensureArray(bl.ending);
  if (endings.length > 0) {
    const ending = endings[0] as Record<string, unknown>;
    const numberStr = String(ending['@_number'] ?? '1');
    const numbers = numberStr.split(/[,\s]+/).map(Number).filter((n) => !isNaN(n));
    const endingInfo: EndingInfo = {
      number: numbers.length > 0 ? numbers : [1],
      type: (ending['@_type'] as string as EndingInfo['type']) ?? 'start',
    };
    // fast-xml-parser stores text content in #text.
    // If the element has no child elements, the text may be the value itself.
    const text = ending['#text'];
    if (text != null) {
      endingInfo.text = String(text);
    }
    result.ending = endingInfo;
  }

  return result;
}

// ─── Direction parsing ───

function parseDirections(directionXml: unknown): Direction | null {
  const dir = directionXml as Record<string, unknown>;
  const placement = (dir['@_placement'] as string as Direction['placement']) ?? 'above';
  const staff = dir.staff != null ? Number(dir.staff) : undefined;
  const offset = dir.offset != null ? Number(dir.offset) : undefined;

  const dirType = dir['direction-type'] as Record<string, unknown> | undefined;
  if (!dirType) return null;

  const parsedType = parseDirectionType(dirType, dir);
  if (!parsedType) return null;

  const result: Direction = {
    type: parsedType,
    placement,
  };
  if (offset != null) result.offset = offset;
  if (staff != null) result.staff = staff;

  return result;
}

function parseDirectionType(
  dirType: Record<string, unknown>,
  dirXml: Record<string, unknown>,
): DirectionType | null {
  // Tempo (from sound element)
  if (dirXml.sound != null) {
    const sound = dirXml.sound as Record<string, unknown>;
    if (sound['@_tempo'] != null) {
      const result: DirectionType = {
        kind: 'tempo',
        bpm: Number(sound['@_tempo']),
      };
      // Check for words text as tempo text
      if (dirType.words != null) {
        const words = typeof dirType.words === 'string'
          ? dirType.words
          : (dirType.words as Record<string, unknown>)['#text'] as string | undefined;
        if (words) (result as { kind: 'tempo'; bpm: number; text?: string }).text = String(words);
      }
      return result;
    }
  }

  // Dynamics
  if (dirType.dynamics != null) {
    const dynArr = ensureArray(dirType.dynamics);
    for (const dyn of dynArr) {
      const dynObj = dyn as Record<string, unknown>;
      for (const key of Object.keys(dynObj)) {
        if (key.startsWith('@_')) continue;
        if (DYNAMIC_VALUES.has(key)) {
          return { kind: 'dynamic', value: key as DynamicMark };
        }
      }
    }
  }

  // Wedge (crescendo/diminuendo)
  if (dirType.wedge != null) {
    const wedge = dirType.wedge as Record<string, unknown>;
    const wedgeType = wedge['@_type'] as string;
    let value: WedgeInfo;
    if (wedgeType === 'crescendo') value = { type: 'crescendo' };
    else if (wedgeType === 'diminuendo') value = { type: 'diminuendo' };
    else value = { type: 'stop' };
    return { kind: 'wedge', value };
  }

  // Pedal
  if (dirType.pedal != null) {
    const pedal = dirType.pedal as Record<string, unknown>;
    const pedalType = (pedal['@_type'] as string) ?? 'start';
    const value: PedalInfo = {
      type: pedalType as PedalInfo['type'],
    };
    if (pedal['@_line'] != null) {
      value.line = pedal['@_line'] === 'yes';
    }
    return { kind: 'pedal', value };
  }

  // Rehearsal
  if (dirType.rehearsal != null) {
    const reh = dirType.rehearsal;
    const text = typeof reh === 'string' ? reh : String((reh as Record<string, unknown>)['#text'] ?? reh);
    return { kind: 'rehearsal', text };
  }

  // Segno
  if (dirType.segno != null) {
    return { kind: 'segno' };
  }

  // Coda
  if (dirType.coda != null) {
    return { kind: 'coda' };
  }

  // Words (generic text direction)
  if (dirType.words != null) {
    const words = typeof dirType.words === 'string'
      ? dirType.words
      : String((dirType.words as Record<string, unknown>)['#text'] ?? dirType.words);
    return { kind: 'words', text: words };
  }

  return null;
}

// ─── Measure parsing ───

function parseMeasure(measureXml: Record<string, unknown>, currentDivisions: number): { measure: Measure; divisions: number } {
  const number = Number(measureXml['@_number'] ?? 1);
  const measure: Measure = {
    number,
    elements: [],
    directions: [],
  };

  let divisions = currentDivisions;

  // Parse attributes
  if (measureXml.attributes != null) {
    measure.attributes = parseAttributes(measureXml.attributes);
    if (measure.attributes.divisions != null) {
      divisions = measure.attributes.divisions;
    }
  }

  // We need to iterate through child elements in order to preserve
  // the sequence of notes, forwards, backups, and directions.
  // fast-xml-parser groups by tag name, so we reconstruct order from arrays.

  // Parse notes
  const notes = ensureArray(measureXml.note);
  for (const noteXml of notes) {
    const n = noteXml as Record<string, unknown>;
    const element = parseNoteElement(n, divisions);
    measure.elements.push(element);
  }

  // Parse forward elements
  const forwards = ensureArray(measureXml.forward);
  for (const fwd of forwards) {
    measure.elements.push(parseForward(fwd));
  }

  // Parse backup elements
  const backups = ensureArray(measureXml.backup);
  for (const bkp of backups) {
    measure.elements.push(parseBackup(bkp));
  }

  // Parse directions
  const directions = ensureArray(measureXml.direction);
  for (const dirXml of directions) {
    const dir = parseDirections(dirXml);
    if (dir) measure.directions.push(dir);
  }

  // Parse barlines
  const barlines = ensureArray(measureXml.barline);
  if (barlines.length > 0) {
    // Use the last barline (typically the right barline)
    measure.barline = parseBarline(barlines[barlines.length - 1]);
  }

  return { measure, divisions };
}

// ─── Part parsing ───

interface PartInfo {
  id: string;
  name: string;
  abbreviation?: string;
}

function parsePartList(partListXml: unknown): PartInfo[] {
  const partList = partListXml as Record<string, unknown>;
  const scoreParts = ensureArray(partList['score-part']);

  return scoreParts.map((sp) => {
    const scorePart = sp as Record<string, unknown>;
    const info: PartInfo = {
      id: String(scorePart['@_id'] ?? ''),
      name: String(scorePart['part-name'] ?? ''),
    };
    if (scorePart['part-abbreviation'] != null) {
      info.abbreviation = String(scorePart['part-abbreviation']);
    }
    return info;
  });
}

function parsePart(partXml: Record<string, unknown>, partInfo: PartInfo): Part {
  const measures = ensureArray(partXml.measure);
  const part: Part = {
    id: partInfo.id,
    name: partInfo.name,
    staves: 1,
    measures: [],
  };

  if (partInfo.abbreviation) {
    part.abbreviation = partInfo.abbreviation;
  }

  let currentDivisions = 1;

  for (const measureXml of measures) {
    const { measure, divisions } = parseMeasure(
      measureXml as Record<string, unknown>,
      currentDivisions,
    );
    currentDivisions = divisions;
    part.measures.push(measure);
  }

  // Determine staves count from attributes
  for (const m of part.measures) {
    if (m.attributes?.staves != null && m.attributes.staves > part.staves) {
      part.staves = m.attributes.staves;
    }
  }

  return part;
}

// ─── Credits parsing ───

function parseCredits(creditsXml: unknown[]): Credit[] {
  const result: Credit[] = [];

  for (const creditXml of creditsXml) {
    const credit = creditXml as Record<string, unknown>;
    const creditWords = ensureArray(credit['credit-words']);
    if (creditWords.length === 0) continue;

    const firstWord = creditWords[0] as Record<string, unknown>;
    const text = typeof firstWord === 'string'
      ? firstWord
      : String(firstWord['#text'] ?? firstWord);

    // Try to determine credit type from credit-type element or heuristics
    let type: Credit['type'] = 'title';
    if (credit['credit-type'] != null) {
      const ct = String(credit['credit-type']).toLowerCase();
      if (ct.includes('composer')) type = 'composer';
      else if (ct.includes('arranger')) type = 'arranger';
      else if (ct.includes('lyricist')) type = 'lyricist';
      else if (ct.includes('subtitle')) type = 'subtitle';
      else type = 'title';
    }

    result.push({ type, text });
  }

  return result;
}

// ─── Main parser class ───

export class MusicXMLParser implements Pick<IScoreSerializer, 'fromMusicXML'> {
  private parser: XMLParser;

  constructor() {
    this.parser = createXMLParser();
  }

  /**
   * MusicXML 문자열을 파싱하여 ScoreData로 변환한다.
   * score-partwise 형식만 지원한다.
   */
  fromMusicXML(xml: string): ScoreData {
    resetIdCounter();

    const parsed = this.parser.parse(xml);
    const scorePartwise = parsed['score-partwise'];

    if (!scorePartwise) {
      throw new Error(
        'Unsupported MusicXML format: only <score-partwise> is supported.',
      );
    }

    // Parse part-list for metadata
    const partInfos = scorePartwise['part-list']
      ? parsePartList(scorePartwise['part-list'])
      : [];

    // Build a lookup map for part info by id
    const partInfoMap = new Map<string, PartInfo>();
    for (const info of partInfos) {
      partInfoMap.set(info.id, info);
    }

    // Parse parts
    const partsXml = ensureArray(scorePartwise.part);
    const parts: Part[] = partsXml.map((partXml) => {
      const p = partXml as Record<string, unknown>;
      const partId = String(p['@_id'] ?? '');
      const info = partInfoMap.get(partId) ?? { id: partId, name: '' };
      return parsePart(p, info);
    });

    // Parse credits
    const creditsXml = ensureArray(scorePartwise.credit);
    const credits = creditsXml.length > 0 ? parseCredits(creditsXml) : undefined;

    const result: ScoreData = { parts };
    if (credits && credits.length > 0) {
      result.credits = credits;
    }

    return result;
  }
}
