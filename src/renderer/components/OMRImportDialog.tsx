/**
 * OMRImportDialog component
 *
 * Shows OMR processing progress after the user selects an image/PDF.
 * Displays stage, page progress, and percent bar with cancel support.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { OMR_CHANNELS } from '../../shared/ipc/channels';
import type { OMRProgress } from '../../shared/types/progress';
import type { ScoreDocument } from '../../shared/types/document';
import type { OMRRecognizeResponse } from '../../shared/ipc/payloads';

export interface OMRImportDialogProps {
  onComplete: (document: ScoreDocument, processingTimeMs: number) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

type DialogState = 'processing' | 'error';

/** Map stage + percent to more detailed progress labels */
function getStageLabel(stage: OMRProgress['stage'], percent: number): string {
  if (stage === 'preprocessing') {
    return 'Preparing image...';
  }
  if (stage === 'inference') {
    if (percent < 25) return 'Loading models...';
    if (percent < 40) return 'Analyzing staff lines...';
    if (percent < 55) return 'Detecting notes & symbols...';
    if (percent < 70) return 'Recognizing rhythm...';
    return 'Processing chords & text...';
  }
  if (stage === 'postprocessing') {
    if (percent < 85) return 'Merging results...';
    if (percent < 95) return 'Verifying music theory...';
    return 'Building score...';
  }
  return 'Processing...';
}

const OMRImportDialog: React.FC<OMRImportDialogProps> = ({
  onComplete,
  onCancel,
  onError,
}) => {
  const [state, setState] = useState<DialogState>('processing');
  const [progress, setProgress] = useState<OMRProgress>({
    stage: 'preprocessing',
    currentPage: 0,
    totalPages: 1,
    percent: 0,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [elapsedSec, setElapsedSec] = useState(0);
  const invokedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Elapsed time counter
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Subscribe to progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.on(
      OMR_CHANNELS.PROGRESS,
      (data: unknown) => {
        setProgress(data as OMRProgress);
      },
    );
    return unsubscribe;
  }, []);

  // Invoke OMR recognition once on mount
  const runOMR = useCallback(async () => {
    if (invokedRef.current) return;
    invokedRef.current = true;

    try {
      const response = await window.electronAPI.invoke<OMRRecognizeResponse | null>(
        OMR_CHANNELS.RECOGNIZE,
      );

      if (!response.success) {
        setState('error');
        setErrorMessage(response.error.message);
        onError(response.error.message);
        return;
      }

      // User cancelled the file dialog
      if (response.data === null) {
        onCancel();
        return;
      }

      onComplete(response.data.document, response.data.processingTimeMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState('error');
      setErrorMessage(message);
      onError(message);
    }
  }, [onComplete, onCancel, onError]);

  useEffect(() => {
    runOMR();
  }, [runOMR]);

  if (state === 'error') {
    return (
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
          <h3 className="dialog-title">OMR Error</h3>
          <p style={{ color: '#f38ba8', margin: '12px 0' }}>{errorMessage}</p>
          <div className="dialog-actions">
            <button className="dialog-btn" onClick={onCancel}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Recognizing Sheet Music...</h3>

        <div style={{ margin: '16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#cdd6f4', fontSize: 13 }}>
              {getStageLabel(progress.stage, progress.percent)}
            </span>
            <span style={{ color: '#a6adc8', fontSize: 13 }}>
              {progress.totalPages > 1
                ? `Page ${progress.currentPage} / ${progress.totalPages}`
                : ''}
            </span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              height: 6,
              backgroundColor: '#313244',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress.percent}%`,
                height: '100%',
                backgroundColor: '#89b4fa',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#585b70', fontSize: 12 }}>
              {elapsedSec}s
            </span>
            <span style={{ color: '#a6adc8', fontSize: 12 }}>
              {progress.percent}%
            </span>
          </div>
        </div>

        <div className="dialog-actions">
          <button className="dialog-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default OMRImportDialog;
