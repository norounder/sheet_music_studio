import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerFileHandlers } from './ipc/fileHandlers';
import { registerOMRHandlers } from './ipc/omrHandlers';
import { ModelManager } from './omr/modelManager';
import { loadOMRConfig, resolveProvider } from './omr/omrConfig';

let mainWindow: BrowserWindow | null = null;
let modelManager: ModelManager | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Sheet Music Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Load OMR config and initialize ONNX model manager
  const omrConfig = loadOMRConfig();
  modelManager = new ModelManager({
    preferredProvider: resolveProvider(omrConfig.inference.provider),
  });

  registerFileHandlers();
  registerOMRHandlers(modelManager);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on quit: temp dirs + ONNX sessions
app.on('will-quit', async () => {
  // Dispose ONNX model sessions
  if (modelManager) {
    await modelManager.dispose().catch(() => {});
    modelManager = null;
  }

  // Cleanup orphaned OMR temp directories
  try {
    const tmpBase = os.tmpdir();
    const entries = await fs.promises.readdir(tmpBase);
    for (const entry of entries) {
      if (entry.startsWith('sms-omr-')) {
        await fs.promises.rm(path.join(tmpBase, entry), { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {
    // Best-effort cleanup
  }
});
