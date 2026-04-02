import { useEffect, useState } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'error' | 'info';
}

let _addToast: ((msg: string, type: ToastItem['type']) => void) | null = null;
let _nextId = 0;

export function toast(message: string, type: ToastItem['type'] = 'error') {
  _addToast?.(message, type);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    _addToast = (message, type) => {
      const id = _nextId++;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    };
    return () => { _addToast = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '3.5rem',
      right: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      zIndex: 500,
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            padding: '0.625rem 1rem',
            borderRadius: '0.5rem',
            background: t.type === 'error' ? '#450a0a' : '#1e293b',
            border: `1px solid ${t.type === 'error' ? '#7f1d1d' : '#334155'}`,
            color: t.type === 'error' ? '#fca5a5' : '#f1f5f9',
            fontSize: '0.875rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            maxWidth: '320px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
