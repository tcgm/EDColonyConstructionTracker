import { AiOutlineQuestionCircle  } from 'react-icons/ai';

export default function EDFooter({
  showOCRInstructions,
  }) {
    return (
      <div
        id="footer"
        style={{
          marginTop: '10px',
          padding: '10px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#888',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <p style={{ margin: '0', fontSize: '12px', opacity: 0.7, color: '#FFA500' }}>
          Can also drag screenshots into window to parse OCR
        </p>
        <div
          style={{
            display: 'inline-block',
            cursor: 'pointer',
            opacity: 0.75,
            transition: 'transform 0.2s, opacity 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.2)';
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.color = '#FFA500';
            e.currentTarget.style.textShadow = '0 0 10px #FFA500';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '0.75';
            e.currentTarget.style.color = '#888';
            e.currentTarget.style.textShadow = 'none';
          }}
          onClick={() => {
            showOCRInstructions();
            // Call your function to show OCR instructions here
            console.log('Show OCR instructions');
          }}
        >
          <AiOutlineQuestionCircle 
            size={24}
            style={{ verticalAlign: 'middle' }}
          />
        </div>
      </div>
    );
  }
  