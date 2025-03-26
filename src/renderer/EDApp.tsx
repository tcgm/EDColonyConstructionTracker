import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tesseract from 'tesseract.js'; // Browser version w/ types
const Fuse = require('fuse.js');
import { Image } from 'image-js';
import './EDApp.css';

import EDPanel from './components/EDPanel';
import EDHeader from './components/EDHeader';
import EDControls from './components/EDControls';
import EDTable from './components/EDTable';
import EDFooter from './components/EDFooter';
import './App.css';

import { KNOWN_COMMODITIES } from './edCommods';
import EDDropzone from './components/EDDropzone';
import { Button, Modal } from 'react-bootstrap';

// Create fuzzy matcher for known commodities
const fuse = new Fuse(KNOWN_COMMODITIES, {
  includeScore: true,
  threshold: 0.4, // Adjust as needed
});

function fuzzyCorrect(rawName: string): string {
  const result = fuse.search(rawName);
  if (result.length && result[0].score! < 0.3) {
    return result[0].item; // best match
  }
  return rawName;
}

async function preprocessImage(file: File): Promise<Blob> {
  console.log('[preprocessImage] Starting preprocessing for file:', file.name);
  
  // Convert file to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  console.log('[preprocessImage] File converted to ArrayBuffer');
  
  // Convert ArrayBuffer to Uint8Array (expected by image‑js)
  const uint8Array = new Uint8Array(arrayBuffer);
  console.log('[preprocessImage] ArrayBuffer converted to Uint8Array');
  
  // Load the image using image‑js
  const image = await Image.load(uint8Array);
  console.log('[preprocessImage] Image loaded using image‑js');
  
  // Convert the image to grayscale
  const greyImage = image.grey();
  console.log('[preprocessImage] Image converted to grayscale');
  
  // Convert the processed image to a Data URL (base64 string)
  const dataUrl = greyImage.toDataURL('image/png');
  console.log('[preprocessImage] Converted image to Data URL');
  
  // Helper: Convert Data URL to Blob
  function dataURLToBlob(dataURL: string): Blob {
    console.log('[dataURLToBlob] Converting Data URL to Blob');
    const parts = dataURL.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    if (!mimeMatch) {
      throw new Error('Invalid data URL');
    }
    const mime = mimeMatch[1];
    const bstr = atob(parts[1]);
    const n = bstr.length;
    const u8arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      u8arr[i] = bstr.charCodeAt(i);
    }
    const blob = new Blob([u8arr], { type: mime });
    console.log('[dataURLToBlob] Blob created successfully');
    return blob;
  }
  
  const blob = dataURLToBlob(dataUrl);
  console.log('[preprocessImage] Preprocessing complete, returning Blob');
  return blob;
}

// Normalize OCR lines to fix common misreads.
function normalizeOcrLine(line: string): string {
  return line.replace(/\[1\]/g, '0').trim();
}

interface CommodityData {
  required: number;
  delivered: number;
  lastUpdated: number;
  isNew: boolean;
}

interface ParsedItem {
  commodity: string;
  required: number;
  delivered: number;
  remaining: number;
  progress: number;
  weight: number;
  isNew: boolean;
}

// A discrete delivery event from the ED logs.

export interface DeliveryEvent {
  commodity: string;
  count: number;
  timestamp: number;
  inferred: boolean;
  stationName?: string;
}

// Aggregated delivery data per commodity.
interface AggregatedDelivery {
  count: number;
  lastUpdated: number;
}

