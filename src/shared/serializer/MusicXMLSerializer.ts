/**
 * Score_Data → MusicXML 3.1 시리얼라이저 구현
 * ScoreData를 MusicXML 3.1 score-partwise 형식의 XML 문자열로 변환한다.
 *
 * 지원 범위:
 * - score-partwise 형식 출력
 * - part-list, part, measure, attributes, note, rest, forward, backup
 * - pitch, duration, type, dot, chord, tie, tied, slur, beam, grace
 * - articulations, ornaments, dynamics, lyric, fingering
 * - barline, repeat, ending, direction (tempo, dynamic, wedge, pedal, rehearsal, segno, coda, words)
 * - credits
 */

import type {
  ScoreData,
  Part,
  Measure,
  MeasureAttributes,
  Clef,
  MeasureElement,
  NoteElement,
  RestElement,
  Forward,
  Backup,
  Duration,
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
  Credit,
  ValidationResult,
  ValidationError,
} from '../types';
import type { IScoreSerializer } from './IScoreSerializer';

// ─── Reverse ornament mapping (internal → MusicXML tag) ───

const ORNAMENT_REVERSE_MAP: Record<Ornament, string> = {
  trill: 'trill-mark',
  turn: 'turn',
  'inverted-turn': 'inverted-turn',
  mordent: 'mordent',
  'inverted-mordent': 'inverted-mordent',
  tremolo: 'tremolo',
  shake: 'shake',
};

// ─── XML escaping ───

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Indentation helper ───

function indent(level: number): string {
  return '  '.repeat(level);
}

function tag(name: string, content: string, level: number, attrs?: Record<string, string>): string {
  const attrStr = attrs
    ? ' ' + Object.entries(attrs).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ')
    : '';
  return `${indent(level)}<${name}${attrStr}>${content}</${name}>\n`;
}

function selfClosingTag(name: string, level: number, attrs?: Record<string, string>): string {
  const attrStr = attrs
    ? ' ' + Object.entries(attrs).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ')
    : '';
  return `${indent(level)}<${name}${attrStr}/>\n`;
}

function openTag(name: string, level: number, attrs?: Record<string, string>): string {
  const attrStr = attrs
    ? ' ' + Object.entries(attrs).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ')
    : '';
  return `${indent(level)}<${name}${attrStr}>\n`;
}

function closeTag(name: string, level: number): string {
  return `${indent(level)}</${name}>\n`;
}

// ─── Serialization functions ───

function serializeCredits(credits: Credit[]): string {
  let xml = '';
  for (const credit of credits) {
    xml += openTag('credit', 1);
    xml += tag('credit-type', credit.type, 2);
    xml += tag('credit-words', escapeXml(credit.text), 2);
    xml += closeTag('credit', 1);
  }
  return xml;
}

function serializePartList(parts: Part[]): string {
  let xml = openTag('part-list', 1);
  for (const part of parts) {
    const attrs: Record<string, string> = { id: part.id };
    xml += openTag('score-part', 2, attrs);
    xml += tag('part-name', escapeXml(part.name), 3);
    if (part.abbreviation) {
      xml += tag('part-abbreviation', escapeXml(part.abbreviation), 3);
    }
    xml += closeTag('score-part', 2);
  }
  xml += closeTag('part-list', 1);
  return xml;
}

function serializeAttributes(attrs: MeasureAttributes): string {
  let xml = openTag('attributes', 3);

  if (attrs.divisions != null) {
    xml += tag('divisions', String(attrs.divisions), 4);
  }

  if (attrs.keySignature) {
    xml += openTag('key', 4);
    xml += tag('fifths', String(attrs.keySignature.fifths), 5);
    xml += tag('mode', attrs.keySignature.mode, 5);
    xml += closeTag('key', 4);
  }

  if (attrs.timeSignature) {
    const timeAttrs: Record<string, string> = {};
    if (attrs.timeSignature.symbol) {
      timeAttrs['symbol'] = attrs.timeSignature.symbol;
    }
    xml += openTag('time', 4, Object.keys(timeAttrs).length > 0 ? timeAttrs : undefined);
    xml += tag('beats', String(attrs.timeSignature.beats), 5);
    xml += tag('beat-type', String(attrs.timeSignature.beatType), 5);
    xml += closeTag('time', 4);
  }

  if (attrs.staves != null) {
    xml += tag('staves', String(attrs.staves), 4);
  }

  if (attrs.clef) {
    for (const c of attrs.clef) {
      xml += serializeClef(c);
    }
  }

  xml += closeTag('attributes', 3);
  return xml;
}

