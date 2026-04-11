import { describe, it, expect } from 'vitest';
import {
  IPC_CHANNELS,
  FILE_CHANNELS,
  OMR_CHANNELS,
  AMT_CHANNELS,
  YOUTUBE_CHANNELS,
  EDIT_CHANNELS,
  TRANSPOSE_CHANNELS,
  PLAYBACK_CHANNELS,
  REVIEW_CHANNELS,
  ALL_IPC_CHANNELS,
} from './channels';

describe('IPC Channels', () => {
  it('should define all 8 channel categories', () => {
    expect(IPC_CHANNELS.FILE).toBeDefined();
    expect(IPC_CHANNELS.OMR).toBeDefined();
    expect(IPC_CHANNELS.AMT).toBeDefined();
    expect(IPC_CHANNELS.YOUTUBE).toBeDefined();
    expect(IPC_CHANNELS.EDIT).toBeDefined();
    expect(IPC_CHANNELS.TRANSPOSE).toBeDefined();
    expect(IPC_CHANNELS.PLAYBACK).toBeDefined();
    expect(IPC_CHANNELS.REVIEW).toBeDefined();
  });

  it('should have correct file channel names', () => {
    expect(FILE_CHANNELS.OPEN).toBe('file:open');
    expect(FILE_CHANNELS.SAVE).toBe('file:save');
    expect(FILE_CHANNELS.EXPORT).toBe('file:export');
  });

  it('should have correct OMR channel names', () => {
    expect(OMR_CHANNELS.RECOGNIZE).toBe('omr:recognize');
    expect(OMR_CHANNELS.PROGRESS).toBe('omr:progress');
  });

  it('should have correct AMT channel names', () => {
    expect(AMT_CHANNELS.TRANSCRIBE).toBe('amt:transcribe');
    expect(AMT_CHANNELS.PROGRESS).toBe('amt:progress');
  });

  it('should have correct YouTube channel names', () => {
    expect(YOUTUBE_CHANNELS.FETCH).toBe('youtube:fetch');
    expect(YOUTUBE_CHANNELS.PROGRESS).toBe('youtube:progress');
  });

  it('should have correct edit channel names', () => {
    expect(EDIT_CHANNELS.EXECUTE_COMMAND).toBe('edit:executeCommand');
    expect(EDIT_CHANNELS.UNDO).toBe('edit:undo');
    expect(EDIT_CHANNELS.REDO).toBe('edit:redo');
  });

  it('should have correct transpose channel name', () => {
    expect(TRANSPOSE_CHANNELS.TRANSPOSE).toBe('transpose:transpose');
  });

  it('should have correct playback channel names', () => {
    expect(PLAYBACK_CHANNELS.PLAY).toBe('playback:play');
    expect(PLAYBACK_CHANNELS.PAUSE).toBe('playback:pause');
    expect(PLAYBACK_CHANNELS.STOP).toBe('playback:stop');
    expect(PLAYBACK_CHANNELS.SET_TEMPO).toBe('playback:setTempo');
  });

  it('should have correct review channel names', () => {
    expect(REVIEW_CHANNELS.GET_ITEMS).toBe('review:getItems');
    expect(REVIEW_CHANNELS.ACCEPT).toBe('review:accept');
    expect(REVIEW_CHANNELS.REJECT).toBe('review:reject');
    expect(REVIEW_CHANNELS.SKIP).toBe('review:skip');
  });

  it('should include all channels in ALL_IPC_CHANNELS', () => {
    const allValues = [
      ...Object.values(FILE_CHANNELS),
      ...Object.values(OMR_CHANNELS),
      ...Object.values(AMT_CHANNELS),
      ...Object.values(YOUTUBE_CHANNELS),
      ...Object.values(EDIT_CHANNELS),
      ...Object.values(TRANSPOSE_CHANNELS),
      ...Object.values(PLAYBACK_CHANNELS),
      ...Object.values(REVIEW_CHANNELS),
    ];
    expect(ALL_IPC_CHANNELS).toHaveLength(allValues.length);
    for (const ch of allValues) {
      expect(ALL_IPC_CHANNELS).toContain(ch);
    }
  });

  it('should have no duplicate channel names', () => {
    const unique = new Set(ALL_IPC_CHANNELS);
    expect(unique.size).toBe(ALL_IPC_CHANNELS.length);
  });

  it('should follow category:action naming convention', () => {
    for (const ch of ALL_IPC_CHANNELS) {
      expect(ch).toMatch(/^[a-z]+:[a-zA-Z]+$/);
    }
  });
});
