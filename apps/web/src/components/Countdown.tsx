import { motion } from 'framer-motion';
import type { MarketStatus } from '@jet/shared';
import { C, mono } from '../theme.js';

interface Props {
  msRemaining: number;
  status: MarketStatus;
}

export default function Countdown({ msRemaining, status }: Props) {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const urgent = msRemaining > 0 && msRemaining < 15_000;
  const color = status === 'resolved' ? C.textMute : urgent ? C.no : C.text;

  if (urgent) {
    return (
      <motion.div
        animate={{ opacity: [1, 0.55, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 700, color }}
      >
        {display}
      </motion.div>
    );
  }

  return (
    <div style={{ fontFamily: mono, fontVariantNumeric: 'tabular-nums', fontSize: 14, fontWeight: 600, color }}>
      {display}
    </div>
  );
}
