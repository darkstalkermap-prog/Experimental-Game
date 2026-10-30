# Castle Wars for the desktop

The same game as the web page, in a window of its own (Electron). Nothing to install: unzip and run.

- **Windows**: unzip, open the folder, run `Castle Wars.exe`. Windows SmartScreen may warn about an unknown publisher (the app is not
  code-signed): press *More info*, then *Run anyway*.
- **macOS**: unzip (Apple silicon or Intel build), drag *Castle Wars* to Applications. The first time, right-click it and choose *Open*
  (it is not signed with an Apple developer ID). If macOS says the app "is damaged", run `xattr -cr "/Applications/Castle Wars.app"` once.
- **Linux**: unzip and run `./castle-wars`.

**Why it runs smoother than a browser tab:** it asks for the fast graphics chip on laptops that have two, it ignores the GPU
blocklist (an old driver on the list would mean software drawing), and the game keeps full speed when the window is behind another
one (the host of an online game simulates for everyone). F11 or Alt+Enter toggles full screen; Ctrl+Shift+I opens the developer tools.

**Online play** works as on the website, browser to browser through PeerJS (needs the internet): desktop and web players can join each
other's games with the code. The invite link points at the website, so friends without the app can join from their browser.
Settings, Renown and records are kept between launches.

**How it works:** `main.cjs` serves the game files that ship inside the app at `https://castle-wars.desktop/`, an address answered by
the app itself and never looked up on the network (one fixed origin keeps the browser storage; an https page lets PeerJS work).
Everything else goes to the real network. `preload.cjs` tells the page it runs in the app (`window.cwDesktop`).

**Building:** `npm install`, then `npm start` (run it from the source) or `npm run build` (every platform into `dist/`;
`node build.cjs win32` for one). `build.cjs` copies `index.html`, `src/` and `vendor/` from the game into the app.
