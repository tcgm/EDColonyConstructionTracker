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
  // Replace misrecognized "[1]" with "0"
  return line.replace(/\[1\]/g, '0').trim();
}

interface CommodityData {
  required: number;
  delivered: number;
  isNew: boolean;
}

interface ParsedItem {
  commodity: string;
  required: number;
  delivered: number;
  remaining: number;
  isNew: boolean;
}

// EDApp now persists ALL aspects of parsedData.
function EDApp() {
  const [lines, setLines] = useState<string[]>([]);
  // deliveries come from ED log files via IPC
  const [deliveries, setDeliveries] = useState<Record<string, number>>({});
  // persistedData stores the full record for each commodity
  // Format: { [commodity]: { required, delivered, isNew } }
  const [persistedData, setPersistedData] = useState<Record<string, CommodityData>>({});
  // parsedData is computed from persistedData for display
  const [parsedData, setParsedData] = useState<ParsedItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('incomplete');

  // For progress bars
  const [ocrProgress, setOcrProgress] = useState(1);
  const [deliveryProgress, setDeliveryProgress] = useState(0);

  const ipc = window.electron.ipcRenderer;

  const handleDrop = async (e: DragEvent) => {
    if (e.preventDefault) {
      e.preventDefault();
    }
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
    setOcrProgress(1); // done
    setTimeout(() => setOcrProgress(1), 500); // reset after short delay
    if (allOcrLines.length > 0) {
      setLines(allOcrLines);
    }
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

  // Auto-reload journal logs (ED deliveries) via IPC.
  useEffect(() => {
    const loadAndProcess = async () => {
      const logData = await ipc.loadLogs();
      setDeliveries(logData);
      // Calculate delivery progress using parsedData.
      const totalRequired = parsedData.reduce((sum, item) => sum + item.required, 0);
      const totalDelivered = parsedData.reduce((sum, item) => sum + item.delivered, 0);
      const progress = totalRequired > 0 ? totalDelivered / totalRequired : 0;
      setDeliveryProgress(progress);
    };
    loadAndProcess();
    ipc.onJournalUpdate(() => {
      loadAndProcess();
    });
  }, [ipc, parsedData]);

  // Merge new ED log deliveries into persistedData.
  // If a commodity’s delivered count increases, mark it as new.
  useEffect(() => {
    setPersistedData(prev => {
      const updated = { ...prev };
      Object.keys(deliveries).forEach(commodity => {
        const newDelivered = deliveries[commodity];
        const oldDelivered = updated[commodity]?.delivered || 0;
        updated[commodity] = {
          required: updated[commodity]?.required || 0,
          delivered: newDelivered,
          isNew: newDelivered > oldDelivered,
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
              updated[correctedName].required = Math.max(updated[correctedName].required, requiredFromOCR);
            } else {
              updated[correctedName] = { required: requiredFromOCR, delivered: 0, isNew: false };
            }
          } else {
            const correctedName = fuzzyCorrect(line.toUpperCase());
            if (!updated[correctedName]) {
              updated[correctedName] = { required: 0, delivered: 0, isNew: false };
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
      const remaining = Math.max(required - delivered, 0);
      return { commodity, required, delivered, remaining, isNew };
    });
    setParsedData(newParsedData);
    const totalRequired = newParsedData.reduce((sum, item) => sum + item.required, 0);
    const totalDelivered = newParsedData.reduce((sum, item) => sum + item.delivered, 0);
    const progress = totalRequired > 0 ? totalDelivered / totalRequired : 0;
    setDeliveryProgress(progress);
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
  const handleReset = () => {
    if (window.confirm("Are you sure you want to reset the parsed data?")) {
      localStorage.removeItem('parsedData');
      setPersistedData({});
      alert("Parsed data has been reset.");
    }
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
      <EDControls filter={filter} setFilter={setFilter} exportCSV={exportCSV} />
      <button onClick={handleReset}>Reset Parsed Data</button>
      <EDTable rows={filteredRows()} />
      <EDDropzone onFilesAdded={handleDrop} />
      <EDFooter />
    </EDPanel>
  );
}

export default EDApp;
