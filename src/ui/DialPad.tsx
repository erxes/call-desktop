const KEYS = [
  { key: '1', letters: '' },
  { key: '2', letters: 'ABC' },
  { key: '3', letters: 'DEF' },
  { key: '4', letters: 'GHI' },
  { key: '5', letters: 'JKL' },
  { key: '6', letters: 'MNO' },
  { key: '7', letters: 'PQRS' },
  { key: '8', letters: 'TUV' },
  { key: '9', letters: 'WXYZ' },
  { key: '*', letters: '' },
  { key: '0', letters: '+' },
  { key: '#', letters: '' },
];

/** The twelve phone keys: digits for a number to call, or tones during a call. */
export const DialPad = ({ onKey }: { onKey: (key: string) => void }) => (
  <div className="pad" role="group" aria-label="Dial pad">
    {KEYS.map(({ key, letters }) => (
      <button key={key} type="button" aria-label={key} onClick={() => onKey(key)}>
        {key}
        <small aria-hidden>{letters}</small>
      </button>
    ))}
  </div>
);
