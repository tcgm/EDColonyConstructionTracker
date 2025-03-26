/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, Tray, Menu, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
const fs = require('fs');
const Tesseract = require('tesseract.js');
const os = require('os');

/* Electron DevTools autofill spam patch */
// process.stderr.write = ((write) => {
//   return (msg: any, ...args: any[]) => {
//     if (msg.includes('Autofill')) return false;
//     return write.call(process.stderr, msg, ...args);
//   };
// })(process.stderr.write);


class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let tray = null;
let splash: BrowserWindow | null = null;

// Detect development mode
const isDev = !app.isPackaged;


let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  
  // 1️⃣ Create splash screen
  splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: false,
    transparent: false,
    resizable: false,
    show: true
  });
  
  const splashPath = isDev
  ? path.join(__dirname, '../../src/static/splash.html')
  : path.join(process.resourcesPath, 'static/splash.html');

  splash.loadFile(splashPath);
  
  splash.moveTop();

  setTimeout(() => {
    if (splash && !splash.isDestroyed()) {
      try {
        splash.close();
      } catch (e) {
        console.warn('Splash already closed:', e);
      }
    }

    splash = null;
  
    if (mainWindow && !mainWindow.isVisible()) {
      if (mainWindow) {
        mainWindow.show();
      }
    }
  }, 10000);
  

  // 2️⃣ Create main window
  mainWindow = new BrowserWindow({
    show: false,
    width: 600,
    height: 750,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
      splash?.close();
    } else {
      mainWindow.show();
      splash?.close();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();

  // File Drop Hack
// console.log('[main] Setting up will-navigate handler');
//  // 🛑 Intercept file:// drag-and-drop navigation
//  mainWindow.webContents.on('will-navigate', (event, url) => {
//   console.log('[main] will-navigate triggered with URL:', url);
//   event.preventDefault();

//   const decodedPath = decodeURIComponent(new URL(url).pathname);
//   const actualPath =
//     process.platform === 'win32' && decodedPath.startsWith('/')
//       ? decodedPath.slice(1)
//       : decodedPath;

//   console.log('[main] File dropped:', actualPath);

//   if (/\.(png|jpg|jpeg|bmp|gif)$/i.test(actualPath)) {
//     mainWindow?.webContents.send('files-dropped', [actualPath]);
//   }
// });


// // ✅ Stop new-window behavior too (e.g., Mac or middle-click drag)
// mainWindow.webContents.setWindowOpenHandler(() => {
//   return { action: 'deny' };
// });

// // ✅ Optionally block all external URLs from opening
// // mainWindow.webContents.on('new-window', (e) => {
// //   e.preventDefault();
// // });

// app.on('open-file', (event, path) => {
//   event.preventDefault();
//   mainWindow?.webContents.send('files-dropped', [path]);
// });

  
  // 3️⃣ Tray icon & menu
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow && mainWindow.show() },
        { label: 'Quit', click: () => app.quit() }
      ]);
      tray.setToolTip('ED Colony Construction Tracker');
      tray.setContextMenu(contextMenu);
      tray.on('click', () => {
        if (mainWindow) {
          mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
      });
    } else {
      console.warn('Tray icon not found, skipping tray setup.');
    }
  } catch (err) {
    console.error('Tray setup failed:', err);
  }
}
  

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    await createWindow();

    watchEliteDangerousLogs();

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

  function watchEliteDangerousLogs() {
    const journalDir = path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
    if (!fs.existsSync(journalDir)) return;

    let debounceTimeout: NodeJS.Timeout | null = null;

    fs.watch(journalDir, (eventType: any, filename: string) => {
      if (filename?.startsWith('Journal') && filename.endsWith('.log')) {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
        debounceTimeout = setTimeout(() => {
          if (mainWindow) {
            mainWindow.webContents.send('journal-updated');
          }
        }, 5000); // Adjust debounce delay as needed
      }
    });
  }
  

  // 5️⃣ IPC handlers
  ipcMain.handle('parse-images', async (e, filePaths) => {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return { error: 'No file paths provided or invalid input.' };
    }
  
    let lines = [];
    try {
      for (const file of filePaths) {
        if (!fs.existsSync(file)) {
          console.warn(`File not found: ${file}`);
          continue;
        }
  
        const result = await Tesseract.recognize(file, 'eng').catch((err: any) => {
          console.error(`Error processing file ${file}:`, err);
          return null;
        });
  
        if (result && result.data && result.data.text) {
          const rawLines = result.data.text
            .split('\n')
            .map((line: string) => line.trim())
            .filter(Boolean);
          lines.push(...rawLines);
        } else {
          console.warn(`No text recognized in file: ${file}`);
        }
      }
    } catch (err) {
      console.error('Unexpected error during image parsing:', err);
      return { error: 'An unexpected error occurred during image parsing.' };
    }
  
    return lines.length > 0 ? lines : { error: 'No text could be extracted from the provided images.' };
  });

  /* ipcMain.on('files-dropped', (event, filePaths: string[]) => {
    console.log('[main] Received file paths:', filePaths);
    mainWindow?.webContents.send('files-dropped', filePaths);
  }); */
  
  
  
  
 /*  ipcMain.handle('load-logs', async () => {
    const journalDir = path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
    let deliveries: { [key: string]: number } = {};
    if (!fs.existsSync(journalDir)) return deliveries;
  
    const files = fs.readdirSync(journalDir).filter((f: string) => f.startsWith('Journal') && f.endsWith('.log'));
    for (const file of files) {
      const lines = fs.readFileSync(path.join(journalDir, file), 'utf-8').split('\n');
      for (const line of lines) {
        if (line.includes('"event":"MarketSell"')) {
          try {
            const entry = JSON.parse(line);
            const name = entry.Type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
            deliveries[name] = (deliveries[name] || 0) + entry.Count;
          } catch { continue; }
        }
      }
    }
    return deliveries;
  }); */

  interface DeliveryEvent {
    commodity: string;
    count: number;
    timestamp: number;
  }
  
  // Use the promise-based FS API.
  const fsp = fs.promises;
  
  // In‑memory cache for log events.
  let logCache: {
    events: DeliveryEvent[];
    fileTimestamps: { [filename: string]: number };
  } | null = null;
  
  ipcMain.handle('load-logs', async () => {
    const journalDir = path.join(
      os.homedir(),
      'Saved Games',
      'Frontier Developments',
      'Elite Dangerous'
    );
    let events: DeliveryEvent[] = [];
    if (!fs.existsSync(journalDir)) return events;
  
    // Get list of log files asynchronously.
    let files = (await fsp.readdir(journalDir))
      .filter((f: string) => f.startsWith('Journal') && f.endsWith('.log'));
    const fiveWeeksAgo = Date.now() - 5 * 7 * 24 * 60 * 60 * 1000; // 5 weeks in milliseconds
    const recentFiles = [];
    for (const file of files) {
      const filePath = path.join(journalDir, file);
      const stats = await fsp.stat(filePath);
      if (stats.mtimeMs >= fiveWeeksAgo) {
      recentFiles.push(file);
      }
    }
    files = recentFiles;
    let needReload = false;
    const currentTimestamps: { [filename: string]: number } = {};
  
    // Check each file's modification time asynchronously.
    for (const file of recentFiles) {
      const filePath = path.join(journalDir, file);
      const stats = await fsp.stat(filePath);
      currentTimestamps[file] = stats.mtimeMs;
      if (
        !logCache ||
        !logCache.fileTimestamps[file] ||
        logCache.fileTimestamps[file] !== stats.mtimeMs
      ) {
        needReload = true;
      }
    }
  
    // If nothing changed, return cached events.
    if (!needReload && logCache) {
      return logCache.events;
    }
  
    // Otherwise, re-read and process the log files one at a time.
    for (const file of recentFiles) {
      const filePath = path.join(journalDir, file);
      const data = await fsp.readFile(filePath, 'utf8');
      const lines = data.split('\n');
      for (const line of lines) {
        if (line.includes('"event":"MarketSell"') && line.includes('"System Colonisation"')) {
          try {
            console.log(`Processing MarketSell line: ${line}`);
            const entry = JSON.parse(line);
            // Assume each journal entry has a "timestamp" property.
            const timestamp = new Date(entry.timestamp).getTime();
            // Format the commodity name.
            const commodity = entry.Type
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (l: string) => l.toUpperCase());
            events.push({ commodity, count: entry.Count, timestamp });
          } catch {
            continue;
          }
        }
      }
      // Yield control to avoid hogging the event loop.
      await new Promise(resolve => setImmediate(resolve));
    }
  
    // Update the cache.
    logCache = {
      events,
      fileTimestamps: currentTimestamps,
    };
  
    return events;
  });
  
  ipcMain.handle('export-csv', async (e, rows) => {
    const { canceled, filePath } = await dialog.showSaveDialog({ 
      defaultPath: 'export.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (canceled || !filePath) return null;
  
    const csv = ['Commodity,Delivered,Required,Remaining', ...rows.map((r: any[]) => r.join(','))].join('\n');
    fs.writeFileSync(filePath, csv, 'utf-8');
    return filePath;
  });

  