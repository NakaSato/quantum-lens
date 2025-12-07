import React, { useEffect, useRef } from 'react';
import { GateType } from '../types';

interface DraggableGate {
  id: GateType;
  label: string;
  color: string;
}

interface GateSelectorProps {
  x: number;
  y: number;
  palette: DraggableGate[];
  onSelect: (gate: GateType | 'DELETE') => void;
  onClose: () => void;
}

const GateSelector: React.FC<GateSelectorProps> = ({ x, y, palette, onSelect, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    // Use mousedown to capture the start of a click outside
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Ensure menu doesn't go off screen (basic bounds checking)
  const adjustedX = Math.min(x, window.innerWidth - 280);
  const adjustedY = Math.min(y, window.innerHeight - 350);

  return (
    <div 
      ref={menuRef}
      style={{ top: adjustedY, left: adjustedX }}
      className="fixed z-[100] w-64 bg-[#1e293b]/95 backdrop-blur-md border border-slate-600/50 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700/50 flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Quantum Ops</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      
      <div className="p-3 grid grid-cols-4 gap-2">
         {palette.map(gate => (
           <button
             key={gate.id}
             onClick={() => onSelect(gate.id)}
             className={`aspect-square ${gate.color} rounded-md shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center text-white font-bold text-sm`}
             title={gate.label}
           >
             {gate.id === 'CX' ? '⊕' : gate.id}
           </button>
         ))}
      </div>

      <div className="bg-slate-900/30 p-2 border-t border-slate-700/50">
         <button 
           onClick={() => onSelect('DELETE')}
           className="w-full py-2 flex items-center justify-center gap-2 text-rose-400 hover:bg-rose-500/10 rounded border border-transparent hover:border-rose-500/20 transition-all text-xs font-bold uppercase tracking-wider"
         >
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
           Clear Cell
         </button>
      </div>
    </div>
  );
};

export default GateSelector;