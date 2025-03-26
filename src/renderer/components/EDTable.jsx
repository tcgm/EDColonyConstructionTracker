import React, { useState } from 'react';
import './EDTable.css';

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
      <table
        className="ed-table"
        cellSpacing="1"
        cellPadding="1"
        style={{ width: '100%', background: '#000', color: '#FFA500', borderCollapse: 'collapse' }}
      >
        <thead style={{ position: 'sticky', top: 0 }}>
          <tr>
            {columns.map(col => (
              <th key={col.key} onClick={() => handleSort(col.key)}>
                {col.label} {sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <React.Fragment key={i}>
              <tr>
                <td>{row.commodity}</td>
                <td>{row.delivered}</td>
                <td>{row.required}</td>
                <td>{row.remaining}</td>
              </tr>
              <tr key={`${i}_progress`}>
                <td colSpan={4}>
                  <div style={{ background: '#333', borderRadius: '4px', overflow: 'hidden', height: '4px' }}>
                    <div
                      style={{
                        width: `${row.progress * 100}%`,
                        background: '#FFA500',
                        height: '100%',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
