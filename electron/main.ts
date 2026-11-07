import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session, shell } from 'electron';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const MAX_FILE = 512 * 1024 * 1024;
const SAVE_TYPES: Record<string, string> = { pptx: 'Presentation', ppsx: 'Slide show', potx: 'Template', pdf: 'PDF', png: 'PNG image', jpg: 'JPEG image', svg: 'SVG image', odp: 'OpenDocument presentation', mp4: 'Video', webm: 'Video', html: 'Web page', rtf: 'Outline', txt: 'Text', zip: 'Images' };
const OPEN_FILTERS = [{ name: 'Presentations', extensions: ['pptx', 'pptm', 'ppsx', 'potx', 'odp'] }];
const OPENABLE = new Set(OPEN_FILTERS[0]!.extensions.map((e) => `.${e}`));
// Only paths the person picked in a dialog, or opened from the system, can be written.
const allowed = new Set<string>();
const launch = new Map<number, string>();
const queued: string[] = [];

const decksIn = (argv: string[], cwd = process.cwd()): string[] =>
  argv.filter((a) => !a.startsWith('-')).map((a) => resolve(cwd, a)).filter((p) => OPENABLE.has(extname(p).toLowerCase()) && existsSync(p) && statSync(p).isFile());

const readChecked = async (path: string) => {
  if ((await stat(path)).size > MAX_FILE) throw new Error('This file is too large to open.');
  allowed.add(path);
  return { path, name: basename(path), data: new Uint8Array(await readFile(path)) };
};

const createWindow = (file?: string): void => {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    title: 'ClerdoFrame',
    backgroundColor: '#f4efed',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // The slide show's audience window: a blank same-origin window the page renders into.
    if (frameName === 'clerdoframe-audience' && (url === '' || url === 'about:blank')) {
      const here = screen.getDisplayMatching(win.getBounds());
      const other = screen.getAllDisplays().find((d) => d.id !== here.id) ?? here;
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          fullscreen: true, autoHideMenuBar: true, backgroundColor: '#000000', title: 'ClerdoFrame slide show',
          x: other.bounds.x, y: other.bounds.y, width: other.bounds.width, height: other.bounds.height,
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
        },
      };
    }
    if (/^https?:|^mailto:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    child.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:|^mailto:/i.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
    child.webContents.on('will-navigate', (e) => e.preventDefault());
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Keep editing', 'Close without saving'], defaultId: 0, cancelId: 0,
      message: 'This presentation has unsaved changes.',
    });
    if (choice === 1) e.preventDefault();
  });
  if (file) launch.set(win.webContents.id, file);
  void win.loadFile(join(__dirname, '..', 'dist', 'index.html'));
};

const openDecks = (paths: string[]): void => {
  for (const p of paths) createWindow(p);
  BrowserWindow.getAllWindows().at(-1)?.focus();
};

ipcMain.handle('file:launch', async (e) => {
  const path = launch.get(e.sender.id);
  launch.delete(e.sender.id);
  return path ? readChecked(path) : null;
});

ipcMain.handle('file:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const r = win ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: OPEN_FILTERS }) : await dialog.showOpenDialog({ properties: ['openFile'], filters: OPEN_FILTERS });
  const path = r.filePaths[0];
  if (r.canceled || !path) return null;
  return readChecked(path);
});

ipcMain.handle('file:save', async (e, path: unknown, name: unknown, data: unknown, ext: unknown) => {
  if (!(data instanceof Uint8Array)) throw new Error('Nothing to save.');
  const x = typeof ext === 'string' && SAVE_TYPES[ext] ? ext : 'pptx';
  const re = new RegExp(`\\.${x}$`, 'i');
  let target = typeof path === 'string' && allowed.has(path) && re.test(path) ? path : null;
  if (!target) {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const opts = { defaultPath: typeof name === 'string' ? basename(name) : `Presentation1.${x}`, filters: [{ name: SAVE_TYPES[x]!, extensions: [x] }] };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    target = re.test(r.filePath) ? r.filePath : `${r.filePath}.${x}`;
    allowed.add(target);
  }
  await writeFile(target, data);
  return { path: target, name: basename(target) };
});

// Presenting: full screen on the current display; the presenter view opens in its own window.
ipcMain.on('window:present', (e, on: unknown) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(on === true);
});

ipcMain.on('window:new', () => createWindow());

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv, cwd) => {
  const files = decksIn(argv.slice(1), cwd);
  if (files.length) openDecks(files);
  else BrowserWindow.getAllWindows()[0]?.focus();
});
app.on('open-file', (e, path) => {
  e.preventDefault();
  if (app.isReady()) openDecks([path]); else queued.push(path);
});

void app.whenReady().then(() => {
  // The page never needs the camera, location or other permissions.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write' || permission === 'clipboard-read' || permission === 'fullscreen' || permission === 'media'));
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: 'File', submenu: [{ label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() }, { role: 'close' }] },
      { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
  } else Menu.setApplicationMenu(null);
  const files = [...queued, ...decksIn(process.argv.slice(app.isPackaged ? 1 : 2))];
  if (files.length) openDecks(files); else createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
