/**
 * DataTable - Styled data table with sorting and filtering
 */
import { useState, useMemo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: number | string;
  sortable?: boolean;
  render?: (value: any, row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  rowKey: keyof T;
  maxHeight?: number;
  onRowClick?: (row: T) => void;
  selectedRow?: T | null;
  emptyMessage?: string;
  loading?: boolean;
  compact?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  rowKey,
  maxHeight = 400,
  onRowClick,
  selectedRow,
  emptyMessage = 'No data available',
  loading = false,
  compact = false,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

  const handleSort = (key: string) => {
    if (sortColumn === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(key);
      setSortDirection('asc');
    }
  };

  const padding = compact ? '8px 12px' : '12px 16px';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {columns.map((col) => (
          <div
            key={String(col.key)}
            style={{
              flex: col.width ? `0 0 ${col.width}` : 1,
              padding,
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.6)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              cursor: col.sortable ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
            }}
            onClick={() => col.sortable && handleSort(String(col.key))}
          >
            {col.header}
            {col.sortable && sortColumn === col.key && (
              <span style={{ fontSize: 10 }}>
                {sortDirection === 'asc' ? '▲' : '▼'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ maxHeight, overflow: 'auto' }}>
        {loading ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-block' }}
            >
              ⟳
            </motion.div>
            <div style={{ marginTop: 8 }}>Loading...</div>
          </div>
        ) : sortedData.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          <AnimatePresence>
            {sortedData.map((row, index) => {
              const isSelected = selectedRow && row[rowKey] === selectedRow[rowKey];

              return (
                <motion.div
                  key={String(row[rowKey])}
                  style={{
                    display: 'flex',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: isSelected ? 'rgba(0,255,136,0.1)' : 'transparent',
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onRowClick?.(row)}
                  whileHover={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  {columns.map((col) => {
                    const value = row[col.key as keyof T];
                    const content = col.render ? col.render(value, row) : String(value ?? '');

                    return (
                      <div
                        key={String(col.key)}
                        style={{
                          flex: col.width ? `0 0 ${col.width}` : 1,
                          padding,
                          fontSize: 13,
                          color: 'rgba(255,255,255,0.85)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textAlign: col.align || 'left',
                        }}
                      >
                        {content}
                      </div>
                    );
                  })}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/**
 * EventLog - Scrolling event log display
 */
interface EventLogEntry {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  level?: 'info' | 'warning' | 'error' | 'success';
}

interface EventLogProps {
  events: EventLogEntry[];
  maxEvents?: number;
  maxHeight?: number;
  showTimestamp?: boolean;
}

export function EventLog({
  events,
  maxEvents = 100,
  maxHeight = 300,
  showTimestamp = true,
}: EventLogProps) {
  const displayEvents = events.slice(-maxEvents);

  const levelColors = {
    info: 'rgba(255,255,255,0.6)',
    warning: '#ffaa00',
    error: '#ff4444',
    success: '#00ff88',
  };

  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 11,
        maxHeight,
        overflow: 'auto',
      }}
    >
      <AnimatePresence>
        {displayEvents.map((event) => (
          <motion.div
            key={event.id}
            style={{
              display: 'flex',
              gap: 8,
              padding: '6px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
          >
            {showTimestamp && (
              <span style={{ color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            )}
            <span style={{ color: levelColors[event.level || 'info'], whiteSpace: 'nowrap' }}>
              [{event.type}]
            </span>
            <span style={{ color: 'rgba(255,255,255,0.8)', flex: 1 }}>
              {event.message}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