// EDApp now persists ALL aspects of parsedData.
function EDApp() {
  const [lines, setLines] = useState<string[]>([]);
  // deliveries now holds aggregated delivery data with timestamps.
  const [deliveries, setDeliveries] = useState<Record<string, AggregatedDelivery>>({});
  // persistedData stores the full record for each commodity.
  // Format: { [commodity]: { required, delivered, lastUpdated, isNew } }
  const [persistedData, setPersistedData] = useState<Record<string, CommodityData>>({});
  // parsedData is computed from persistedData for display.
  const [parsedData, setParsedData] = useState<ParsedItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('incomplete');

  // For progress bars.
  const [ocrProgress, setOcrProgress] = useState(1);
  const [deliveryProgress, setDeliveryProgress] = useState(0);

  const ipc = window.electron.ipcRenderer;

  const handleDrop = async (e: DragEvent) => {
    if (e.preventDefault) e.preventDefault();
    const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
    console.log('[renderer] Dropped files:', files.map(f => f.name));
    if (!files.length) {
      console.log('[handleDrop] No files dropped');
      return;
    }
    console.log('[handleDrop] Total files dropped:', files.length);
    const totalFiles = files.length;
    let allOcrLines: string[] = [];
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      console.log(`[handleDrop] Processing file ${i + 1} of ${totalFiles}:`, file.name);
      try {
        console.log(`[handleDrop] Preprocessing file: ${file.name}`);
        const preprocessedBlob = await preprocessImage(file);
        console.log(`[handleDrop] Preprocessing complete for file: ${file.name}`);
        const objectUrl = URL.createObjectURL(preprocessedBlob);
        console.log(`[handleDrop] Created object URL for file: ${file.name}`);
        console.log(`[handleDrop] Starting OCR for file: ${file.name}`);
        const result = await Tesseract.recognize(objectUrl, 'eng', {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              const portion = 1 / totalFiles;
              const overall = i * portion + m.progress * portion;
              setOcrProgress(overall);
              console.log(`[handleDrop] OCR progress for file ${file.name}:`, (m.progress * 100).toFixed(1) + '%');
            }
          },
          // @ts-ignore
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
          // @ts-ignore
          psm: 6,
        } as any);
        console.log(`[handleDrop] OCR complete for file: ${file.name}`);
        const text = result.data.text;
        console.log(`[handleDrop] OCR result for file ${file.name}:`, text);
        const fileLines = text
          .split('\n')
          .map(line => normalizeOcrLine(line.trim()))
          .filter(Boolean);
        console.log(`[handleDrop] Extracted lines from file ${file.name}:`, fileLines);
        allOcrLines.push(...fileLines);
        URL.revokeObjectURL(objectUrl);
        console.log(`[handleDrop] Revoked object URL for file: ${file.name}`);
      } catch (err) {
        console.error(`[handleDrop] OCR error for file ${file.name}:`, err);
      }
    }
    console.log('[handleDrop] All OCR lines:', allOcrLines);
    setOcrProgress(1);
    setTimeout(() => setOcrProgress(1), 500);
    if (allOcrLines.length > 0) setLines(allOcrLines);
  };

  const handleDragOver = (e: DragEvent) => e.preventDefault();

  useEffect(() => {
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // On mount, load the persisted parsed data from localStorage.
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('parsedData') || '{}');
    setPersistedData(stored);
  }, []);

  // Save persisted data to localStorage whenever it changes.
  useEffect(() => {
    localStorage.setItem('parsedData', JSON.stringify(persistedData));
  }, [persistedData]);

  // Process discrete delivery events into aggregated data.
  const processLogEvents = (events: DeliveryEvent[]): Record<string, AggregatedDelivery> => {
    const aggregated: Record<string, AggregatedDelivery> = {};
    events.forEach(event => {
      if (!aggregated[event.commodity]) {
        aggregated[event.commodity] = { count: 0, lastUpdated: 0 };
      }
      aggregated[event.commodity].count += event.count;
      aggregated[event.commodity].lastUpdated = Math.max(aggregated[event.commodity].lastUpdated, event.timestamp);
    });
    return aggregated;
  };

  // Auto-reload ED journal logs (ED deliveries) via IPC.
  useEffect(() => {
    const loadAndProcess = async () => {
      const events: DeliveryEvent[] = await ipc.loadLogs();
      console.log('[loadAndProcess] Loaded ED log events:', events);
      const aggregated = processLogEvents(events);
      setDeliveries(aggregated);
    };

    // Trigger once after everything is ready
    loadAndProcess();

    

  // Live updates from DeliveryDetector
  ipc.on('delivery-detected', (_event: any, ...args: unknown[]) => {
    const delivery = args[0] as DeliveryEvent;
    setDeliveries(prev => {
      const updated = { ...prev };
      if(delivery && delivery.commodity) {
        const corrected = fuzzyCorrect(delivery.commodity.toUpperCase());

        if (!updated[corrected]) {
          updated[corrected] = { count: 0, lastUpdated: 0 };
        }

        updated[corrected].count += delivery.count;
        updated[corrected].lastUpdated = Math.max(updated[corrected].lastUpdated, delivery.timestamp);
      }
      return updated;
    });
  });

    // Set up periodic updates
    const intervalId = setInterval(() => {
      loadAndProcess();
    }, 5000); // Adjust interval as needed (e.g., 60 seconds)

    // Listen for journal updates
    ipc.onJournalUpdate(() => {
      loadAndProcess();
    });

    // Cleanup on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [ipc]);
  

  // Merge new ED log deliveries (with timestamps) into persistedData.
  useEffect(() => {
    setPersistedData(prev => {
      const updated = { ...prev };
      Object.keys(deliveries).forEach(commodity => {
        const correctedName = fuzzyCorrect(commodity.toUpperCase());
        const newData = deliveries[commodity]; // { count, lastUpdated }
        const oldData = updated[correctedName] || { delivered: 0, lastUpdated: 0, required: 0, isNew: false };
        updated[correctedName] = {
          required: oldData.required,
          delivered: newData.count,
          lastUpdated: newData.lastUpdated,
          isNew: newData.lastUpdated > oldData.lastUpdated, // mark as new if the timestamp is later
        };
      });
      // For commodities not present in the latest ED logs, clear the new flag.
      Object.keys(updated).forEach(commodity => {
        if (!(commodity in deliveries)) {
          updated[commodity].isNew = false;
        }
      });
      return updated;
    });
  }, [deliveries]);

  // When new OCR lines arrive, update persistedData with new maximum "required" values.
  useEffect(() => {
    if (lines.length > 0) {
      setPersistedData(prev => {
        const updated = { ...prev };
        lines.forEach(line => {
          // Regex to capture the commodity name and required number.
          const match = line.match(/^(.*?)(\d[\d,]*)\D*$/);
          if (match) {
            const namePart = match[1].trim();
            const numberPart = match[2].replace(/,/g, '');
            const requiredFromOCR = parseInt(numberPart, 10) || 0;
            const correctedName = fuzzyCorrect(namePart.toUpperCase());
            if (updated[correctedName]) {
                updated[correctedName].required = requiredFromOCR === 0 
                ? 0 
                : Math.max(updated[correctedName].required, requiredFromOCR);
            } else {
              updated[correctedName] = { required: requiredFromOCR, delivered: 0, lastUpdated: 0, isNew: false };
            }
          } else {
            const correctedName = fuzzyCorrect(line.toUpperCase());
            if (!updated[correctedName]) {
              updated[correctedName] = { required: 0, delivered: 0, lastUpdated: 0, isNew: false };
            }
          }
        });
        return updated;
      });
    }
  }, [lines]);

  // Compute parsedData for display from persistedData.
  useEffect(() => {
    const newParsedData = Object.keys(persistedData).map(commodity => {
      const { required, delivered, isNew } = persistedData[commodity];
      // Compute per-commodity progress: if required is > 0, use delivered/required; if not, consider it complete.
      const progress = required > 0 ? delivered / required : 1;
      // Use required as the weight, but default to 1 if required is 0.
      const weight = required > 0 ? required : 1;
      // Calculate remaining as the difference between required and delivered.
      const remaining = Math.max(required - delivered, 0);
      return { commodity, required, delivered, remaining, progress, weight, isNew };
    });
    setParsedData(newParsedData);
  
    // Weighted overall progress across all commodities.
    const totalWeight = newParsedData.reduce((sum, item) => sum + item.weight, 0);
    const weightedProgressSum = newParsedData.reduce((sum, item) => sum + item.progress * item.weight, 0);
    const weightedOverallProgress = totalWeight > 0 ? weightedProgressSum / totalWeight : 0;
  
    // Commodity completion percentage (each commodity counts equally).
    const totalCommodities = newParsedData.length;
    const completedCommodities = newParsedData.filter(item => item.progress === 1).length;
    const completionProgress = totalCommodities > 0 ? completedCommodities / totalCommodities : 0;
  
    // Combine the two progress values. Here, we average them, but you can adjust the weighting if desired.
    const combinedProgress = (weightedOverallProgress + completionProgress) / 2;
  
    setDeliveryProgress(combinedProgress);
    console.log(`Weighted Overall Progress: ${(weightedOverallProgress * 100).toFixed(1)}%`);
    console.log(`Commodity Completion Progress: ${(completionProgress * 100).toFixed(1)}%`);
    console.log(`Combined Delivery Progress: ${(combinedProgress * 100).toFixed(1)}%`);
  }, [persistedData]);
  

  // CSV export.
  const exportCSV = async () => {
    const rows = parsedData
      .filter(r => {
        if (filter === 'all') return true;
        if (filter === 'incomplete') return r.remaining > 0;
        if (filter === 'complete') return r.remaining === 0;
        return false;
      })
      .map(row => [
        row.commodity,
        row.delivered,
        row.required,
        row.remaining,
      ]);
    await ipc.exportCsv(rows);
  };

  const filteredRows = () => {
    return parsedData.filter(r => {
      if (filter === 'all') return true;
      if (filter === 'incomplete') return r.remaining > 0;
      if (filter === 'complete') return r.remaining === 0;
      return false;
    });
  };

  // Reset handler to clear persisted parsed data.
  const [showResetParsedModal, setShowResetParsedModal] = useState(false);
  const [showResetDeliveriesModal, setShowResetDeliveriesModal] = useState(false);

  const handleResetParsed = () => {
    setShowResetParsedModal(true);
  };

  const confirmResetParsed = () => {
    localStorage.removeItem('parsedData');
    setPersistedData({});
    setShowResetParsedModal(false);
  };

  const handleResetDeliveries = () => {
    setShowResetDeliveriesModal(true);
  };

  const confirmResetDeliveries = () => {
    ipc.resetDeliveryData();
    setShowResetDeliveriesModal(false);
  };

  return (
    <EDPanel>
      <EDHeader />
      {/* Progress Bar */}
      <div style={{ textAlign: 'center', color: '#FFA500', marginBottom: '10px' }}>
        {ocrProgress < 1
          ? `OCR Progress: ${(ocrProgress * 100).toFixed(1)}%`
          : `Delivery Progress: ${(deliveryProgress * 100).toFixed(1)}%`}
      </div>
      <div style={{ width: '50%', background: '#333', height: '10px', margin: '10px auto' }}>
        <div
          style={{
            width: `${(ocrProgress < 1 ? ocrProgress : deliveryProgress) * 100}%`,
            background: '#FFA500',
            height: '100%',
            transition: 'width 0.2s'
          }}
        />
      </div>
      <EDControls filter={filter} setFilter={setFilter} exportCSV={exportCSV} resetParsed={handleResetParsed} resetDelivery={handleResetDeliveries}/>
      <EDTable rows={filteredRows()} />
      <EDDropzone onFilesAdded={handleDrop} />
      <EDFooter />
      
      {/* Reset Parsed Data Modal */}
      <Modal show={showResetParsedModal} onHide={() => setShowResetParsedModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Reset</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to reset all parsed data? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="danger" onClick={confirmResetParsed}>Yes, Reset</Button>
          <Button variant="secondary" onClick={() => setShowResetParsedModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>

      {/* Reset Deliveries Modal */}
      <Modal show={showResetDeliveriesModal} onHide={() => setShowResetDeliveriesModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Reset</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to reset all delivery data? This action cannot be undone. Parsed Data can be restored from screenshots, but delivery data is compiled from active ED play and cannot be restored.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="danger" onClick={confirmResetDeliveries}>Yes, Reset</Button>
          <Button variant="secondary" onClick={() => setShowResetDeliveriesModal(false)}>Cancel</Button>
        </Modal.Footer>
      </Modal>
    </EDPanel>
  );
}

export default EDApp;
