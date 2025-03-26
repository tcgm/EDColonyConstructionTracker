import React from 'react';

export default function EDButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        background: '#FFA500',
        color: '#fff',
        padding: '2px 10px',
        border: 'none',
        fontWeight: 'bold',
        cursor: 'pointer',
        textShadow: '0 0 5px #000',
        boxShadow: '0 0 8px #FF8C00',
        margin: '5px',
        transition: '0.2s',
      }}
      onMouseEnter={(e) => e.target.style.boxShadow = '0 0 12px #FF8C00'}
      onMouseLeave={(e) => e.target.style.boxShadow = '0 0 8px #FF8C00'}
    >
      {children}
    </button>
  );
}
