import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface TimerProps { initialSeconds: number; onExpire?: () => void; }
export const Timer: React.FC<TimerProps> = ({ initialSeconds, onExpire }) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  useEffect(() => {
    // Elapsed wall time catches up after background throttling or sleep.
    const deadline = Date.now() + initialSeconds * 1000;
    let fired = false;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !fired) { fired = true; onExpireRef.current?.(); }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [initialSeconds]);
  const formatted = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  return <div role="timer" aria-label={`${secondsLeft} seconds remaining`} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm font-semibold border ${secondsLeft <= 60 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}><Clock className="w-4 h-4" /><span>{formatted}</span></div>;
};
