/**
 * AnimatedNumber — Reusable count-up animation for KPI values.
 */

import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface AnimatedNumberProps {
  /** Target value (e.g., "6,918.52" or "+3.4%" or "$1.2T") */
  value: string;
  /** Frame at which to start the animation */
  startFrame?: number;
  /** Duration in frames */
  durationFrames?: number;
  /** Text color */
  color?: string;
  /** Font size */
  fontSize?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  startFrame = 0,
  durationFrames = 40,
  color = '#2C3E50',
  fontSize = 42,
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(
    Math.max(0, frame - startFrame),
    [0, durationFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Extract numeric part
  const match = value.match(/([-+]?[\d,.]+)/);
  let displayValue = value;

  if (match && progress < 1) {
    const numStr = match[1].replace(/,/g, '');
    const target = parseFloat(numStr);
    const current = target * progress;

    const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
    const formatted = current.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    const prefix = value.substring(0, value.indexOf(match[1]));
    const suffix = value.substring(value.indexOf(match[1]) + match[1].length);
    displayValue = `${prefix}${formatted}${suffix}`;
  }

  return (
    <span
      style={{
        fontFamily: 'DM Sans, Arial, sans-serif',
        fontSize,
        fontWeight: 700,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {displayValue}
    </span>
  );
};
