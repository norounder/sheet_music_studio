/**
 * ReviewPanel component
 *
 * Side panel for reviewing low-confidence OMR recognition results.
 * Shows each flagged item with confidence, type, and measure location.
 */

import React, { useMemo } from 'react';
import type { ReviewState, ReviewItem, ReviewReason } from '../../shared/types/review';

export interface ReviewPanelProps {
  reviewState: ReviewState;
  onAccept: (itemId: string) => void;
  onSkip: (itemId: string) => void;
  onClose: () => void;
}

/** Confidence level thresholds for color coding */
function getConfidenceColor(confidence: number): string {
  if (confidence < 0.4) return '#f38ba8';  // red
  if (confidence < 0.6) return '#fab387';  // peach
  return '#f9e2af';                         // yellow
}

/** Friendly symbol type labels */
const SYMBOL_LABELS: Record<string, string> = {
  note: 'Note',
  rest: 'Rest',
  clef: 'Clef',
  'key-signature': 'Key Sig.',
  'time-signature': 'Time Sig.',
  'grace-note': 'Grace Note',
  dynamic: 'Dynamic',
  articulation: 'Articulation',
  ornament: 'Ornament',
  beam: 'Beam',
  tie: 'Tie',
  slur: 'Slur',
  barline: 'Barline',
  repeat: 'Repeat',
  ending: 'Ending',
  pedal: 'Pedal',
  fingering: 'Fingering',
  lyric: 'Lyric',
  unknown: 'Unknown',
};

/** Convert excess divisions to readable rhythm value */
function divisionsToRhythm(divisions: number, baseDivisions: number = 4): string {
  const ratio = Math.abs(divisions) / baseDivisions;
  if (ratio >= 4) return `${ratio / 4} whole note(s)`;
  if (ratio >= 2) return `${ratio / 2} half note(s)`;
  if (ratio >= 1) return `${ratio} quarter note(s)`;
  if (ratio >= 0.5) return `${ratio * 2} eighth note(s)`;
  return `${ratio * 4} 16th note(s)`;
}

/** Generate human-readable diagnostic message from ReviewReason */
function getReasonMessage(reason: ReviewReason | undefined): string | null {
  if (!reason) return null;

  switch (reason.type) {
    case 'rhythm-mismatch': {
      const direction = reason.excessDivisions > 0 ? 'too long' : 'too short';
      const amount = divisionsToRhythm(reason.excessDivisions);
      return `Voice ${reason.voice}: ${amount} ${direction}`;
    }
    case 'out-of-range':
      return `Pitch out of range for this clef (MIDI ${reason.midi})`;
    case 'grace-note':
      return 'Grace notes are often misrecognized';
    case 'short-note':
      return `Very short note (${reason.noteType}) — high error rate`;
    case 'double-accidental':
      return `Double ${reason.alter > 0 ? 'sharp' : 'flat'} — unusual, verify`;
    case 'tuplet':
      return 'Tuplet grouping may be incorrect';
    case 'tie-invalid':
      return `Invalid tie: ${reason.description}`;
    case 'voice-crossing':
      return 'Voice crossing detected — voices may be swapped';
    case 'lyric-gap':
      return 'Missing lyric syllable — expected text under this note';
    case 'repeat-unmatched':
      return 'Repeat sign without matching pair';
    case 'ensemble-conflict':
      return `Engines disagree: ${reason.description}`;
  }
}

/** Icon for each reason type */
function getReasonIcon(reason: ReviewReason | undefined): string {
  if (!reason) return '?';
  switch (reason.type) {
    case 'rhythm-mismatch': return '♩';
    case 'out-of-range': return '↕';
    case 'grace-note': return '♪';
    case 'short-note': return '♬';
    case 'double-accidental': return '♯';
    case 'tuplet': return '3';
    case 'tie-invalid': return '⌒';
    case 'voice-crossing': return '✕';
    case 'lyric-gap': return 'A';
    case 'repeat-unmatched': return '𝄇';
    case 'ensemble-conflict': return '⚡';
  }
}

