// Castle Wars on the desktop: the web game in a window of its own, with nothing of a browser around it.
// The game files ship inside the app and are served at https://castle-wars.desktop/ (a made-up address answered here, never on the
// network): one fixed origin keeps the settings, Renown and records between launches, and an https page lets online play go browser
// to browser through PeerJS exactly as on the website, so desktop and web players can join each other's games with a code.
const { app, BrowserWindow, protocol, session, shell, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const HOST = 'castle-wars.desktop';
const ROOT = path.join(__dirname, 'game');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

// Smooth play: the fast graphics chip on laptops that have two, no GPU blocklist (an old driver on the list would mean software
// drawing), and no slowing down of the page when the window is behind another one (the host of an online game simulates for everyone).
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

function serveGame(ses) {
  ses.protocol.handle('https', (req) => {
    const url = new URL(req.url);
    if (url.hostname !== HOST) return net.fetch(req, { bypassCustomProtocolHandlers: true });   // (PeerJS and the like: the real network)
    // no game server here: the game sees no relay and uses PeerJS, as on the website
    if (url.pathname === '/api/ping') return new Response('no relay', { status: 404 });
    let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    if (url.pathname === '/') file = path.join(ROOT, 'index.html');
    if (path.relative(ROOT, file).startsWith('..')) return new Response('', { status: 403 });
    try {
      const data = fs.readFileSync(file);
      return new Response(data, { headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' } });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow() {
  const ses = session.fromPartition('persist:castlewars');
  serveGame(ses);
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#0b0b0b', title: 'Castle Wars', show: false, autoHideMenuBar: true,
    webPreferences: { session: ses, preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false, contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // F11 or Alt+Enter: full screen. Ctrl+Shift+I: the developer tools (for bug reports).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools();
  });
  // links out of the game (the website, an invite) open in the browser, never in the game's window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (new URL(url).hostname !== HOST) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL(`https://${HOST}/`);
}

Menu.setApplicationMenu(null);
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
