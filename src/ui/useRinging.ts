import { useEffect } from 'react';

const RING_HZ = 440;
const RING_MS = 1000;
const PAUSE_MS = 2000;

/** One second of tone, two of silence, until stopped. */
const startTone = () => {
  const context = new AudioContext();
  const gain = context.createGain();
  const tone = context.createOscillator();

  const beep = () => {
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime + RING_MS / 1000);
  };

  tone.frequency.value = RING_HZ;
  gain.gain.value = 0;
  tone.connect(gain).connect(context.destination);
  tone.start();
  beep();

  const repeat = setInterval(beep, RING_MS + PAUSE_MS);

  return () => {
    clearInterval(repeat);
    void context.close();
  };
};

/** While a call from `number` rings: a ringtone, and the app brings its window forward. */
export const useRinging = (number: string | undefined) => {
  useEffect(() => {
    if (number === undefined) return undefined;

    const stopTone = startTone();

    window.desktop.ringing(number);

    return () => {
      stopTone();
      window.desktop.quiet();
    };
  }, [number]);
};
