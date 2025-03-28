import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { app, BrowserWindow, ipcMain } from 'electron';

export interface DeliveryEvent {
  commodity: string;
  count: number;
  timestamp: number;
  inferred: boolean;
  stationName?: string;
}

interface CargoState {
  timestamp: number;
  inventory: Record<string, number>;
}

interface DockedEvent {
  timestamp: number;
  stationName: string;
  isColonisationShip: boolean;
}

const journalDir = path.join(os.homedir(), 'Saved Games', 'Frontier Developments', 'Elite Dangerous');
const deliveryFilePath = path.join(app.getPath('userData'), 'inferredDeliveries.json');

let bufferedDeliveries: DeliveryEvent[] = [];
let colonisationDockedAt: DockedEvent | null = null;
let cargoAtDockTime: CargoState | null = null;
let lastCargoState: CargoState | null = null;
let cargoWatcher: fs.FSWatcher | null = null;
let journalWatcher: fs.FSWatcher | null = null;

function parseCargoJson(retry = true): CargoState | null {
  const cargoPath = path.join(journalDir, 'Cargo.json');
  if (!fs.existsSync(cargoPath)) return null;

  try {
    const data = fs.readFileSync(cargoPath, 'utf8');
    const parsed = JSON.parse(data);
    const inventory: Record<string, number> = {};
    for (const item of parsed.Inventory || []) {
      inventory[item.Name] = item.Count;
    }
    return {
      timestamp: new Date(parsed.timestamp).getTime(),
      inventory
    };
  } catch (e) {
    if (retry && e instanceof SyntaxError) {
      setTimeout(() => parseCargoJson(false), 100);
    } else {
      console.warn('[DeliveryDetector] Failed to parse Cargo.json:', e);
    }
    return null;
  }
}

function deliveriesMatch(a: DeliveryEvent, b: DeliveryEvent): boolean {
  return (
    a.commodity === b.commodity &&
    a.count === b.count &&
    Math.abs(a.timestamp - b.timestamp) < 1000 &&
    a.inferred === b.inferred &&
    a.stationName === b.stationName
  );
}

function addDelivery(delivery: DeliveryEvent, mainWindow?: BrowserWindow) {
  if (!bufferedDeliveries.find(e => deliveriesMatch(e, delivery))) {
    bufferedDeliveries.push(delivery);
    console.log(`[DeliveryDetector] Delivery recorded: ${delivery.count}x ${delivery.commodity} (${delivery.inferred ? 'inferred' : 'real'})`);
    if (mainWindow) {
      mainWindow.webContents.send('delivery-detected', delivery);
    }
    saveDeliveriesToDisk();
  }
}

function detectCargoDifference(oldState: CargoState, newState: CargoState, mainWindow?: BrowserWindow) {
  for (const [commodity, oldCount] of Object.entries(oldState.inventory)) {
    const newCount = newState.inventory[commodity] || 0;
    if (newCount < oldCount) {
      const delivery: DeliveryEvent = {
        commodity,
        count: oldCount - newCount,
        timestamp: newState.timestamp,
        inferred: true,
        stationName: colonisationDockedAt?.stationName
      };
      addDelivery(delivery, mainWindow);
    }
  }
}

function isColonisationDockEvent(entry: any): boolean {
  return entry.event === 'Docked' &&
    Array.isArray(entry.StationServices) &&
    entry.StationServices.includes('colonisationcontribution');
}

function isUndockedEvent(entry: any): boolean {
  return entry.event === 'Undocked';
}

async function saveDeliveriesToDisk() {
  try {
    await fsp.writeFile(deliveryFilePath, JSON.stringify(bufferedDeliveries, null, 2));
  } catch (e) {
    console.error('[DeliveryDetector] Failed to save deliveries to disk:', e);
  }
}

async function loadPersistedDeliveries() {
  try {
    if (fs.existsSync(deliveryFilePath)) {
      const data = await fsp.readFile(deliveryFilePath, 'utf8');
      bufferedDeliveries = JSON.parse(data);
    }
  } catch (e) {
    console.warn('[DeliveryDetector] Failed to load deliveries:', e);
  }
}

