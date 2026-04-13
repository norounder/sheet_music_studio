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
  /** Called when user wants to navigate to a specific measure */
  onNavigateToMeasure?: (measureIndex: number) => void;
}

/** Confidence level thresholds for color coding */
function getConfidenceColor(confidence: number): string {
  if (confidence < 0.4) return 'var(--danger, #f87171)';
  if (confidence < 0.6) return 'var(--warning, #fbbf24)';
  return '#fde68a'; // soft yellow
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

/** Get actionable guidance for the user based on reason type */
function getActionGuidance(reason: ReviewReason | undefined): string {
  if (!reason) return 'Check this symbol and accept if correct, or edit it in the score.';

  switch (reason.type) {
    case 'rhythm-mismatch':
      return reason.excessDivisions > 0
        ? 'This measure has too many beats. Try shortening a note or removing an extra note.'
        : 'This measure has too few beats. Try lengthening a note or adding a rest.';
    case 'out-of-range':
      return 'This note is unusually high or low for this clef. Check if the pitch is correct.';
    case 'grace-note':
      return 'Grace notes are often misrecognized. Verify the pitch and that it should be a grace note.';
    case 'short-note':
      return 'Very short notes (32nd+) have high error rates. Check pitch and duration.';
    case 'double-accidental':
      return 'Double sharps/flats are rare. Verify this is not a single accidental misread.';
    case 'tuplet':
      return 'Check if this is actually a tuplet, and if the grouping (e.g. triplet) is correct.';
    case 'tie-invalid':
      return 'Ties must connect notes of the same pitch. Check if this should be a slur instead.';
    case 'voice-crossing':
      return 'Upper voice is lower than lower voice. Check if notes are in the right voice.';
    case 'lyric-gap':
      return 'This note is missing a lyric syllable. Add the lyric text or verify the note.';
    case 'repeat-unmatched':
      return 'A repeat sign is missing its pair. Add the matching repeat or remove this one.';
    case 'ensemble-conflict':
      return 'Multiple recognition engines disagreed. Carefully verify this section.';
  }
}

const ReviewPanel: React.FC<ReviewPanelProps> = ({
  reviewState,
  onAccept,
  onSkip,
  onClose,
  onNavigateToMeasure,
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
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary, #e8eaf0)' }}>Review Complete</h3>
          <button className="review-panel-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary, #9ca3b8)' }}>
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
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary, #e8eaf0)' }}>OMR Review</h3>
        <button className="review-panel-close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      {/* Progress */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
        <span style={{ color: 'var(--text-secondary, #9ca3b8)', fontSize: 12 }}>
          {completedCount} / {reviewState.items.length} reviewed
        </span>
        <div
          style={{
            width: '100%',
            height: 3,
            backgroundColor: 'var(--border, rgba(255,255,255,0.08))',
            borderRadius: 2,
            marginTop: 4,
          }}
        >
          <div
            style={{
              width: `${(completedCount / reviewState.items.length) * 100}%`,
              height: '100%',
              backgroundColor: 'var(--success, #4ade80)',
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
            <span style={{ color: 'var(--text-primary, #e8eaf0)', fontSize: 13, fontWeight: 600 }}>
              <span style={{ marginRight: 6 }}>{getReasonIcon(currentItem.reason)}</span>
              {SYMBOL_LABELS[conf.type] ?? conf.type}
            </span>
            <span style={{ color: confColor, fontSize: 13, fontWeight: 600 }}>
              {confPercent}%
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ color: 'var(--text-secondary, #9ca3b8)', fontSize: 12 }}>
              Measure {currentItem.measureIndex + 1}
            </span>
            {onNavigateToMeasure && (
              <button
                onClick={() => onNavigateToMeasure(currentItem.measureIndex)}
                style={{
                  background: 'none', border: '1px solid var(--bg-elevated, #253355)', borderRadius: 3,
                  color: 'var(--accent, #7c6cf0)', fontSize: 11, padding: '1px 6px', cursor: 'pointer',
                }}
              >
                Go to measure
              </button>
            )}
          </div>
        </div>

        {/* Diagnostic reason */}
        {currentItem.reason && (
          <div
            style={{
              padding: '8px 10px',
              backgroundColor: 'var(--bg-primary, #1a1a2e)',
              borderLeft: `3px solid ${confColor}`,
              borderRadius: '0 4px 4px 0',
              marginBottom: 8,
              fontSize: 12,
              color: 'var(--text-secondary, #9ca3b8)',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {getReasonMessage(currentItem.reason)}
            </div>
            <div style={{ color: 'var(--text-muted, #6b7394)', fontSize: 11 }}>
              {getActionGuidance(currentItem.reason)}
            </div>
          </div>
        )}

        {/* Fallback guidance when no reason */}
        {!currentItem.reason && (
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7394)', marginBottom: 8 }}>
            Low confidence recognition. Please verify this symbol in the score.
          </div>
        )}

        {/* Confidence bar */}
        <div
          style={{
            width: '100%',
            height: 4,
            backgroundColor: 'var(--border, rgba(255,255,255,0.08))',
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
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
        <span style={{ color: 'var(--text-muted, #6b7394)', fontSize: 11 }}>
          {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} remaining
        </span>
      </div>
    </div>
  );
};

export default ReviewPanel;
