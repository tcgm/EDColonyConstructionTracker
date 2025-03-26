import EDButton from './EDButton';
import EDRadioGroup from './EDRadioGroup';

export default function EDControls({ filter, setFilter, exportCSV }) {
  return (
    <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', verticalAlign: 'middle' }}>
      <EDRadioGroup
        label="Filter:"
        options={['all', 'incomplete', 'complete']}
        selected={filter}
        onChange={setFilter}
      />
      <EDButton onClick={exportCSV}>Export CSV</EDButton>
    </div>
  );
}
