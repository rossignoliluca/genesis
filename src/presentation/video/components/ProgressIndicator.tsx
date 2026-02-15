/**
 * ProgressIndicator — Section progress bar for video.
 */

import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

interface ProgressIndicatorProps {
  /** Total frames in the composition */
  totalFrames: number;
  /** Color of the progress bar */
  color?: string;
  /** Height in pixels */
  height?: number;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  totalFrames,
  color = '#E8792B',
  height = 3,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, totalFrames], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: `${progress}%`,
        height,
        background: color,
        zIndex: 200,
      }}
    />
  );
};