function serializeClef(clef: Clef): string {
  const attrs: Record<string, string> = { number: String(clef.staffNumber) };
  let xml = openTag('clef', 4, Object.keys(attrs).length > 0 ? attrs : undefined);
  xml += tag('sign', clef.sign, 5);
  xml += tag('line', String(clef.line), 5);
  if (clef.octaveChange != null) {
    xml += tag('clef-octave-change', String(clef.octaveChange), 5);
  }
  xml += closeTag('clef', 4);
  return xml;
}

function serializeNote(note: NoteElement): string {
  let xml = openTag('note', 3);

  // Grace note (must come before pitch)
  if (note.graceNote) {
    xml += serializeGraceNote(note.graceNote);
  }

  // Chord
  if (note.chord) {
    xml += selfClosingTag('chord', 4);
  }

  // Pitch
  xml += openTag('pitch', 4);
  xml += tag('step', note.pitch.step, 5);
  if (note.pitch.alter != null) {
    xml += tag('alter', String(note.pitch.alter), 5);
  }
  xml += tag('octave', String(note.pitch.octave), 5);
  xml += closeTag('pitch', 4);

  // Duration (grace notes have 0 duration, skip for grace)
  if (!note.graceNote) {
    xml += tag('duration', String(note.duration.divisions), 4);
  }

  // Tie (sound)
  if (note.tie) {
    xml += serializeTie(note.tie);
  }

  // Voice
  xml += tag('voice', String(note.voice), 4);

  // Type
  xml += tag('type', note.duration.noteType, 4);

  // Dots
  for (let i = 0; i < note.duration.dots; i++) {
    xml += selfClosingTag('dot', 4);
  }

  // Time modification (tuplet)
  xml += serializeTimeModification(note.duration);

  // Stem
  if (note.stem) {
    xml += tag('stem', note.stem, 4);
  }

  // Staff
  if (note.staff) {
    xml += tag('staff', String(note.staff), 4);
  }

  // Beam
  if (note.beam) {
    for (const beam of note.beam) {
      xml += serializeBeam(beam);
    }
  }

  // Notations (slur, tied, articulations, ornaments, dynamics, fingering, tuplet)
  const notationsXml = serializeNotations(note);
  if (notationsXml) {
    xml += notationsXml;
  }

  // Lyrics
  if (note.lyrics) {
    for (const lyric of note.lyrics) {
      xml += serializeLyric(lyric);
    }
  }

  xml += closeTag('note', 3);
  return xml;
}

function serializeRest(rest: RestElement): string {
  let xml = openTag('note', 3);

  // Rest element
  if (rest.displayStep && rest.displayOctave != null) {
    xml += openTag('rest', 4);
    xml += tag('display-step', rest.displayStep, 5);
    xml += tag('display-octave', String(rest.displayOctave), 5);
    xml += closeTag('rest', 4);
  } else {
    xml += selfClosingTag('rest', 4);
  }

  // Duration
  xml += tag('duration', String(rest.duration.divisions), 4);

  // Voice
  xml += tag('voice', String(rest.voice), 4);

  // Type
  xml += tag('type', rest.duration.noteType, 4);

  // Dots
  for (let i = 0; i < rest.duration.dots; i++) {
    xml += selfClosingTag('dot', 4);
  }

  // Staff
  if (rest.staff) {
    xml += tag('staff', String(rest.staff), 4);
  }

  xml += closeTag('note', 3);
  return xml;
}

