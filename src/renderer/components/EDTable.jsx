import React, { useState } from 'react';

export default function EDTable({ rows }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortConfig.key) return 0;

    const valueA = a[sortConfig.key];
    const valueB = b[sortConfig.key];

    if (typeof valueA === 'string') {
      return (sortConfig.direction === 'asc' ? 1 : -1) * valueA.localeCompare(valueB);
    }
    return (sortConfig.direction === 'asc' ? 1 : -1) * (valueA - valueB);
  });

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const columns = [
    { key: 'commodity', label: 'Commodity' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'required', label: 'Required' },
    { key: 'remaining', label: 'Remaining' }
  ];

  return (
    <div style={{ flex: 1, overflow: 'auto', width: '100%' }}>
      <table border="1" cellPadding="5" style={{ width: '100%', background: '#000', color: '#FFA500' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => handleSort(col.key)}
              >
                {col.label} {sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={i}>
              <td>{row.commodity}</td>
              <td>{row.delivered}</td>
              <td>{row.required}</td>
              <td>{row.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
