import React from 'react';

export default function EDLabel({ children, style = {}, ...props }) {
  return (
    <span
      {...props}
      style={{
        color: '#FFA500',
        textShadow: '0 0 5px #FF8C00',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
