import { describe, it, expect, vi } from 'vitest';
import { ScoreController } from './ScoreController';
import type { EditCommand } from './EditCommand';
import type { ScoreData } from '../types';

// ─── 테스트용 MusicXML ───

const SIMPLE_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.com/dtds/partwise.dtd">
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
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

// ─── 테스트용 EditCommand 팩토리 ───

function createTestCommand(description: string, transform: (sd: ScoreData) => ScoreData, revert: (sd: ScoreData) => ScoreData): EditCommand {
  return {
    type: 'test',
    description,
    execute: transform,
    undo: revert,
  };
}

describe('ScoreController', () => {
  // ─── 초기 상태 ───

  describe('initial state', () => {
    it('should have null document on creation', () => {
      const ctrl = new ScoreController();
      expect(ctrl.getDocument()).toBeNull();
      expect(ctrl.getScoreData()).toBeNull();
    });

    it('should not be able to undo or redo initially', () => {
      const ctrl = new ScoreController();
      expect(ctrl.canUndo()).toBe(false);
      expect(ctrl.canRedo()).toBe(false);
    });

    it('should have empty undo/redo stacks', () => {
      const ctrl = new ScoreController();
      expect(ctrl.getUndoStack()).toEqual([]);
      expect(ctrl.getRedoStack()).toEqual([]);
    });
  });

  // ─── 파일 열기 ───

  describe('openFile', () => {
    it('should parse MusicXML and create a document', () => {
      const ctrl = new ScoreController();
      const doc = ctrl.openFile(SIMPLE_MUSICXML);

      expect(doc).toBeDefined();
      expect(doc.scoreData.parts).toHaveLength(1);
      expect(doc.scoreData.parts[0].name).toBe('Piano');
      expect(doc.metadata.sourceType).toBe('musicxml');
    });

    it('should set the document as current', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      expect(ctrl.getDocument()).not.toBeNull();
      expect(ctrl.getScoreData()).not.toBeNull();
      expect(ctrl.getScoreData()!.parts).toHaveLength(1);
    });

    it('should clear undo/redo stacks on open', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      // Execute a command to populate undo stack
      const cmd = createTestCommand('test', (sd) => sd, (sd) => sd);
      ctrl.executeCommand(cmd);
      expect(ctrl.canUndo()).toBe(true);

      // Re-open should clear stacks
      ctrl.openFile(SIMPLE_MUSICXML);
      expect(ctrl.canUndo()).toBe(false);
      expect(ctrl.canRedo()).toBe(false);
    });

    it('should fire onChange when opening a file', () => {
      const ctrl = new ScoreController();
      const callback = vi.fn();
      ctrl.onChange(callback);

      ctrl.openFile(SIMPLE_MUSICXML);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ parts: expect.any(Array) }));
    });
  });

  // ─── 파일 저장 ───

  describe('saveFile', () => {
    it('should serialize current document to MusicXML string', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const xml = ctrl.saveFile();
      expect(xml).toContain('<score-partwise');
      expect(xml).toContain('Piano');
    });

    it('should throw if no document is open', () => {
      const ctrl = new ScoreController();
      expect(() => ctrl.saveFile()).toThrow('No document is open.');
    });
  });

  // ─── 편집 명령 및 Undo/Redo ───

  describe('executeCommand / undo / redo', () => {
    it('should execute a command and update scoreData', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const originalParts = ctrl.getScoreData()!.parts;
      const cmd = createTestCommand(
        'clear parts',
        (sd) => ({ ...sd, parts: [] }),
        (sd) => ({ ...sd, parts: originalParts }),
      );

      ctrl.executeCommand(cmd);
      expect(ctrl.getScoreData()!.parts).toHaveLength(0);
      expect(ctrl.canUndo()).toBe(true);
      expect(ctrl.canRedo()).toBe(false);
    });

    it('should undo a command', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const originalParts = ctrl.getScoreData()!.parts;
      const cmd = createTestCommand(
        'clear parts',
        (sd) => ({ ...sd, parts: [] }),
        (sd) => ({ ...sd, parts: originalParts }),
      );

      ctrl.executeCommand(cmd);
      expect(ctrl.getScoreData()!.parts).toHaveLength(0);

      ctrl.undo();
      expect(ctrl.getScoreData()!.parts).toHaveLength(1);
      expect(ctrl.canUndo()).toBe(false);
      expect(ctrl.canRedo()).toBe(true);
    });

    it('should redo a command', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const originalParts = ctrl.getScoreData()!.parts;
      const cmd = createTestCommand(
        'clear parts',
        (sd) => ({ ...sd, parts: [] }),
        (sd) => ({ ...sd, parts: originalParts }),
      );

      ctrl.executeCommand(cmd);
      ctrl.undo();
      ctrl.redo();

      expect(ctrl.getScoreData()!.parts).toHaveLength(0);
      expect(ctrl.canUndo()).toBe(true);
      expect(ctrl.canRedo()).toBe(false);
    });

    it('should clear redo stack when a new command is executed', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const originalParts = ctrl.getScoreData()!.parts;
      const cmd1 = createTestCommand(
        'clear parts',
        (sd) => ({ ...sd, parts: [] }),
        (sd) => ({ ...sd, parts: originalParts }),
      );
      const cmd2 = createTestCommand(
        'noop',
        (sd) => sd,
        (sd) => sd,
      );

      ctrl.executeCommand(cmd1);
      ctrl.undo();
      expect(ctrl.canRedo()).toBe(true);

      ctrl.executeCommand(cmd2);
      expect(ctrl.canRedo()).toBe(false);
    });

    it('should handle multiple undo/redo operations', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const originalParts = ctrl.getScoreData()!.parts;
      const cmd1 = createTestCommand(
        'clear parts',
        (sd) => ({ ...sd, parts: [] }),
        (sd) => ({ ...sd, parts: originalParts }),
      );
      const cmd2 = createTestCommand(
        'add credit',
        (sd) => ({ ...sd, credits: [{ type: 'title' as const, text: 'Test' }] }),
        (sd) => ({ ...sd, credits: undefined }),
      );

      ctrl.executeCommand(cmd1);
      ctrl.executeCommand(cmd2);

      expect(ctrl.getUndoStack()).toHaveLength(2);

      ctrl.undo();
      expect(ctrl.getScoreData()!.credits).toBeUndefined();

      ctrl.undo();
      expect(ctrl.getScoreData()!.parts).toHaveLength(1);

      expect(ctrl.getRedoStack()).toHaveLength(2);
    });

    it('should throw when executing command with no document', () => {
      const ctrl = new ScoreController();
      const cmd = createTestCommand('noop', (sd) => sd, (sd) => sd);
      expect(() => ctrl.executeCommand(cmd)).toThrow('No document is open.');
    });

    it('should be a no-op when undo/redo with no document', () => {
      const ctrl = new ScoreController();
      // Should not throw
      ctrl.undo();
      ctrl.redo();
    });
  });

  // ─── onChange 콜백 ───

  describe('onChange', () => {
    it('should fire on executeCommand', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const callback = vi.fn();
      ctrl.onChange(callback);

      const cmd = createTestCommand('noop', (sd) => sd, (sd) => sd);
      ctrl.executeCommand(cmd);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should fire on undo', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const cmd = createTestCommand('noop', (sd) => sd, (sd) => sd);
      ctrl.executeCommand(cmd);

      const callback = vi.fn();
      ctrl.onChange(callback);

      ctrl.undo();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should fire on redo', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const cmd = createTestCommand('noop', (sd) => sd, (sd) => sd);
      ctrl.executeCommand(cmd);
      ctrl.undo();

      const callback = vi.fn();
      ctrl.onChange(callback);

      ctrl.redo();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should support unsubscribe', () => {
      const ctrl = new ScoreController();
      ctrl.openFile(SIMPLE_MUSICXML);

      const callback = vi.fn();
      const unsubscribe = ctrl.onChange(callback);

      const cmd = createTestCommand('noop', (sd) => sd, (sd) => sd);
      ctrl.executeCommand(cmd);
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      ctrl.executeCommand(cmd);
      expect(callback).toHaveBeenCalledTimes(1); // not called again
    });
  });

  // ─── Placeholder 메서드 ───

  describe('placeholder methods', () => {
    it('should throw for exportPdf', async () => {
      const ctrl = new ScoreController();
      await expect(ctrl.exportPdf('/tmp/test.pdf')).rejects.toThrow('not implemented');
    });

    it('should throw for exportPng', async () => {
      const ctrl = new ScoreController();
      await expect(ctrl.exportPng('/tmp/test.png')).rejects.toThrow('not implemented');
    });

    it('should throw for importImage', async () => {
      const ctrl = new ScoreController();
      await expect(ctrl.importImage('/tmp/test.png')).rejects.toThrow('not implemented');
    });

    it('should throw for importPdf', async () => {
      const ctrl = new ScoreController();
      await expect(ctrl.importPdf('/tmp/test.pdf')).rejects.toThrow('not implemented');
    });

    it('should throw for importYouTube', async () => {
      const ctrl = new ScoreController();
      await expect(ctrl.importYouTube('https://youtube.com/watch?v=test')).rejects.toThrow('not implemented');
    });

    it('should throw for importLocalAudio', async () => {
      const ctrl = new ScoreController();
      await expect(ctrl.importLocalAudio('/tmp/test.wav')).rejects.toThrow('not implemented');
    });

    it('should throw for play', () => {
      const ctrl = new ScoreController();
      expect(() => ctrl.play()).toThrow('not implemented');
    });

    it('should throw for pause', () => {
      const ctrl = new ScoreController();
      expect(() => ctrl.pause()).toThrow('not implemented');
    });

    it('should throw for stop', () => {
      const ctrl = new ScoreController();
      expect(() => ctrl.stop()).toThrow('not implemented');
    });

    it('should throw for setTempo', () => {
      const ctrl = new ScoreController();
      expect(() => ctrl.setTempo(120)).toThrow('not implemented');
    });
  });
});
