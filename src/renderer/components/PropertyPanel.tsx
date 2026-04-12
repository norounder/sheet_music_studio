/**
 * PropertyPanel 컴포넌트
 *
 * 선택된 음표/요소의 속성을 표시하고 수정할 수 있는 우측 패널.
 * 음높이, 음길이, 성부, 보표, 아티큘레이션 정보를 표시한다.
 */

import React, { useState } from 'react';
import type { NoteElement, RestElement, NoteType, PitchStep, Articulation } from '@shared/types';

export interface SelectedElement {
  type: 'note' | 'rest' | 'measure';
  element?: NoteElement | RestElement;
  measureIndex?: number;
}

export interface PropertyPanelProps {
  /** 현재 선택된 요소 */
  selected: SelectedElement | null;
  /** 속성 변경 콜백 */
  onPropertyChange?: (property: string, value: unknown) => void;
}

const PITCH_STEPS: PitchStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'whole', label: 'Whole' },
  { value: 'half', label: 'Half' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'eighth', label: '8th' },
  { value: '16th', label: '16th' },
  { value: '32nd', label: '32nd' },
];

const ARTICULATIONS: { value: Articulation; label: string }[] = [
  { value: 'staccato', label: 'Stacc.' },
  { value: 'tenuto', label: 'Ten.' },
  { value: 'accent', label: 'Acc.' },
  { value: 'marcato', label: 'Marc.' },
  { value: 'fermata', label: 'Ferm.' },
  { value: 'staccatissimo', label: 'Stiss.' },
];