function serializeForward(fwd: Forward): string {
  let xml = openTag('forward', 3);
  xml += tag('duration', String(fwd.duration.divisions), 4);
  xml += tag('voice', String(fwd.voice), 4);
  xml += tag('staff', String(fwd.staff), 4);
  xml += closeTag('forward', 3);
  return xml;
}

function serializeBackup(bkp: Backup): string {
  let xml = openTag('backup', 3);
  xml += tag('duration', String(bkp.duration.divisions), 4);
  xml += closeTag('backup', 3);
  return xml;
}

function serializeGraceNote(grace: GraceNoteInfo): string {
  const attrs: Record<string, string> = {};
  if (grace.slash) {
    attrs['slash'] = 'yes';
  }
  if (grace.stealTimePrevious != null) {
    attrs['steal-time-previous'] = String(grace.stealTimePrevious);
  }
  if (grace.stealTimeFollowing != null) {
    attrs['steal-time-following'] = String(grace.stealTimeFollowing);
  }
  return selfClosingTag('grace', 4, Object.keys(attrs).length > 0 ? attrs : undefined);
}

function serializeTie(tie: TieInfo): string {
  let xml = '';
  if (tie.type === 'continue') {
    // continue = stop + start
    xml += selfClosingTag('tie', 4, { type: 'stop' });
    xml += selfClosingTag('tie', 4, { type: 'start' });
  } else {
    xml += selfClosingTag('tie', 4, { type: tie.type });
  }
  return xml;
}

function serializeBeam(beam: BeamInfo): string {
  return tag('beam', beam.type, 4, { number: String(beam.number) });
}

function serializeNotations(note: NoteElement): string | null {
  const parts: string[] = [];

  // Tied (notation counterpart of tie)
  if (note.tie) {
    if (note.tie.type === 'continue') {
      parts.push(selfClosingTag('tied', 5, { type: 'stop' }));
      parts.push(selfClosingTag('tied', 5, { type: 'start' }));
    } else {
      parts.push(selfClosingTag('tied', 5, { type: note.tie.type }));
    }
  }

  // Slur
  if (note.slur) {
    for (const slur of note.slur) {
      const attrs: Record<string, string> = {
        type: slur.type,
        number: String(slur.number),
      };
      if (slur.placement) {
        attrs['placement'] = slur.placement;
      }
      parts.push(selfClosingTag('slur', 5, attrs));
    }
  }

  // Tuplet
  if (note.duration.tuplet) {
    parts.push(selfClosingTag('tuplet', 5, { type: note.duration.tuplet.type }));
  }

  // Articulations
  if (note.articulations && note.articulations.length > 0) {
    let artXml = openTag('articulations', 5);
    for (const art of note.articulations) {
      artXml += selfClosingTag(art, 6);
    }
    artXml += closeTag('articulations', 5);
    parts.push(artXml);
  }

  // Ornaments
  if (note.ornaments && note.ornaments.length > 0) {
    let ornXml = openTag('ornaments', 5);
    for (const orn of note.ornaments) {
      const xmlTag = ORNAMENT_REVERSE_MAP[orn] ?? orn;
      ornXml += selfClosingTag(xmlTag, 6);
    }
    ornXml += closeTag('ornaments', 5);
    parts.push(ornXml);
  }

  // Dynamics (in notations)
  if (note.dynamics) {
    let dynXml = openTag('dynamics', 5);
    dynXml += selfClosingTag(note.dynamics, 6);
    dynXml += closeTag('dynamics', 5);
    parts.push(dynXml);
  }

  // Fingering (in technical)
  if (note.fingering) {
    let techXml = openTag('technical', 5);
    const fAttrs: Record<string, string> = {};
    if (note.fingering.placement) {
      fAttrs['placement'] = note.fingering.placement;
    }
    techXml += tag('fingering', String(note.fingering.finger), 6,
      Object.keys(fAttrs).length > 0 ? fAttrs : undefined);
    techXml += closeTag('technical', 5);
    parts.push(techXml);
  }

  if (parts.length === 0) return null;

  let xml = openTag('notations', 4);
  xml += parts.join('');
  xml += closeTag('notations', 4);
  return xml;
}

