/**
 * BrandBar — Persistent header/footer brand element for video.
 */

import React from 'react';

interface BrandBarProps {
  company?: string;
  date?: string;
  position?: 'top' | 'bottom';
}

export const BrandBar: React.FC<BrandBarProps> = ({
  company = 'Rossignoli & Partners',
  date = '',
  position = 'bottom',
}) => {
  const isTop = position === 'top';

  return (
    <div
      style={{
        position: 'absolute',
        [isTop ? 'top' : 'bottom']: 0,
        left: 0,
        right: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 86px',
        borderTop: isTop ? 'none' : '1px solid #D5D8DC',
        borderBottom: isTop ? '1px solid #D5D8DC' : 'none',
        background: 'rgba(255,255,255,0.95)',
        zIndex: 50,
      }}
    >
      <span
        style={{
          fontFamily: 'DM Sans, Arial',
          fontSize: 11,
          fontWeight: 700,
          color: '#2C3E50',
        }}
      >
        {company}
      </span>
      <span
        style={{
          fontFamily: 'Inter, Arial',
          fontSize: 11,
          color: '#6B7B8D',
        }}
      >
        {date}
      </span>
    </div>
  );
};
