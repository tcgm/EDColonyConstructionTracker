import icon from '../assets/icons/icon.png';

export default function EDHeader() {
    return (
      <div
      id="header"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px',
        fontSize: '24px',
        color: '#FFA500',
      }}
      >
      <img
        src={icon}
        alt="Logo"
        style={{
        width: '32px',
        height: '32px',
        marginRight: '10px',
        filter: 'drop-shadow(0 0 5px #FFA500)'
        }}
      />

      <h1
        style={{
        margin: '0',
        textShadow: '0 0 10px #FFA500'
        }}
      >
        ED Colony Construction Tracker
      </h1>
      </div>
    );
  }
  