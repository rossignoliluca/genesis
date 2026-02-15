/**
 * Remotion Root — Registers all compositions for the video pipeline.
 */

import React from 'react';
import { Composition } from 'remotion';
import { WeeklyReport } from './compositions/WeeklyReport';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="WeeklyReport"
        component={WeeklyReport}
        // Defaults — overridden at render time via selectComposition
        durationInFrames={2700} // ~90s at 30fps
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          specPath: '/tmp/video-props.json',
        }}
      />
    </>
  );
};
