/**
 * PlaybackEngine
 * Converts ScoreData to audio playback using Tone.js.
 * Runs in the renderer process (Web Audio API).
 */

import * as Tone from 'tone';
import type { ScoreData } from '@shared/types';
import {
  scoreDataToEvents,
  getTotalDuration,
  midiNoteToFrequency,
  type NoteEvent,
  type PlaybackPosition,
} from './midiUtils';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export class PlaybackEngine {
  private synth: Tone.PolySynth | null = null;
  private events: NoteEvent[] = [];
  private scheduledIds: number[] = [];
  private tempo: number = 120;
  private state: PlaybackState = 'stopped';
  private positionCallbacks = new Set<(pos: PlaybackPosition) => void>();
  private stateCallbacks = new Set<(state: PlaybackState) => void>();
  private positionInterval: ReturnType<typeof setInterval> | null = null;
  private totalDuration: number = 0;

  /** Load score data and convert to playback events */
  loadScore(scoreData: ScoreData, tempo?: number): void {
    if (tempo) this.tempo = tempo;

    // Detect tempo from directions
    for (const part of scoreData.parts) {
      for (const measure of part.measures) {
        for (const dir of measure.directions) {
          if (dir.type.kind === 'tempo') {
            this.tempo = dir.type.bpm;
            break;
          }
        }
      }
    }

    this.events = scoreDataToEvents(scoreData, this.tempo);
    this.totalDuration = getTotalDuration(this.events);
  }

  private starting = false;

  /** Start or resume playback */
  async play(): Promise<void> {
    if (this.state === 'playing' || this.starting) return;
    this.starting = true;

    try {
      // Ensure AudioContext is started (browser requirement)
      await Tone.start();

      if (!this.synth) {
        this.synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: {
            attack: 0.01,
            decay: 0.1,
            sustain: 0.4,
            release: 0.8,
          },
        }).toDestination();
        this.synth.volume.value = -6;
      }

      if (this.state === 'paused') {
        Tone.getTransport().start();
      } else {
        // Start from beginning — cancel without intermediate state notification
        Tone.getTransport().stop();
        Tone.getTransport().cancel();
        this.scheduledIds = [];
        this.stopPositionTracking();
        this.scheduleEvents();
        Tone.getTransport().start();
      }

      this.state = 'playing';
      this.notifyState();
      this.startPositionTracking();
    } finally {
      this.starting = false;
    }
  }

  /** Pause playback */
  pause(): void {
    if (this.state !== 'playing') return;
    Tone.getTransport().pause();
    this.state = 'paused';
    this.notifyState();
    this.stopPositionTracking();
  }

  /** Stop playback and reset to beginning */
  stop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    this.scheduledIds = [];
    this.state = 'stopped';
    this.notifyState();
    this.stopPositionTracking();
    this.notifyPosition({ activeNotes: [], timeSeconds: 0 });
  }

  /** Set tempo (BPM) */
  setTempo(bpm: number): void {
    this.tempo = Math.max(20, Math.min(300, bpm));
    // Re-schedule if score is loaded
    if (this.events.length > 0 && this.state === 'stopped') {
      // Events are pre-computed with fixed tempo, so we need to reload
      // For simplicity, we'll just store the new tempo for next loadScore
    }
  }

  /** Get current tempo */
  getTempo(): number {
    return this.tempo;
  }

  /** Get current playback state */
  getState(): PlaybackState {
    return this.state;
  }

  /** Subscribe to position changes */
  onPositionChange(cb: (pos: PlaybackPosition) => void): () => void {
    this.positionCallbacks.add(cb);
    return () => this.positionCallbacks.delete(cb);
  }

  /** Subscribe to state changes */
  onStateChange(cb: (state: PlaybackState) => void): () => void {
    this.stateCallbacks.add(cb);
    return () => this.stateCallbacks.delete(cb);
  }

  /** Clean up resources */
  dispose(): void {
    this.stop();
    this.synth?.dispose();
    this.synth = null;
    this.positionCallbacks.clear();
    this.stateCallbacks.clear();
  }

  // ─── Internal ───

  private scheduleEvents(): void {
    if (!this.synth) return;

    for (const event of this.events) {
      const id = Tone.getTransport().schedule((time) => {
        const freq = midiNoteToFrequency(event.midiNote);
        this.synth?.triggerAttackRelease(freq, event.duration, time);
      }, event.time);
      this.scheduledIds.push(id);
    }

    // Schedule auto-stop at end
    Tone.getTransport().schedule(() => {
      this.stop();
    }, this.totalDuration + 0.1);
  }

  private startPositionTracking(): void {
    this.stopPositionTracking();
    this.positionInterval = setInterval(() => {
      const currentTime = Tone.getTransport().seconds;

      // Find ALL currently sounding notes (started and not yet ended)
      const activeNotes: { measureIndex: number; elementIndex: number }[] = [];
      for (const ev of this.events) {
        if (ev.time <= currentTime && ev.time + ev.duration > currentTime) {
          activeNotes.push({
            measureIndex: ev.measureIndex,
            elementIndex: ev.elementIndex,
          });
        }
      }

      if (activeNotes.length > 0) {
        this.notifyPosition({ activeNotes, timeSeconds: currentTime });
      }
    }, 50); // 20 fps position updates
  }

  private stopPositionTracking(): void {
    if (this.positionInterval) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
  }

  private notifyPosition(pos: PlaybackPosition): void {
    for (const cb of this.positionCallbacks) cb(pos);
  }

  private notifyState(): void {
    for (const cb of this.stateCallbacks) cb(this.state);
  }
}
