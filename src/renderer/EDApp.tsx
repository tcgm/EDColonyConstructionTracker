import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import EDPanel from './components/EDPanel';
import EDHeader from './components/EDHeader';
import EDControls from './components/EDControls';
import EDTable from './components/EDTable';
import EDFooter from './components/EDFooter';
import './App.css';

function EDApp() {
  const [lines, setLines] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, number>>({});
  const [parsedData, setParsedData] = useState<
    { commodity: string; required: number; delivered: number; remaining: number }[]
  >([]);
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'complete'>('all');
  
  const ipc = window.electron.ipcRenderer;
  
  useEffect(() => {
    ipc.onFileDrop(async (paths) => {
      console.log('Received file drop:', paths);
      const ocrLines = await ipc.parseImages(paths);
      setLines(ocrLines);
    });
  }, []);
  
  
  // const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const files = Array.from(e.target.files || []);
  //   const filePaths = files.map((f: File & { path?: string }) => f.path || '');
  //   console.log('Selected:', filePaths);
  // };

  // Automatically reload journal logs on changes
  useEffect(() => {
    const loadAndProcess = async () => {
      const logData = await ipc.loadLogs();
      setDeliveries(logData);
    };

    loadAndProcess();
    ipc.onJournalUpdate(() => {
      loadAndProcess();
    });
  }, []);

  // OCR processing logic
  useEffect(() => {
    const commodities = lines.filter(line => !/^[\d,]+$/.test(line));
    const numbers = lines.filter(line => /^[\d,]+$/.test(line)).map(n => parseInt(n.replace(/,/g, '')));
    const combined = commodities.map((c, i) => {
      const req = numbers[i] ?? 0;
      return {
        commodity: c,
        required: req,
        delivered: deliveries[c] || 0,
        remaining: Math.max(0, req - (deliveries[c] || 0))
      };
    });
    
    setParsedData(combined);
  }, [lines, deliveries]);

  // Export CSV action
  const exportCSV = async () => {
    const rows = filteredRows().map(row => [row.commodity, row.delivered, row.required, row.remaining]);
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
      <EDControls filter={filter} setFilter={setFilter} exportCSV={exportCSV} />
      <EDTable rows={filteredRows()} />
      <EDFooter />
    </EDPanel>
  );
}

export default EDApp;