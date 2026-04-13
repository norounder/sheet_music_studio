/**
 * SettingsDialog component
 *
 * Application settings panel for OMR engine, preprocessing, and inference options.
 * Reads/writes config/omr.json via IPC.
 */

import React, { useState } from 'react';

export type EngineMode = 'auto' | 'audiveris-only' | 'smt-only';
export type InferenceProvider = 'auto' | 'dml' | 'cpu';

export interface AppSettings {
  engine: { mode: EngineMode };
  inference: { provider: InferenceProvider; threads: number };
  smt: { maxTokens: number };
  preprocessing: {
    enabled: boolean;
    targetDPI: number;
    binarize: boolean;
    denoise: boolean;
    normalizeContrast: boolean;
  };
}

export interface SettingsDialogProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

const ENGINE_OPTIONS: { value: EngineMode; label: string; description: string }[] = [
  { value: 'audiveris-only', label: 'Audiveris only', description: 'Best for printed/scanned scores, hymns, and real-world images. Most reliable.' },
  { value: 'smt-only', label: 'SMT++ only (experimental)', description: 'ML-based. Only works well with digitally-rendered scores (MuseScore, Lilypond output).' },
  { value: 'auto', label: 'Both (ensemble)', description: 'Runs both engines and merges results. Slower but may improve accuracy on clean digital scores.' },
];

const PROVIDER_OPTIONS: { value: InferenceProvider; label: string }[] = [
  { value: 'auto', label: 'Auto (GPU if available)' },
  { value: 'dml', label: 'DirectML (GPU)' },
  { value: 'cpu', label: 'CPU only' },
];

const SettingsDialog: React.FC<SettingsDialogProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [local, setLocal] = useState<AppSettings>(JSON.parse(JSON.stringify(settings)));

  const updateEngine = (mode: EngineMode) => {
    setLocal({ ...local, engine: { mode } });
  };

  const updatePreprocessing = (key: keyof AppSettings['preprocessing'], value: boolean | number) => {
    setLocal({ ...local, preprocessing: { ...local.preprocessing, [key]: value } });
  };

  const handleSave = () => {
    onSave(local);
    onClose();
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, maxHeight: '80vh', overflow: 'auto' }}
      >
        <h3 className="dialog-title">Settings</h3>

        {/* OMR Engine */}
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'var(--text-primary, #e8eaf0)', fontSize: 13, marginBottom: 8 }}>OMR Engine</h4>
          {ENGINE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'block',
                padding: '8px 12px',
                marginBottom: 4,
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: local.engine.mode === opt.value ? 'var(--bg-elevated, #253355)' : 'transparent',
                border: local.engine.mode === opt.value ? '1px solid var(--border-strong, rgba(255,255,255,0.14))' : '1px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="engine"
                  value={opt.value}
                  checked={local.engine.mode === opt.value}
                  onChange={() => updateEngine(opt.value)}
                  style={{ accentColor: 'var(--accent, #7c6cf0)' }}
                />
                <span style={{ color: 'var(--text-primary, #e8eaf0)', fontSize: 13 }}>{opt.label}</span>
              </div>
              <div style={{ color: 'var(--text-muted, #6b7394)', fontSize: 11, marginLeft: 24, marginTop: 2 }}>
                {opt.description}
              </div>
            </label>
          ))}
        </div>

        {/* Inference Provider (only relevant when SMT++ is used) */}
        {local.engine.mode !== 'audiveris-only' && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ color: 'var(--text-primary, #e8eaf0)', fontSize: 13, marginBottom: 8 }}>ML Inference</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary, #9ca3b8)', fontSize: 12, minWidth: 60 }}>Provider</span>
              <select
                value={local.inference.provider}
                onChange={(e) => setLocal({ ...local, inference: { ...local.inference, provider: e.target.value as InferenceProvider } })}
                style={{
                  backgroundColor: 'var(--bg-elevated, #253355)', color: 'var(--text-primary, #e8eaf0)', border: '1px solid var(--border-strong, rgba(255,255,255,0.14))',
                  borderRadius: 4, padding: '4px 8px', fontSize: 12,
                }}
              >
                {PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-secondary, #9ca3b8)', fontSize: 12, minWidth: 60 }}>Max tokens</span>
              <input
                type="number"
                min={100}
                max={1512}
                step={100}
                value={local.smt.maxTokens}
                onChange={(e) => setLocal({ ...local, smt: { ...local.smt, maxTokens: parseInt(e.target.value, 10) || 500 } })}
                style={{
                  backgroundColor: 'var(--bg-elevated, #253355)', color: 'var(--text-primary, #e8eaf0)', border: '1px solid var(--border-strong, rgba(255,255,255,0.14))',
                  borderRadius: 4, padding: '4px 8px', fontSize: 12, width: 70,
                }}
              />
              <span style={{ color: 'var(--border-strong, rgba(255,255,255,0.14))', fontSize: 11 }}>Lower = faster</span>
            </div>
          </div>
        )}

        {/* Preprocessing */}
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'var(--text-primary, #e8eaf0)', fontSize: 13, marginBottom: 8 }}>Image Preprocessing</h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={local.preprocessing.enabled}
              onChange={(e) => updatePreprocessing('enabled', e.target.checked)}
              style={{ accentColor: 'var(--accent, #7c6cf0)' }}
            />
            <span style={{ color: 'var(--text-primary, #e8eaf0)', fontSize: 12 }}>Enable preprocessing</span>
          </label>

          {local.preprocessing.enabled && (
            <div style={{ marginLeft: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: 'var(--text-secondary, #9ca3b8)', fontSize: 12, minWidth: 70 }}>Target DPI</span>
                <select
                  value={local.preprocessing.targetDPI}
                  onChange={(e) => updatePreprocessing('targetDPI', parseInt(e.target.value, 10))}
                  style={{
                    backgroundColor: 'var(--bg-elevated, #253355)', color: 'var(--text-primary, #e8eaf0)', border: '1px solid var(--border-strong, rgba(255,255,255,0.14))',
                    borderRadius: 4, padding: '4px 8px', fontSize: 12,
                  }}
                >
                  <option value={200}>200 DPI</option>
                  <option value={300}>300 DPI (recommended)</option>
                  <option value={400}>400 DPI</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={local.preprocessing.denoise} onChange={(e) => updatePreprocessing('denoise', e.target.checked)} style={{ accentColor: 'var(--accent, #7c6cf0)' }} />
                <span style={{ color: 'var(--text-secondary, #9ca3b8)', fontSize: 12 }}>Denoise</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={local.preprocessing.normalizeContrast} onChange={(e) => updatePreprocessing('normalizeContrast', e.target.checked)} style={{ accentColor: 'var(--accent, #7c6cf0)' }} />
                <span style={{ color: 'var(--text-secondary, #9ca3b8)', fontSize: 12 }}>Normalize contrast</span>
              </label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="dialog-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="dialog-btn" onClick={onClose}>Cancel</button>
          <button className="dialog-btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