const ReviewPanel: React.FC<ReviewPanelProps> = ({
  reviewState,
  onAccept,
  onSkip,
  onClose,
}) => {
  const pendingItems = useMemo(
    () => reviewState.items.filter((item) => item.status === 'pending'),
    [reviewState.items],
  );

  const completedCount = reviewState.items.length - pendingItems.length;
  const currentItem: ReviewItem | undefined = pendingItems[0];

  // All items reviewed
  if (!currentItem) {
    return (
      <div className="review-panel">
        <div className="review-panel-header">
          <h3 style={{ margin: 0, fontSize: 14, color: '#cdd6f4' }}>Review Complete</h3>
          <button className="review-panel-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>
        <div style={{ padding: 16, textAlign: 'center', color: '#a6adc8' }}>
          <p>All {reviewState.items.length} items have been reviewed.</p>
          <button className="dialog-btn primary" onClick={onClose} style={{ marginTop: 12 }}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const conf = currentItem.symbolConfidence;
  const confPercent = Math.round(conf.confidence * 100);
  const confColor = getConfidenceColor(conf.confidence);

  return (
    <div className="review-panel">
      <div className="review-panel-header">
        <h3 style={{ margin: 0, fontSize: 14, color: '#cdd6f4' }}>OMR Review</h3>
        <button className="review-panel-close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      {/* Progress */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #313244' }}>
        <span style={{ color: '#a6adc8', fontSize: 12 }}>
          {completedCount} / {reviewState.items.length} reviewed
        </span>
        <div
          style={{
            width: '100%',
            height: 3,
            backgroundColor: '#313244',
            borderRadius: 2,
            marginTop: 4,
          }}
        >
          <div
            style={{
              width: `${(completedCount / reviewState.items.length) * 100}%`,
              height: '100%',
              backgroundColor: '#a6e3a1',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Current item */}
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#cdd6f4', fontSize: 13, fontWeight: 600 }}>
              <span style={{ marginRight: 6 }}>{getReasonIcon(currentItem.reason)}</span>
              {SYMBOL_LABELS[conf.type] ?? conf.type}
            </span>
            <span style={{ color: confColor, fontSize: 13, fontWeight: 600 }}>
              {confPercent}%
            </span>
          </div>
          <div style={{ color: '#a6adc8', fontSize: 12, marginTop: 4 }}>
            Measure {currentItem.measureIndex + 1}
          </div>
        </div>

        {/* Diagnostic reason */}
        {currentItem.reason && (
          <div
            style={{
              padding: '8px 10px',
              backgroundColor: '#1e1e2e',
              borderLeft: `3px solid ${confColor}`,
              borderRadius: '0 4px 4px 0',
              marginBottom: 12,
              fontSize: 12,
              color: '#bac2de',
              lineHeight: 1.4,
            }}
          >
            {getReasonMessage(currentItem.reason)}
          </div>
        )}

        {/* Confidence bar */}
        <div
          style={{
            width: '100%',
            height: 4,
            backgroundColor: '#313244',
            borderRadius: 2,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: `${confPercent}%`,
              height: '100%',
              backgroundColor: confColor,
              borderRadius: 2,
            }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="dialog-btn primary"
            style={{ flex: 1 }}
            onClick={() => onAccept(currentItem.id)}
          >
            Accept
          </button>
          <button
            className="dialog-btn"
            style={{ flex: 1 }}
            onClick={() => onSkip(currentItem.id)}
          >
            Skip
          </button>
        </div>
      </div>

      {/* Remaining items summary */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid #313244' }}>
        <span style={{ color: '#585b70', fontSize: 11 }}>
          {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} remaining
        </span>
      </div>
    </div>
  );
};

export default ReviewPanel;
