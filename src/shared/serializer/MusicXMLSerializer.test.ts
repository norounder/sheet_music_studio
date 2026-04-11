import { describe, it, expect } from 'vitest';
import { MusicXMLSerializer } from './MusicXMLSerializer';
import type { ScoreData, NoteElement, RestElement, Part, Measure } from '../types';

function makeNote(overrides: Partial<NoteElement> = {}): NoteElement {
  return {
    type: 'note',
    id: 'n1',
    pitch: { step: 'C', octave: 4 },
    duration: { divisions: 1, noteType: 'quarter', dots: 0 },
    voice: 1,
    staff: 1,
    ...overrides,
  };
}

function makeRest(overrides: Partial<RestElement> = {}): RestElement {
  return {
    type: 'rest',
    id: 'r1',
    duration: { divisions: 1, noteType: 'quarter', dots: 0 },
    voice: 1,
    staff: 1,
    ...overrides,
  };
}

function makeMeasure(overrides: Partial<Measure> = {}): Measure {
  return {
    number: 1,
    elements: [],
    directions: [],
    ...overrides,
  };
}

function makePart(overrides: Partial<Part> = {}): Part {
  return {
    id: 'P1',
    name: 'Piano',
    staves: 1,
    measures: [makeMeasure()],
    ...overrides,
  };
}

function makeScore(overrides: Partial<ScoreData> = {}): ScoreData {
  return {
    parts: [makePart()],
    ...overrides,
  };
}

