import { AnimatePresence, motion } from 'framer-motion';
import { useConn } from '../net/connection';

export function Toasts() {
  const { toasts, dismissToast } = useConn();
  return (
    <div className="toast-stack">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className={`toast toast--${t.tone}`}
            onClick={() => dismissToast(t.id)}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
