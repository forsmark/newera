import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  return (
    <div className="fixed top-14 right-4 flex flex-col gap-2 z-[500]">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
            className="px-4 py-[0.625rem] rounded-lg text-sm shadow-[0_4px_12px_rgba(0,0,0,0.3)] max-w-[320px]"
            style={{
              background: t.type === 'error' ? '#450a0a' : '#1e293b',
              border: `1px solid ${t.type === 'error' ? '#7f1d1d' : '#334155'}`,
              color: t.type === 'error' ? '#fca5a5' : '#f1f5f9',
            }}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
