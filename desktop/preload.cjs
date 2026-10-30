// What the game may know about the desktop app: that it runs in one, and the website where an invite link should point
// (friends without the app open the game there; the code works in both).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('cwDesktop', { site: 'https://darkstalkermap-prog.github.io/experimental-game/' });
