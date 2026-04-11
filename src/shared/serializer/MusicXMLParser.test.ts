import { describe, it, expect, beforeEach } from 'vitest';
import { MusicXMLParser, resetIdCounter } from './MusicXMLParser';

function wrap(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      ${inner}
    </measure>
  </part>
</score-partwise>`;
}

describe('MusicXMLParser', () => {
  let parser: MusicXMLParser;

  beforeEach(() => {
    parser = new MusicXMLParser();
    resetIdCounter();
  });

  it('parses a minimal score-partwise document', () => {
    const xml = wrap('<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>');
    const score = parser.fromMusicXML(xml);

    expect(score.parts).toHaveLength(1);
    expect(score.parts[0].id).toBe('P1');
    expect(score.parts[0].name).toBe('Piano');
    expect(score.parts[0].measures).toHaveLength(1);
  });

  it('throws on non-score-partwise format', () => {
    const xml = '<score-timewise></score-timewise>';
    expect(() => parser.fromMusicXML(xml)).toThrow('only <score-partwise> is supported');
  });

  it('parses measure attributes (key, time, clef, divisions)', () => {
    const xml = wrap('');
    const score = parser.fromMusicXML(xml);
    const attrs = score.parts[0].measures[0].attributes!;

    expect(attrs.divisions).toBe(1);
    expect(attrs.keySignature).toEqual({ fifths: 0, mode: 'major' });
    expect(attrs.timeSignature).toEqual({ beats: 4, beatType: 4 });
    expect(attrs.clef).toHaveLength(1);
    expect(attrs.clef![0]).toEqual({ sign: 'G', line: 2, staffNumber: 1 });
  });

  it('parses a note with pitch and duration', () => {
    const xml = wrap(`
      <note>
        <pitch><step>E</step><octave>5</octave><alter>-1</alter></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    expect(el.type).toBe('note');
    if (el.type === 'note') {
      expect(el.pitch.step).toBe('E');
      expect(el.pitch.octave).toBe(5);
      expect(el.pitch.alter).toBe(-1);
      expect(el.duration.noteType).toBe('quarter');
      expect(el.duration.divisions).toBe(1);
    }
  });

  it('parses a rest element', () => {
    const xml = wrap(`
      <note>
        <rest/>
        <duration>1</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    expect(el.type).toBe('rest');
    if (el.type === 'rest') {
      expect(el.duration.noteType).toBe('quarter');
      expect(el.voice).toBe(1);
    }
  });

  it('parses chord flag', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const elements = score.parts[0].measures[0].elements;

    expect(elements).toHaveLength(2);
    expect((elements[0] as { chord?: boolean }).chord).toBeUndefined();
    expect((elements[1] as { chord?: boolean }).chord).toBe(true);
  });

  it('parses tie information', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <tie type="start"/>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    expect(el.type).toBe('note');
    if (el.type === 'note') {
      expect(el.tie).toEqual({ type: 'start' });
    }
  });

  it('parses slur information', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <slur type="start" number="1" placement="above"/>
        </notations>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.slur).toHaveLength(1);
      expect(el.slur![0]).toEqual({ number: 1, type: 'start', placement: 'above' });
    }
  });

  it('parses beam information', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>eighth</type>
        <beam number="1">begin</beam>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.beam).toHaveLength(1);
      expect(el.beam![0].number).toBe(1);
      expect(el.beam![0].type).toBe('begin');
    }
  });

  it('parses grace note', () => {
    const xml = wrap(`
      <note>
        <grace slash="yes"/>
        <pitch><step>D</step><octave>5</octave></pitch>
        <type>eighth</type>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.graceNote).toBeDefined();
      expect(el.graceNote!.slash).toBe(true);
      expect(el.duration.divisions).toBe(0);
    }
  });

  it('parses articulations', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <articulations>
            <staccato/>
            <accent/>
          </articulations>
        </notations>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.articulations).toContain('staccato');
      expect(el.articulations).toContain('accent');
    }
  });

  it('parses ornaments', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
          <ornaments>
            <trill-mark/>
          </ornaments>
        </notations>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.ornaments).toContain('trill');
    }
  });

  it('parses lyrics', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <lyric number="1">
          <syllabic>single</syllabic>
          <text>Hello</text>
        </lyric>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.lyrics).toHaveLength(1);
      expect(el.lyrics![0]).toEqual({ number: 1, syllabic: 'single', text: 'Hello' });
    }
  });

  it('parses barline with repeat', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <barline location="right">
        <bar-style>light-heavy</bar-style>
        <repeat direction="backward"/>
      </barline>
    `);
    const score = parser.fromMusicXML(xml);
    const barline = score.parts[0].measures[0].barline;

    expect(barline).toBeDefined();
    expect(barline!.style).toBe('light-heavy');
    expect(barline!.location).toBe('right');
    expect(barline!.repeat).toEqual({ direction: 'backward' });
  });

  it('parses barline with ending', () => {
    const xml = wrap(`
      <barline location="left">
        <bar-style>heavy-light</bar-style>
        <ending number="1" type="start">1.</ending>
      </barline>
    `);
    const score = parser.fromMusicXML(xml);
    const barline = score.parts[0].measures[0].barline;

    expect(barline).toBeDefined();
    expect(barline!.ending).toBeDefined();
    expect(barline!.ending!.number).toEqual([1]);
    expect(barline!.ending!.type).toBe('start');
    expect(barline!.ending!.text).toBe('1.');
  });

  it('parses direction with tempo', () => {
    const xml = wrap(`
      <direction placement="above">
        <direction-type>
          <words>Allegro</words>
        </direction-type>
        <sound tempo="120"/>
      </direction>
    `);
    const score = parser.fromMusicXML(xml);
    const dirs = score.parts[0].measures[0].directions;

    expect(dirs).toHaveLength(1);
    expect(dirs[0].type.kind).toBe('tempo');
    if (dirs[0].type.kind === 'tempo') {
      expect(dirs[0].type.bpm).toBe(120);
      expect(dirs[0].type.text).toBe('Allegro');
    }
  });

  it('parses direction with dynamics', () => {
    const xml = wrap(`
      <direction placement="below">
        <direction-type>
          <dynamics><ff/></dynamics>
        </direction-type>
      </direction>
    `);
    const score = parser.fromMusicXML(xml);
    const dirs = score.parts[0].measures[0].directions;

    expect(dirs).toHaveLength(1);
    expect(dirs[0].type.kind).toBe('dynamic');
    if (dirs[0].type.kind === 'dynamic') {
      expect(dirs[0].type.value).toBe('ff');
    }
    expect(dirs[0].placement).toBe('below');
  });

  it('parses direction with wedge', () => {
    const xml = wrap(`
      <direction>
        <direction-type>
          <wedge type="crescendo"/>
        </direction-type>
      </direction>
    `);
    const score = parser.fromMusicXML(xml);
    const dirs = score.parts[0].measures[0].directions;

    expect(dirs).toHaveLength(1);
    if (dirs[0].type.kind === 'wedge') {
      expect(dirs[0].type.value.type).toBe('crescendo');
    }
  });

  it('parses direction with pedal', () => {
    const xml = wrap(`
      <direction>
        <direction-type>
          <pedal type="start" line="yes"/>
        </direction-type>
      </direction>
    `);
    const score = parser.fromMusicXML(xml);
    const dirs = score.parts[0].measures[0].directions;

    expect(dirs).toHaveLength(1);
    if (dirs[0].type.kind === 'pedal') {
      expect(dirs[0].type.value.type).toBe('start');
      expect(dirs[0].type.value.line).toBe(true);
    }
  });

  it('parses direction with segno and coda', () => {
    const xml = wrap(`
      <direction>
        <direction-type><segno/></direction-type>
      </direction>
      <direction>
        <direction-type><coda/></direction-type>
      </direction>
    `);
    const score = parser.fromMusicXML(xml);
    const dirs = score.parts[0].measures[0].directions;

    expect(dirs).toHaveLength(2);
    expect(dirs[0].type.kind).toBe('segno');
    expect(dirs[1].type.kind).toBe('coda');
  });

  it('parses forward and backup elements', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <backup><duration>4</duration></backup>
      <forward><duration>2</duration><voice>2</voice><staff>1</staff></forward>
    `);
    const score = parser.fromMusicXML(xml);
    const elements = score.parts[0].measures[0].elements;

    const backups = elements.filter((e) => e.type === 'backup');
    const forwards = elements.filter((e) => e.type === 'forward');

    expect(backups).toHaveLength(1);
    expect(forwards).toHaveLength(1);
    expect(backups[0].duration.divisions).toBe(4);
    expect(forwards[0].duration.divisions).toBe(2);
  });

  it('parses dotted notes', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>3</duration>
        <type>half</type>
        <dot/>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.duration.dots).toBe(1);
      expect(el.duration.noteType).toBe('half');
    }
  });

  it('parses multiple parts', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
    <score-part id="P2"><part-name>Cello</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const score = parser.fromMusicXML(xml);

    expect(score.parts).toHaveLength(2);
    expect(score.parts[0].name).toBe('Violin');
    expect(score.parts[1].name).toBe('Cello');
  });

  it('parses credits', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <credit>
    <credit-type>title</credit-type>
    <credit-words>My Song</credit-words>
  </credit>
  <credit>
    <credit-type>composer</credit-type>
    <credit-words>J. S. Bach</credit-words>
  </credit>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
    </measure>
  </part>
</score-partwise>`;
    const score = parser.fromMusicXML(xml);

    expect(score.credits).toHaveLength(2);
    expect(score.credits![0]).toEqual({ type: 'title', text: 'My Song' });
    expect(score.credits![1]).toEqual({ type: 'composer', text: 'J. S. Bach' });
  });

  it('detects staves count from attributes', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
    </measure>
  </part>
</score-partwise>`;
    const score = parser.fromMusicXML(xml);

    expect(score.parts[0].staves).toBe(2);
    expect(score.parts[0].measures[0].attributes!.clef).toHaveLength(2);
    expect(score.parts[0].measures[0].attributes!.clef![0].sign).toBe('G');
    expect(score.parts[0].measures[0].attributes!.clef![1].sign).toBe('F');
  });

  it('parses tie continue (start+stop)', () => {
    const xml = wrap(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <tie type="stop"/>
        <tie type="start"/>
      </note>
    `);
    const score = parser.fromMusicXML(xml);
    const el = score.parts[0].measures[0].elements[0];

    if (el.type === 'note') {
      expect(el.tie).toEqual({ type: 'continue' });
    }
  });

  it('parses direction with rehearsal mark', () => {
    const xml = wrap(`
      <direction>
        <direction-type>
          <rehearsal>A</rehearsal>
        </direction-type>
      </direction>
    `);
    const score = parser.fromMusicXML(xml);
    const dirs = score.parts[0].measures[0].directions;

    expect(dirs).toHaveLength(1);
    expect(dirs[0].type.kind).toBe('rehearsal');
    if (dirs[0].type.kind === 'rehearsal') {
      expect(dirs[0].type.text).toBe('A');
    }
  });
});
