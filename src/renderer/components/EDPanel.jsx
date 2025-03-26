import React from 'react';
import './EDPanel.css';

export default function EDPanel({ children, style = {}, ...props }) {
  return (
    <div className='ed-panel'
      {...props}
      style={{
        ...style,
      }}
      onDragOver={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