async function scanPastJournalFiles() {
  if (!fs.existsSync(journalDir)) return;

  const fiveWeeksAgo = Date.now() - 5 * 7 * 24 * 60 * 60 * 1000;
  const files = (await fsp.readdir(journalDir)).filter(f => f.startsWith('Journal') && f.endsWith('.log'));
  const recentFiles: string[] = [];

  for (const file of files) {
    const filePath = path.join(journalDir, file);
    const stats = await fsp.stat(filePath);
    if (stats.mtimeMs >= fiveWeeksAgo) {
      recentFiles.push(filePath);
    }
  }

  let lastDock: { entry: any, cargo: CargoState | null } | null = null;
  let lastCargo: CargoState = { timestamp: 0, inventory: {} }; // Initialized with a valid CargoState object

  for (const filePath of recentFiles) {
    try {
      const lines = (await fsp.readFile(filePath, 'utf8')).trim().split('\n');
      for (const line of lines) {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.timestamp).getTime();

        if (isColonisationDockEvent(entry)) {
          lastDock = {
            entry,
            cargo: lastCargo
          };
        } else if (isUndockedEvent(entry) && lastDock) {
          const stationName = lastDock.entry.StationName_Localised ?? lastDock.entry.StationName;
          if (lastDock.cargo && lastCargo) {
            for (const [commodity, oldCount] of Object.entries(lastDock.cargo.inventory)) {
              const newCount = lastCargo?.inventory[commodity] || 0; // Safely access inventory with optional chaining
              if (newCount != oldCount) {
                const delivery: DeliveryEvent = {
                  commodity,
                  count: oldCount - newCount,
                  timestamp,
                  inferred: true,
                  stationName
                };
                addDelivery(delivery);
              }
            }
          }
          lastDock = null;
        }

        /* if (entry.event === 'Cargo' && entry.Vessel === 'Ship') {
          const inventory: Record<string, number> = {};
          for (const item of entry.Inventory || []) {
            inventory[item.Name] = item.Count;
          }
          lastCargo = { timestamp, inventory };
        } */
      }
    } catch (e) {
      console.warn(`[DeliveryDetector] Error processing ${filePath}:`, e);
    }
    await new Promise(res => setImmediate(res));
  }

  await saveDeliveriesToDisk();
}

function handleJournalLine(line: string, mainWindow: BrowserWindow) {
  if (!line.includes('"event":"')) return;

  let entry: any;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }

  const timestamp = new Date(entry.timestamp).getTime();

  if (entry.event === 'Docked' && isColonisationDockEvent(entry)) {
    colonisationDockedAt = {
      timestamp,
      stationName: entry.StationName_Localised ?? entry.StationName,
      isColonisationShip: true
    };
    cargoAtDockTime = null;
  }
}

function startWatchingJournal(mainWindow: BrowserWindow) {
  if (!fs.existsSync(journalDir)) return;

  journalWatcher = fs.watch(journalDir, (eventType, filename) => {
    if (!filename?.startsWith('Journal') || !filename.endsWith('.log')) return;
    const filePath = path.join(journalDir, filename);
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return;
      const lines = data.trim().split('\n');
      const lastLines = lines.slice(-10);
      for (const line of lastLines) {
        handleJournalLine(line, mainWindow);
      }
    });
  });
}

function watchCargoFile(mainWindow: BrowserWindow) {
  const cargoPath = path.join(journalDir, 'Cargo.json');
  if (!fs.existsSync(cargoPath)) return;
  if (cargoWatcher) cargoWatcher.close();

  cargoWatcher = fs.watch(cargoPath, (eventType) => {
    if (eventType !== 'change') return;
    setTimeout(() => {
      const newCargo = parseCargoJson();
      if (!newCargo) return;

      if (lastCargoState && colonisationDockedAt) {
        detectCargoDifference(lastCargoState, newCargo, mainWindow);
      }

      lastCargoState = newCargo;

      if (colonisationDockedAt && !cargoAtDockTime) {
        cargoAtDockTime = newCargo;
      }
    }, 150);
  });
}

export async function setupDeliveryTracking(mainWindow: BrowserWindow) {
  console.log('[DeliveryDetector] Initializing delivery tracking...');
  await loadPersistedDeliveries();
  await scanPastJournalFiles();
  lastCargoState = parseCargoJson();
  startWatchingJournal(mainWindow);
  watchCargoFile(mainWindow);
}

export async function getAllDeliveryEvents(): Promise<DeliveryEvent[]> {
  return [...bufferedDeliveries];
}

ipcMain.handle('reset-delivery-data', async () => {
  bufferedDeliveries = [];
  try {
    await saveDeliveriesToDisk();
    console.log('[DeliveryDetector] Delivery data has been reset.');
    return { success: true };
  } catch (e) {
    console.error('[DeliveryDetector] Failed to reset delivery data:', e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
});
