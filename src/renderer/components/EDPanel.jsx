import React from 'react';

export default function EDPanel({ children, style = {}, ...props }) {
  return (
    <div
      {...props}
      style={{
        background: '#000',
        color: '#FFA500',
        padding: '20px',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
        ...style,
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