function serializeLyric(lyric: Lyric): string {
  let xml = openTag('lyric', 4, { number: String(lyric.number) });
  xml += tag('syllabic', lyric.syllabic, 5);
  xml += tag('text', escapeXml(lyric.text), 5);
  xml += closeTag('lyric', 4);
  return xml;
}

function serializeBarline(barline: Barline): string {
  let xml = openTag('barline', 3, { location: barline.location });
  xml += tag('bar-style', barline.style, 4);

  if (barline.ending) {
    xml += serializeEnding(barline.ending);
  }

  if (barline.repeat) {
    const attrs: Record<string, string> = { direction: barline.repeat.direction };
    if (barline.repeat.times != null) {
      attrs['times'] = String(barline.repeat.times);
    }
    xml += selfClosingTag('repeat', 4, attrs);
  }

  xml += closeTag('barline', 3);
  return xml;
}

function serializeEnding(ending: EndingInfo): string {
  const attrs: Record<string, string> = {
    number: ending.number.join(', '),
    type: ending.type,
  };
  if (ending.text) {
    return `${indent(4)}<ending ${Object.entries(attrs).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ')}>${escapeXml(ending.text)}</ending>\n`;
  }
  return selfClosingTag('ending', 4, attrs);
}

function serializeDirection(dir: Direction): string {
  const attrs: Record<string, string> = {};
  if (dir.placement) {
    attrs['placement'] = dir.placement;
  }
  let xml = openTag('direction', 3, Object.keys(attrs).length > 0 ? attrs : undefined);

  xml += openTag('direction-type', 4);
  xml += serializeDirectionType(dir.type);
  xml += closeTag('direction-type', 4);

  // Offset
  if (dir.offset != null) {
    xml += tag('offset', String(dir.offset), 4);
  }

  // Sound element for tempo
  if (dir.type.kind === 'tempo') {
    xml += selfClosingTag('sound', 4, { tempo: String(dir.type.bpm) });
  }

  // Staff
  if (dir.staff != null) {
    xml += tag('staff', String(dir.staff), 4);
  }

  xml += closeTag('direction', 3);
  return xml;
}

function serializeDirectionType(dt: DirectionType): string {
  switch (dt.kind) {
    case 'tempo': {
      if (dt.text) {
        return tag('words', escapeXml(dt.text), 5);
      }
      return tag('words', `♩ = ${dt.bpm}`, 5);
    }
    case 'dynamic': {
      let xml = openTag('dynamics', 5);
      xml += selfClosingTag(dt.value, 6);
      xml += closeTag('dynamics', 5);
      return xml;
    }
    case 'wedge': {
      return selfClosingTag('wedge', 5, { type: dt.value.type });
    }
    case 'pedal': {
      const attrs: Record<string, string> = { type: dt.value.type };
      if (dt.value.line != null) {
        attrs['line'] = dt.value.line ? 'yes' : 'no';
      }
      return selfClosingTag('pedal', 5, attrs);
    }
    case 'rehearsal': {
      return tag('rehearsal', escapeXml(dt.text), 5);
    }
    case 'segno': {
      return selfClosingTag('segno', 5);
    }
    case 'coda': {
      return selfClosingTag('coda', 5);
    }
    case 'words': {
      return tag('words', escapeXml(dt.text), 5);
    }
  }
}

function serializeMeasure(measure: Measure): string {
  let xml = openTag('measure', 2, { number: String(measure.number) });

  // Attributes
  if (measure.attributes) {
    xml += serializeAttributes(measure.attributes);
  }

  // Directions
  for (const dir of measure.directions) {
    xml += serializeDirection(dir);
  }

  // Elements (notes, rests, forward, backup)
  for (const el of measure.elements) {
    xml += serializeElement(el);
  }

  // Barline
  if (measure.barline) {
    xml += serializeBarline(measure.barline);
  }

  xml += closeTag('measure', 2);
  return xml;
}