const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selected,
  onPropertyChange,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="property-panel collapsed">
        <button
          className="property-panel-toggle"
          onClick={() => setCollapsed(false)}
          title="Show properties"
          style={{ position: 'absolute', right: 4, top: 52 }}
        >
          ◀
        </button>
      </div>
    );
  }

  const noteElement =
    selected?.type === 'note' && selected.element?.type === 'note'
      ? (selected.element as NoteElement)
      : null;
  const restElement =
    selected?.type === 'rest' && selected.element?.type === 'rest'
      ? (selected.element as RestElement)
      : null;

  return (
    <div className="property-panel" role="complementary" aria-label="Property panel">
      <div className="property-panel-header">
        <h3>Properties</h3>
        <button
          className="property-panel-toggle"
          onClick={() => setCollapsed(true)}
          title="Hide properties"
        >
          ▶
        </button>
      </div>

      <div className="property-panel-content">
        {!selected ? (
          <div className="no-selection">No selection</div>
        ) : selected.type === 'measure' ? (
          <div className="property-section">
            <div className="property-section-title">Measure</div>
            <div className="property-row">
              <span className="property-label">Number</span>
              <span className="property-value">
                {selected.measureIndex !== undefined ? selected.measureIndex + 1 : '—'}
              </span>
            </div>
          </div>
        ) : noteElement ? (
          <>
            {/* Pitch section */}
            <div className="property-section">
              <div className="property-section-title">Pitch</div>
              <div className="property-row">
                <span className="property-label">Step</span>
                <select
                  className="property-select"
                  value={noteElement.pitch.step}
                  onChange={(e) =>
                    onPropertyChange?.('pitch.step', e.target.value)
                  }
                >
                  {PITCH_STEPS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="property-row">
                <span className="property-label">Octave</span>
                <input
                  className="property-input"
                  type="number"
                  min={0}
                  max={9}
                  value={noteElement.pitch.octave}
                  onChange={(e) =>
                    onPropertyChange?.('pitch.octave', parseInt(e.target.value, 10))
                  }
                />
              </div>
              <div className="property-row">
                <span className="property-label">Alter</span>
                <input
                  className="property-input"
                  type="number"
                  min={-2}
                  max={2}
                  value={noteElement.pitch.alter ?? 0}
                  onChange={(e) =>
                    onPropertyChange?.('pitch.alter', parseInt(e.target.value, 10))
                  }
                />
              </div>
            </div>

            {/* Duration section */}
            <div className="property-section">
              <div className="property-section-title">Duration</div>
              <div className="property-row">
                <span className="property-label">Type</span>
                <select
                  className="property-select"
                  value={noteElement.duration.noteType}
                  onChange={(e) =>
                    onPropertyChange?.('duration.noteType', e.target.value)
                  }
                >
                  {NOTE_TYPES.map((nt) => (
                    <option key={nt.value} value={nt.value}>{nt.label}</option>
                  ))}
                </select>
              </div>
              <div className="property-row">
                <span className="property-label">Dots</span>
                <input
                  className="property-input"
                  type="number"
                  min={0}
                  max={2}
                  value={noteElement.duration.dots}
                  onChange={(e) =>
                    onPropertyChange?.('duration.dots', parseInt(e.target.value, 10))
                  }
                />
              </div>
            </div>

            {/* Stem direction section */}
            <div className="property-section">
              <div className="property-section-title">Stem</div>
              <div className="property-row">
                <span className="property-label">Direction</span>
                <select
                  className="property-select"
                  value={noteElement.stem ?? 'auto'}
                  onChange={(e) => {
                    const val = e.target.value;
                    onPropertyChange?.('stem', val === 'auto' ? undefined : val);
                  }}
                >
                  <option value="auto">Auto</option>
                  <option value="up">Up</option>
                  <option value="down">Down</option>
                </select>
              </div>
            </div>

            {/* Voice / Staff section */}
            <div className="property-section">
              <div className="property-section-title">Voice &amp; Staff</div>
              <div className="property-row">
                <span className="property-label">Voice</span>
                <span className="property-value">{noteElement.voice}</span>
              </div>
              <div className="property-row">
                <span className="property-label">Staff</span>
                <span className="property-value">{noteElement.staff}</span>
              </div>
            </div>

            {/* Articulations section */}
            <div className="property-section">
              <div className="property-section-title">Articulations</div>
              <div className="articulation-toggles">
                {ARTICULATIONS.map((art) => {
                  const isActive = noteElement.articulations?.includes(art.value) ?? false;
                  return (
                    <button
                      key={art.value}
                      className={`articulation-toggle ${isActive ? 'active' : ''}`}
                      onClick={() =>
                        onPropertyChange?.('articulation.toggle', art.value)
                      }
                      title={art.value}
                    >
                      {art.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Delete note */}
            <div className="property-section">
              <button
                className="property-action-btn danger"
                onClick={() => onPropertyChange?.('note.delete', null)}
                title="Delete note (replace with rest)"
              >
                Delete Note
              </button>
            </div>
          </>
        ) : restElement ? (
          <>
            {/* Rest info */}
            <div className="property-section">
              <div className="property-section-title">Rest</div>
              <div className="property-row">
                <span className="property-label">Type</span>
                <select
                  className="property-select"
                  value={restElement.duration.noteType}
                  onChange={(e) =>
                    onPropertyChange?.('rest.duration.noteType', e.target.value)
                  }
                >
                  {NOTE_TYPES.map((nt) => (
                    <option key={nt.value} value={nt.value}>{nt.label}</option>
                  ))}
                </select>
              </div>
              <div className="property-row">
                <span className="property-label">Dots</span>
                <input
                  className="property-input"
                  type="number"
                  min={0}
                  max={2}
                  value={restElement.duration.dots}
                  onChange={(e) =>
                    onPropertyChange?.('rest.duration.dots', parseInt(e.target.value, 10))
                  }
                />
              </div>
            </div>

            {/* Voice / Staff */}
            <div className="property-section">
              <div className="property-section-title">Voice &amp; Staff</div>
              <div className="property-row">
                <span className="property-label">Voice</span>
                <span className="property-value">{restElement.voice}</span>
              </div>
              <div className="property-row">
                <span className="property-label">Staff</span>
                <span className="property-value">{restElement.staff}</span>
              </div>
            </div>

            {/* Convert to note */}
            <div className="property-section">
              <div className="property-section-title">Convert</div>
              <div className="property-row">
                <span className="property-label">Pitch</span>
                <select
                  className="property-select"
                  defaultValue="C"
                  id="convert-pitch-step"
                >
                  {PITCH_STEPS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="property-row">
                <span className="property-label">Octave</span>
                <input
                  className="property-input"
                  type="number"
                  min={0}
                  max={9}
                  defaultValue={4}
                  id="convert-pitch-octave"
                />
              </div>
              <button
                className="property-action-btn"
                onClick={() => {
                  const stepEl = document.getElementById('convert-pitch-step') as HTMLSelectElement;
                  const octEl = document.getElementById('convert-pitch-octave') as HTMLInputElement;
                  onPropertyChange?.('rest.convertToNote', {
                    step: stepEl?.value ?? 'C',
                    octave: parseInt(octEl?.value ?? '4', 10),
                  });
                }}
                title="Convert rest to note"
              >
                Convert to Note
              </button>
            </div>
          </>
        ) : (
          <div className="no-selection">Select a note or rest to edit</div>
        )}
      </div>
    </div>
  );
};

export default PropertyPanel;
