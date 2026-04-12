/**
 * TransposeDialog 컴포넌트
 *
 * 조 변환 설정 모달: 반음 수 선택 + 범위 옵션
 */

import React, { useState } from 'react';

export interface TransposeDialogProps {
  onTranspose: (semitones: number, startMeasure?: number, endMeasure?: number) => void;
  onClose: () => void;
  totalMeasures: number;
}

const SEMITONE_OPTIONS = [
  { value: -12, label: '-12 (1 octave down)' },
  { value: -7, label: '-7 (P5 down)' },
  { value: -5, label: '-5 (P4 down)' },
  { value: -4, label: '-4 (M3 down)' },
  { value: -3, label: '-3 (m3 down)' },
  { value: -2, label: '-2 (M2 down)' },
  { value: -1, label: '-1 (m2 down)' },
  { value: 1, label: '+1 (m2 up)' },
  { value: 2, label: '+2 (M2 up)' },
  { value: 3, label: '+3 (m3 up)' },
  { value: 4, label: '+4 (M3 up)' },
  { value: 5, label: '+5 (P4 up)' },
  { value: 7, label: '+7 (P5 up)' },
  { value: 12, label: '+12 (1 octave up)' },
];

const TransposeDialog: React.FC<TransposeDialogProps> = ({
  onTranspose,
  onClose,
  totalMeasures,
}) => {
  const [semitones, setSemitones] = useState(2);
  const [useRange, setUseRange] = useState(false);
  const [startMeasure, setStartMeasure] = useState(1);
  const [endMeasure, setEndMeasure] = useState(totalMeasures);

  const handleSubmit = () => {
    if (semitones === 0) return;
    onTranspose(
      semitones,
      useRange ? startMeasure : undefined,
      useRange ? endMeasure : undefined,
    );
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Transpose</h3>

        <div className="dialog-field">
          <label className="dialog-label">Semitones</label>
          <select
            className="dialog-select"
            value={semitones}
            onChange={(e) => setSemitones(Number(e.target.value))}
          >
            {SEMITONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            className="dialog-input"
            type="number"
            min={-24}
            max={24}
            value={semitones}
            onChange={(e) => setSemitones(parseInt(e.target.value, 10) || 0)}
            style={{ width: 60, marginLeft: 8 }}
          />
        </div>

        <div className="dialog-field">
          <label className="dialog-label">
            <input
              type="checkbox"
              checked={useRange}
              onChange={(e) => setUseRange(e.target.checked)}
            />
            {' '}Measure range
          </label>
          {useRange && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                className="dialog-input"
                type="number"
                min={1}
                max={totalMeasures}
                value={startMeasure}
                onChange={(e) => setStartMeasure(parseInt(e.target.value, 10) || 1)}
                style={{ width: 50 }}
              />
              <span style={{ color: '#a6adc8' }}>~</span>
              <input
                className="dialog-input"
                type="number"
                min={1}
                max={totalMeasures}
                value={endMeasure}
                onChange={(e) => setEndMeasure(parseInt(e.target.value, 10) || totalMeasures)}
                style={{ width: 50 }}
              />
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button className="dialog-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="dialog-btn primary"
            onClick={handleSubmit}
            disabled={semitones === 0}
          >
            Transpose
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransposeDialog;
