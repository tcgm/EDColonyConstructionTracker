import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as Tesseract from 'tesseract.js'; // Browser version w/ types
const Fuse = require('fuse.js')// 1) Import Jimp as a namespace
import { Jimp } from "jimp";
import { Buffer } from 'buffer';

import EDPanel from './components/EDPanel';
import EDHeader from './components/EDHeader';
import EDControls from './components/EDControls';
import EDTable from './components/EDTable';
import EDFooter from './components/EDFooter';
import './App.css';

import { KNOWN_COMMODITIES } from './edCommods';

// 2) Cast JimpAll to `any` so TS won't complain about read/MIME_PNG
//const Jimp = JimpAll as any;

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
    
    // Convert file to ArrayBuffer and then to Node Buffer
    const buffer = await file.arrayBuffer();
    console.log('[preprocessImage] File converted to ArrayBuffer');
    const nodeBuffer = Buffer.from(buffer);
    console.log('[preprocessImage] ArrayBuffer converted to Node Buffer');
    
    const image = await Jimp.read(nodeBuffer);
    console.log('[preprocessImage] Image loaded into Jimp');
    
    // Apply grayscale and contrast adjustments
    //image.greyscale().contrast(1);
    console.log('[preprocessImage] Applied greyscale and contrast adjustments');
    
    // Use 'image/png' as MIME type
    const mimePNG = 'image/png';
    
    // Use getBase64 instead of getBuffer to obtain a base64 string
    const processedBase64 = await Promise.race([
      new Promise<string>((resolve, reject) => {
        image.getBase64(mimePNG, (err: any, data: string) => {
          if (err) {
            return reject(err);
          }
          resolve(data);
        });
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Conversion timed out')), 5000)
      ),
    ]);
    
    
    
    // Helper: Convert base64 string to Blob
    function base64ToBlob(base64: string, type: string): Blob {
      console.log('[base64ToBlob] Converting base64 to Blob');
      const base64Data = base64.split(',')[1]; // Remove data:*;base64, prefix
      console.log('[base64ToBlob] Base64 data extracted');
      const byteCharacters = atob(base64Data);
      console.log('[base64ToBlob] Base64 decoded');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      console.log('[base64ToBlob] Byte array created');
      const byteArray = new Uint8Array(byteNumbers);
      console.log('[base64ToBlob] Uint8Array created');
      const blob = new Blob([byteArray], { type });
      console.log('[base64ToBlob] Blob created successfully');
      return blob;
    }
    console.log('[base64ToBlob] Converting base64 to Blob start');
    
    const blob = await base64ToBlob(processedBase64, mimePNG);
    console.log('[preprocessImage] Preprocessing complete, returning Blob');
    return blob;
  }
  
  

  // 3️⃣ Handle drop => Preprocess => OCR => fuzzy match
  useEffect(() => {
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
      console.log('[renderer] Dropped files:', files.map(f => f.name));

      if (!files.length) return;

      const totalFiles = files.length;
      let allOcrLines: string[] = [];

      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        try {
          // Preprocess with Jimp
          const preprocessedBlob = await preprocessImage(file);
          // Create object URL
          const objectUrl = URL.createObjectURL(preprocessedBlob);

          // OCR with Tesseract
          // 4) We cast the options to `any` so TS doesn't complain about `tessedit_char_whitelist`
          const result = await Tesseract.recognize(objectUrl, 'eng', {
            logger: (m: any) => {
              if (m.status === 'recognizing text') {
                const portion = 1 / totalFiles;
                const overall = i * portion + m.progress * portion;
                setOcrProgress(overall);
              }
            },
            // @ts-ignore
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,-',
            // @ts-ignore
            psm: 6,
          } as any);

          const text = result.data.text;
          const fileLines = text
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
          allOcrLines.push(...fileLines);

          URL.revokeObjectURL(objectUrl);
        } catch (err) {
          console.error('OCR error:', err);
        }
      }

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
