import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tesseract from 'tesseract.js'; // Browser version w/ types
const Fuse = require('fuse.js');
// Removed Jimp and Buffer imports since we’re now using image‑js
// import { Jimp } from "jimp";
// import { Buffer } from 'buffer';
import { Image } from 'image-js';

import EDPanel from './components/EDPanel';
import EDHeader from './components/EDHeader';
import EDControls from './components/EDControls';
import EDTable from './components/EDTable';
import EDFooter from './components/EDFooter';
import './App.css';

import { KNOWN_COMMODITIES } from './edCommods';

// 1️⃣ Create fuzzy matcher for known commodities
const fuse = new Fuse(KNOWN_COMMODITIES, {
  includeScore: true,
  threshold: 0.4, // Adjust as needed
});

function fuzzyCorrect(rawName: string) {
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

// 3️⃣ Handle drop => Preprocess => OCR => fuzzy match
function EDApp() {
  const [lines, setLines] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, number>>({});
  const [parsedData, setParsedData] = useState<
    { commodity: string; required: number; delivered: number; remaining: number }[]
  >([]);
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all');

  // For progress bar
  const [ocrProgress, setOcrProgress] = useState(0);

  const ipc = window.electron.ipcRenderer;

  useEffect(() => {
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
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
          // Preprocess with image‑js
          console.log(`[handleDrop] Preprocessing file: ${file.name}`);
          const preprocessedBlob = await preprocessImage(file);
          console.log(`[handleDrop] Preprocessing complete for file: ${file.name}`);

          // Create object URL
          const objectUrl = URL.createObjectURL(preprocessedBlob);
          console.log(`[handleDrop] Created object URL for file: ${file.name}`);

          // OCR with Tesseract
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
        .map(line => line.trim())
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
      setTimeout(() => setOcrProgress(0), 500); // reset after short delay

      if (allOcrLines.length > 0) {
        setLines(allOcrLines);
      }
    };

    const handleDragOver = (e: DragEvent) => e.preventDefault();

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // 4️⃣ Auto-reload journal logs
  useEffect(() => {
    const loadAndProcess = async () => {
      const logData = await ipc.loadLogs();
      setDeliveries(logData);
    };
    loadAndProcess();
    ipc.onJournalUpdate(() => {
      loadAndProcess();
    });
  }, [ipc]);

  // 5️⃣ Merge OCR lines with delivery data
  useEffect(() => {
    const commodities = lines.filter(line => !/^[\d,]+$/.test(line));
    const numbers = lines
      .filter(line => /^[\d,]+$/.test(line))
      .map(n => parseInt(n.replace(/,/g, '')));

    const combined = commodities.map((rawName, i) => {
      const correctedName = fuzzyCorrect(rawName.toUpperCase());
      const req = numbers[i] ?? 0;
      return {
        commodity: correctedName,
        required: req,
        delivered: deliveries[correctedName] || 0,
        remaining: Math.max(0, req - (deliveries[correctedName] || 0)),
      };
    });
    setParsedData(combined);
  }, [lines, deliveries]);

  // CSV export
  const exportCSV = async () => {
    const rows = filteredRows().map(row => [
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

  return (
    <EDPanel>
      <EDHeader />
      {/* Progress Bar */}
      <div style={{ width: '50%', background: '#333', height: '10px', margin: '10px auto' }}>
        <div
          style={{
            width: `${(ocrProgress * 100).toFixed(1)}%`,
            background: '#FFA500',
            height: '100%',
            transition: 'width 0.2s'
          }}
        />
      </div>

      <EDControls filter={filter} setFilter={setFilter} exportCSV={exportCSV} />
      <EDTable rows={filteredRows()} />
      <EDFooter />
    </EDPanel>
  );
}

export default EDApp;
