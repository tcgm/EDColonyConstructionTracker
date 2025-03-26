import EDButton from './EDButton';
import EDRadioGroup from './EDRadioGroup';

export default function EDControls({
  filter,
  setFilter,
  exportCSV,
  resetParsed,
  resetDelivery }) {
  return (
    <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', verticalAlign: 'middle' }}>
      <EDButton onClick={resetParsed}>Reset Parsed Data</EDButton>
      <EDButton onClick={resetDelivery}>Reset Deliveries</EDButton>
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