function serializeElement(el: MeasureElement): string {
  switch (el.type) {
    case 'note':
      return serializeNote(el);
    case 'rest':
      return serializeRest(el);
    case 'forward':
      return serializeForward(el);
    case 'backup':
      return serializeBackup(el);
  }
}

function serializePart(part: Part): string {
  let xml = openTag('part', 1, { id: part.id });
  for (const measure of part.measures) {
    xml += serializeMeasure(measure);
  }
  xml += closeTag('part', 1);
  return xml;
}

// ─── Time modification serialization ───

function serializeTimeModification(duration: Duration): string {
  if (!duration.tuplet) return '';
  let xml = openTag('time-modification', 4);
  xml += tag('actual-notes', String(duration.tuplet.actualNotes), 5);
  xml += tag('normal-notes', String(duration.tuplet.normalNotes), 5);
  xml += closeTag('time-modification', 4);
  return xml;
}

// ─── Main serializer class ───

export class MusicXMLSerializer implements Pick<IScoreSerializer, 'toMusicXML' | 'validateMusicXML'> {
  /**
   * ScoreData를 MusicXML 3.1 score-partwise 형식의 XML 문자열로 변환한다.
   */
  toMusicXML(scoreData: ScoreData): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.com/dtds/partwise.dtd">\n';
    xml += openTag('score-partwise', 0, { version: '3.1' });

    // Credits
    if (scoreData.credits && scoreData.credits.length > 0) {
      xml += serializeCredits(scoreData.credits);
    }

    // Part list
    xml += serializePartList(scoreData.parts);

    // Parts
    for (const part of scoreData.parts) {
      xml += serializePart(part);
    }

    xml += closeTag('score-partwise', 0);
    return xml;
  }

  /**
   * MusicXML 문자열의 기본 구조적 유효성을 검증한다.
   */
  validateMusicXML(xml: string): ValidationResult {
    const errors: ValidationError[] = [];

    // Check XML declaration
    if (!xml.trimStart().startsWith('<?xml')) {
      errors.push({ message: 'Missing XML declaration' });
    }

    // Check root element
    if (!xml.includes('<score-partwise')) {
      errors.push({ message: 'Missing <score-partwise> root element' });
    }

    // Check closing root element
    if (!xml.includes('</score-partwise>')) {
      errors.push({ message: 'Missing </score-partwise> closing tag' });
    }

    // Check part-list
    if (!xml.includes('<part-list>')) {
      errors.push({ message: 'Missing <part-list> element' });
    }

    // Check that every <part-list> has at least one <score-part>
    if (xml.includes('<part-list>') && !xml.includes('<score-part')) {
      errors.push({ message: 'Empty <part-list>: at least one <score-part> is required' });
    }

    // Check matching part ids
    const scorePartIds = [...xml.matchAll(/<score-part\s+id="([^"]+)"/g)].map(m => m[1]);
    const partIds = [...xml.matchAll(/<part\s+id="([^"]+)"/g)].map(m => m[1]);

    for (const id of scorePartIds) {
      if (!partIds.includes(id)) {
        errors.push({ message: `<score-part> id="${id}" has no matching <part>` });
      }
    }

    for (const id of partIds) {
      if (!scorePartIds.includes(id)) {
        errors.push({ message: `<part> id="${id}" has no matching <score-part>` });
      }
    }

    // Check basic tag balance for key tags
    const tagPairs = ['part-list', 'part', 'measure', 'note', 'attributes'];
    for (const tagName of tagPairs) {
      const openCount = (xml.match(new RegExp(`<${tagName}[\\s>]`, 'g')) || []).length;
      const closeCount = (xml.match(new RegExp(`</${tagName}>`, 'g')) || []).length;
      // Self-closing tags don't need closing
      const selfCloseCount = (xml.match(new RegExp(`<${tagName}[^>]*/\\s*>`, 'g')) || []).length;
      if (openCount - selfCloseCount !== closeCount) {
        errors.push({ message: `Mismatched <${tagName}> tags: ${openCount - selfCloseCount} opening vs ${closeCount} closing` });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
