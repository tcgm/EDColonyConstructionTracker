import React from 'react';

export default function EDRadioGroup({ label, options, selected, onChange }) {
  return (
    <div style={{ marginBottom: '10px', fontSize: '14px' }}>
      <span>{label} </span>
      {options.map(option => (
        <label key={option} style={{ marginRight: '10px' }}>
          <input
            type="radio"
            checked={selected === option}
            onChange={() => onChange(option)}
            style={{ marginRight: '5px' }}
          />
          {option}
        </label>
      ))}
    </div>
  );
}