describe('MusicXMLSerializer', () => {
  const serializer = new MusicXMLSerializer();

  describe('toMusicXML', () => {
    it('generates XML declaration and DOCTYPE', () => {
      const xml = serializer.toMusicXML(makeScore());
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<!DOCTYPE score-partwise');
      expect(xml).toContain('<score-partwise version="3.1">');
      expect(xml).toContain('</score-partwise>');
    });

    it('generates part-list from parts', () => {
      const score = makeScore({
        parts: [
          makePart({ id: 'P1', name: 'Violin', abbreviation: 'Vln.' }),
          makePart({ id: 'P2', name: 'Cello' }),
        ],
      });
      const xml = serializer.toMusicXML(score);
      expect(xml).toContain('<score-part id="P1">');
      expect(xml).toContain('<part-name>Violin</part-name>');
      expect(xml).toContain('<part-abbreviation>Vln.</part-abbreviation>');
      expect(xml).toContain('<score-part id="P2">');
      expect(xml).toContain('<part-name>Cello</part-name>');
    });

    it('generates measure with attributes', () => {
      const score = makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            attributes: {
              divisions: 1,
              keySignature: { fifths: -2, mode: 'minor' },
              timeSignature: { beats: 3, beatType: 4 },
              staves: 2,
              clef: [
                { sign: 'G', line: 2, staffNumber: 1 },
                { sign: 'F', line: 4, staffNumber: 2 },
              ],
            },
          })],
        })],
      });
      const xml = serializer.toMusicXML(score);
      expect(xml).toContain('<divisions>1</divisions>');
      expect(xml).toContain('<fifths>-2</fifths>');
      expect(xml).toContain('<mode>minor</mode>');
      expect(xml).toContain('<beats>3</beats>');
      expect(xml).toContain('<beat-type>4</beat-type>');
      expect(xml).toContain('<staves>2</staves>');
      expect(xml).toContain('<sign>G</sign>');
      expect(xml).toContain('<sign>F</sign>');
    });

    it('serializes a note with pitch and duration', () => {
      const score = makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              pitch: { step: 'E', octave: 5, alter: -1 },
              duration: { divisions: 2, noteType: 'half', dots: 0 },
              stem: 'down',
            })],
          })],
        })],
      });
      const xml = serializer.toMusicXML(score);
      expect(xml).toContain('<step>E</step>');
      expect(xml).toContain('<alter>-1</alter>');
      expect(xml).toContain('<octave>5</octave>');
      expect(xml).toContain('<duration>2</duration>');
      expect(xml).toContain('<type>half</type>');
      expect(xml).toContain('<stem>down</stem>');
    });

    it('serializes a rest element', () => {
      const score = makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeRest()],
          })],
        })],
      });
      const xml = serializer.toMusicXML(score);
      expect(xml).toContain('<rest/>');
      expect(xml).toContain('<type>quarter</type>');
    });

    it('serializes rest with display-step/octave', () => {
      const score = makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeRest({ displayStep: 'B', displayOctave: 4 })],
          })],
        })],
      });
      const xml = serializer.toMusicXML(score);
      expect(xml).toContain('<display-step>B</display-step>');
      expect(xml).toContain('<display-octave>4</display-octave>');
    });

    it('serializes chord flag', () => {
      const score = makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [
              makeNote(),
              makeNote({ id: 'n2', chord: true, pitch: { step: 'E', octave: 4 } }),
            ],
          })],
        })],
      });
      const xml = serializer.toMusicXML(score);
      expect(xml).toContain('<chord/>');
    });

    it('serializes tie start/stop/continue', () => {
      const xml1 = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({ tie: { type: 'start' } })],
          })],
        })],
      }));
      expect(xml1).toContain('<tie type="start"/>');
      expect(xml1).toContain('<tied type="start"/>');

      const xml2 = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({ tie: { type: 'continue' } })],
          })],
        })],
      }));
      expect(xml2).toContain('<tie type="stop"/>');
      expect(xml2).toContain('<tie type="start"/>');
    });

    it('serializes slur', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              slur: [{ number: 1, type: 'start', placement: 'above' }],
            })],
          })],
        })],
      }));
      expect(xml).toContain('<slur type="start" number="1" placement="above"/>');
    });

    it('serializes beam', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              duration: { divisions: 1, noteType: 'eighth', dots: 0 },
              beam: [{ number: 1, type: 'begin' }],
            })],
          })],
        })],
      }));
      expect(xml).toContain('<beam number="1">begin</beam>');
    });

    it('serializes grace note', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              graceNote: { slash: true },
              duration: { divisions: 0, noteType: 'eighth', dots: 0 },
            })],
          })],
        })],
      }));
      expect(xml).toContain('<grace slash="yes"/>');
      // Grace notes should not have <duration>
      expect(xml).not.toMatch(/<duration>0<\/duration>/);
    });

    it('serializes dotted notes', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              duration: { divisions: 3, noteType: 'half', dots: 1 },
            })],
          })],
        })],
      }));
      expect(xml).toContain('<dot/>');
      expect(xml).toContain('<type>half</type>');
    });

    it('serializes articulations', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              articulations: ['staccato', 'accent'],
            })],
          })],
        })],
      }));
      expect(xml).toContain('<articulations>');
      expect(xml).toContain('<staccato/>');
      expect(xml).toContain('<accent/>');
    });

    it('serializes ornaments', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              ornaments: ['trill'],
            })],
          })],
        })],
      }));
      expect(xml).toContain('<ornaments>');
      expect(xml).toContain('<trill-mark/>');
    });

    it('serializes dynamics in notations', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({ dynamics: 'ff' })],
          })],
        })],
      }));
      expect(xml).toContain('<notations>');
      expect(xml).toContain('<dynamics>');
      expect(xml).toContain('<ff/>');
    });

    it('serializes lyrics', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              lyrics: [{ number: 1, syllabic: 'single', text: 'Hello' }],
            })],
          })],
        })],
      }));
      expect(xml).toContain('<lyric number="1">');
      expect(xml).toContain('<syllabic>single</syllabic>');
      expect(xml).toContain('<text>Hello</text>');
    });

    it('serializes fingering', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              fingering: { finger: 3, placement: 'above' },
            })],
          })],
        })],
      }));
      expect(xml).toContain('<technical>');
      expect(xml).toContain('<fingering placement="above">3</fingering>');
    });

    it('serializes forward and backup', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [
              { type: 'forward' as const, duration: { divisions: 2, noteType: 'quarter' as const, dots: 0 }, voice: 2, staff: 1 },
              { type: 'backup' as const, duration: { divisions: 4, noteType: 'quarter' as const, dots: 0 } },
            ],
          })],
        })],
      }));
      expect(xml).toContain('<forward>');
      expect(xml).toContain('<backup>');
    });

    it('serializes barline with repeat', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            barline: {
              location: 'right',
              style: 'light-heavy',
              repeat: { direction: 'backward' },
            },
          })],
        })],
      }));
      expect(xml).toContain('<barline location="right">');
      expect(xml).toContain('<bar-style>light-heavy</bar-style>');
      expect(xml).toContain('<repeat direction="backward"/>');
    });

    it('serializes barline with ending', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            barline: {
              location: 'left',
              style: 'heavy-light',
              ending: { number: [1], type: 'start', text: '1.' },
            },
          })],
        })],
      }));
      expect(xml).toContain('<ending number="1" type="start">1.</ending>');
    });

    it('serializes direction with tempo', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            directions: [{
              type: { kind: 'tempo', bpm: 120, text: 'Allegro' },
              placement: 'above',
            }],
          })],
        })],
      }));
      expect(xml).toContain('<words>Allegro</words>');
      expect(xml).toContain('<sound tempo="120"/>');
    });

    it('serializes direction with dynamics', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            directions: [{
              type: { kind: 'dynamic', value: 'ff' },
              placement: 'below',
            }],
          })],
        })],
      }));
      expect(xml).toContain('<dynamics>');
      expect(xml).toContain('<ff/>');
      expect(xml).toContain('placement="below"');
    });

    it('serializes direction with wedge', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            directions: [{
              type: { kind: 'wedge', value: { type: 'crescendo' } },
              placement: 'below',
            }],
          })],
        })],
      }));
      expect(xml).toContain('<wedge type="crescendo"/>');
    });

    it('serializes direction with pedal', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            directions: [{
              type: { kind: 'pedal', value: { type: 'start', line: true } },
              placement: 'below',
            }],
          })],
        })],
      }));
      expect(xml).toContain('<pedal type="start" line="yes"/>');
    });

    it('serializes direction with segno and coda', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            directions: [
              { type: { kind: 'segno' }, placement: 'above' },
              { type: { kind: 'coda' }, placement: 'above' },
            ],
          })],
        })],
      }));
      expect(xml).toContain('<segno/>');
      expect(xml).toContain('<coda/>');
    });

    it('serializes direction with rehearsal', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            directions: [{
              type: { kind: 'rehearsal', text: 'A' },
              placement: 'above',
            }],
          })],
        })],
      }));
      expect(xml).toContain('<rehearsal>A</rehearsal>');
    });

    it('serializes credits', () => {
      const xml = serializer.toMusicXML(makeScore({
        credits: [
          { type: 'title', text: 'My Song' },
          { type: 'composer', text: 'J. S. Bach' },
        ],
      }));
      expect(xml).toContain('<credit-type>title</credit-type>');
      expect(xml).toContain('<credit-words>My Song</credit-words>');
      expect(xml).toContain('<credit-type>composer</credit-type>');
      expect(xml).toContain('<credit-words>J. S. Bach</credit-words>');
    });

    it('serializes tuplet with time-modification', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({
          measures: [makeMeasure({
            elements: [makeNote({
              duration: {
                divisions: 1,
                noteType: 'eighth',
                dots: 0,
                tuplet: { actualNotes: 3, normalNotes: 2, type: 'start' },
              },
            })],
          })],
        })],
      }));
      expect(xml).toContain('<time-modification>');
      expect(xml).toContain('<actual-notes>3</actual-notes>');
      expect(xml).toContain('<normal-notes>2</normal-notes>');
      expect(xml).toContain('<tuplet type="start"/>');
    });
  });

  describe('validateMusicXML', () => {
    it('validates a correct MusicXML string', () => {
      const xml = serializer.toMusicXML(makeScore());
      const result = serializer.validateMusicXML(xml);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects missing XML declaration', () => {
      const result = serializer.validateMusicXML('<score-partwise></score-partwise>');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('XML declaration'))).toBe(true);
    });

    it('detects missing score-partwise root', () => {
      const result = serializer.validateMusicXML('<?xml version="1.0"?><foo></foo>');
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('score-partwise'))).toBe(true);
    });

    it('detects missing part-list', () => {
      const result = serializer.validateMusicXML(
        '<?xml version="1.0"?><score-partwise></score-partwise>'
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('part-list'))).toBe(true);
    });

    it('detects mismatched part ids', () => {
      const xml = `<?xml version="1.0"?>
<score-partwise>
  <part-list>
    <score-part id="P1"><part-name>X</part-name></score-part>
  </part-list>
  <part id="P2">
    <measure number="1"></measure>
  </part>
</score-partwise>`;
      const result = serializer.validateMusicXML(xml);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.message.includes('P1'))).toBe(true);
      expect(result.errors.some(e => e.message.includes('P2'))).toBe(true);
    });
  });

  describe('XML escaping', () => {
    it('escapes special characters in text', () => {
      const xml = serializer.toMusicXML(makeScore({
        parts: [makePart({ name: 'Tom & Jerry <Band>' })],
      }));
      expect(xml).toContain('Tom &amp; Jerry &lt;Band&gt;');
    });
  });
});
