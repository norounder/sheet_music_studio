/**
 * ScoreController 구현
 * UI 이벤트 → 비즈니스 로직 위임의 단일 진입점.
 * MusicXMLParser/Serializer를 사용한 파일 입출력과
 * 기본 Undo/Redo 스택을 제공한다.
 */

import type { ScoreDocument, ScoreData, ScoreMetadata } from '../types';
import type { IScoreController } from './IScoreController';
import type { EditCommand } from './EditCommand';
import { MusicXMLParser, MusicXMLSerializer } from '../serializer';

export class ScoreController implements IScoreController {
  private document: ScoreDocument | null = null;
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private listeners: Set<(scoreData: ScoreData) => void> = new Set();

  private parser: MusicXMLParser;
  private serializer: MusicXMLSerializer;

  constructor() {
    this.parser = new MusicXMLParser();
    this.serializer = new MusicXMLSerializer();
  }

  // ─── 파일 입출력 ───

  openFile(xmlContent: string): ScoreDocument {
    const scoreData = this.parser.fromMusicXML(xmlContent);
    const now = new Date().toISOString();
    const metadata: ScoreMetadata = {
      title: scoreData.credits?.find((c) => c.type === 'title')?.text ?? '',
      composer: scoreData.credits?.find((c) => c.type === 'composer')?.text ?? '',
      createdAt: now,
      modifiedAt: now,
      sourceType: 'musicxml',
    };

    this.document = { metadata, scoreData };
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
    return this.document;
  }

  saveFile(): string {
    if (!this.document) {
      throw new Error('No document is open.');
    }
    return this.serializer.toMusicXML(this.document.scoreData);
  }

  async exportPdf(_filePath: string): Promise<void> {
    throw new Error('exportPdf is not implemented yet.');
  }

  async exportPng(_filePath: string): Promise<void> {
    throw new Error('exportPng is not implemented yet.');
  }

  // ─── Import 연동 (OMR/AMT) ───

  async importImage(_filePath: string): Promise<ScoreDocument> {
    throw new Error('importImage is not implemented yet. OMR pipeline required.');
  }

  async importPdf(_filePath: string): Promise<ScoreDocument> {
    throw new Error('importPdf is not implemented yet. OMR pipeline required.');
  }

  async importYouTube(_url: string): Promise<ScoreDocument> {
    throw new Error('importYouTube is not implemented yet. AMT pipeline required.');
  }

  async importLocalAudio(_filePath: string): Promise<ScoreDocument> {
    throw new Error('importLocalAudio is not implemented yet. AMT pipeline required.');
  }

  // ─── 데이터 설정 ───

  setScoreData(scoreData: ScoreData): void {
    const now = new Date().toISOString();
    this.document = {
      metadata: {
        title: scoreData.credits?.find((c) => c.type === 'title')?.text ?? '',
        composer:
          scoreData.credits?.find((c) => c.type === 'composer')?.text ?? '',
        createdAt: now,
        modifiedAt: now,
        sourceType: 'musicxml',
      },
      scoreData,
    };
    this.undoStack = [];
    this.redoStack = [];
    this.notifyListeners();
  }

  // ─── 편집 위임 ───

  executeCommand(command: EditCommand): void {
    if (!this.document) {
      throw new Error('No document is open.');
    }
    this.document = {
      ...this.document,
      scoreData: command.execute(this.document.scoreData),
      metadata: {
        ...this.document.metadata,
        modifiedAt: new Date().toISOString(),
      },
    };
    this.undoStack.push(command);
    this.redoStack = [];
    this.notifyListeners();
  }

  undo(): void {
    if (!this.document || this.undoStack.length === 0) return;
    const command = this.undoStack.pop()!;
    this.document = {
      ...this.document,
      scoreData: command.undo(this.document.scoreData),
      metadata: {
        ...this.document.metadata,
        modifiedAt: new Date().toISOString(),
      },
    };
    this.redoStack.push(command);
    this.notifyListeners();
  }

  redo(): void {
    if (!this.document || this.redoStack.length === 0) return;
    const command = this.redoStack.pop()!;
    this.document = {
      ...this.document,
      scoreData: command.execute(this.document.scoreData),
      metadata: {
        ...this.document.metadata,
        modifiedAt: new Date().toISOString(),
      },
    };
    this.undoStack.push(command);
    this.notifyListeners();
  }

  // ─── 재생 (확장 시 구현) ───

  play(): void {
    throw new Error('play is not implemented yet. Playback engine required.');
  }

  pause(): void {
    throw new Error('pause is not implemented yet. Playback engine required.');
  }

  stop(): void {
    throw new Error('stop is not implemented yet. Playback engine required.');
  }

  setTempo(_bpm: number): void {
    throw new Error('setTempo is not implemented yet. Playback engine required.');
  }

  // ─── 상태 조회 ───

  getDocument(): ScoreDocument | null {
    return this.document;
  }

  getScoreData(): ScoreData | null {
    return this.document?.scoreData ?? null;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getUndoStack(): EditCommand[] {
    return [...this.undoStack];
  }

  getRedoStack(): EditCommand[] {
    return [...this.redoStack];
  }

  // ─── 이벤트 구독 ───

  onChange(callback: (scoreData: ScoreData) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  // ─── 내부 헬퍼 ───

  private notifyListeners(): void {
    if (!this.document) return;
    const scoreData = this.document.scoreData;
    for (const listener of this.listeners) {
      listener(scoreData);
    }
  }
}
