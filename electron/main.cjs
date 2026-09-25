/**
 * Electron shell: turns the built shipyard into a real desktop window.
 *
 * The app itself is a static bundle in `out/`, so the main process simply serves
 * that folder on a loopback port and points a window at it. Serving over http
 * (instead of loading `file://`) is what keeps Next's absolute asset paths,
 * client-side routing and localStorage working exactly as they do in a browser.
 *
 *   npm run app          - run the desktop app (needs a build: npm run build:static)
 *   npm run app:build    - package a Windows installer into release/
 */
const { app, BrowserWindow, shell, Menu } = require("electron");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const OUT = join(ROOT, "out");

async function startServer() {
  // scripts/static-server.mjs is ESM, so it is imported dynamically from CJS
  const { startStaticServer } = await import(
    `file://${join(ROOT, "scripts", "static-server.mjs").replace(/\\/g, "/")}`
  );
  return startStaticServer(OUT, { port: 0, host: "127.0.0.1" });
}

async function createWindow() {
  if (!existsSync(OUT)) {
    const { dialog } = require("electron");
    dialog.showErrorBox(
      "No build found",
      "Build the app first:\n\n  npm install\n  npm run build:static\n\nThen start it again.",
    );
    app.quit();
    return;
  }

  const { port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#05070d",
    title: "NMS Corvette Shipyard",
    autoHideMenuBar: true,
    webPreferences: {
      // the bundle is fully self-contained: no node access needed in the window
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // external links (source credits) open in the real browser, not in the app
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("http")) shell.openExternal(target);
    return { action: "deny" };
  });

  await win.loadURL(url);
}

Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    {
      label: "Shipyard",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ]),
);

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
