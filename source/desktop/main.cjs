// FABLE desktop shell. Loads the single-file game build (app/index.html) in a fullscreen Chromium window.
// No remote content, no node integration in the page, context isolation and the sandbox on.
const { app, BrowserWindow, shell, Menu, globalShortcut } = require('electron');
const path = require('node:path');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 720, minWidth: 800, minHeight: 500, show: false,
    fullscreen: !process.argv.includes('--windowed'),
    autoHideMenuBar: true, backgroundColor: '#1a1410', title: 'FABLE',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // External links (none exist in the game today) open in the system browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) e.preventDefault(); });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  createWindow();
  // F11 toggles the native window state; the page's own Fullscreen API also works inside Electron.
  globalShortcut.register('F11', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
