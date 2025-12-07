import React, { useState } from 'react';
import { Complex } from '../types';

interface StatevectorVisualizerProps {
  amplitudes: Complex[];
}

const StatevectorVisualizer: React.FC<StatevectorVisualizerProps> = ({ amplitudes }) => {
  const [showAll, setShowAll] = useState(false);
  
  const numQubits = Math.log2(amplitudes.length);
  const labels = Array.from({ length: amplitudes.length }, (_, i) => {
    return `|${i.toString(2).padStart(numQubits, '0')}⟩`;
  });

  const calculateProb = (c: Complex) => c.r * c.r + c.i * c.i;
  const calculatePhase = (c: Complex) => Math.atan2(c.i, c.r);
  
  const formatComplex = (c: Complex) => {
    const rs = c.r.toFixed(3);
    const is = Math.abs(c.i).toFixed(3);
    const sign = c.i >= 0 ? '+' : '-';
    return `${rs} ${sign} ${is}i`;
  };

  // Prepare data items
  const items = amplitudes.map((amp, idx) => {
      const prob = calculateProb(amp);
      return { amp, idx, prob, phase: calculatePhase(amp) };
  });

  // Filter for display based on toggle
  const displayedItems = showAll 
    ? items 
    : items.filter(item => item.prob > 0.0001);

  // Fallback: If simulation is zeroed out or glitch, show all, 
  // or if strictly |0> and only one item, that's fine.
  // Ideally if displayedItems is empty (e.g. all 0), show items.
  const listToRender = displayedItems.length > 0 ? displayedItems : items;

  const nonZeroAmps = items.filter(a => a.prob > 0.0001);

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 p-4 backdrop-blur-sm">
      <div className="mb-3 flex justify-between items-end shrink-0">
        <div>
           <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Statevector</h3>
           <p className="text-[10px] text-slate-500 font-mono mt-0.5">{numQubits} Qubits • {amplitudes.length} Amplitudes</p>
        </div>
        <button 
           onClick={() => setShowAll(!showAll)}
           className={`text-[10px] px-2 py-1 rounded border transition-colors ${showAll ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
        >
            {showAll ? "Hide Zero Prob" : "Show All States"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
        {listToRender.map(({ amp, idx, prob, phase }) => {
          const isSignificant = prob > 0.001;
          const percentage = (prob * 100).toFixed(1);
          
          // Phase coloring
          // Map phase (-PI to PI) to Hue (0-360)
          // 0 (Real+) -> 0 (Red)
          // PI/2 (Imag+) -> 90 (Green)
          // PI (Real-) -> 180 (Cyan)
          // -PI/2 (Imag-) -> 270 (Purple)
          let hue = (phase * 180) / Math.PI;
          if (hue < 0) hue += 360;
          const phaseColor = `hsl(${hue}, 80%, 60%)`;

          return (
            <div key={idx} className={`relative group flex items-center p-1.5 border border-slate-800/50 rounded-md bg-slate-900/30 hover:border-slate-700 hover:bg-slate-800/50 transition-all ${!isSignificant && showAll ? 'opacity-40' : ''}`}>
              
              {/* Probability Background Bar */}
              <div 
                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-md transition-all duration-300 pointer-events-none" 
                style={{ width: `${Math.min(prob * 100, 100)}%` }}
              />

              {/* Basis Label */}
              <div className="w-16 flex items-center gap-2 mr-3 shrink-0">
                 <div className="w-5 text-[9px] text-slate-500 text-right font-mono">{idx}</div>
                 <div className="px-1.5 py-0.5 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] font-bold text-slate-200 tracking-tight">
                    {labels[idx]}
                 </div>
              </div>

              {/* Data Display */}
              <div className="flex-1 flex justify-between items-center overflow-hidden min-w-0">
                 <div className="font-mono text-[10px] text-cyan-300 truncate mr-2" title={formatComplex(amp)}>
                    {formatComplex(amp)}
                 </div>
                 
                 <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-mono text-[10px] font-bold w-9 text-right ${prob > 0.01 ? 'text-white' : 'text-slate-500'}`}>
                       {percentage}%
                    </span>
                    
                    {/* Compact Phase Indicator */}
                    <div className="w-5 h-5 rounded-full border border-slate-700 bg-slate-950 flex items-center justify-center relative shadow-sm" title={`Phase: ${(phase/Math.PI).toFixed(2)}π`}>
                        <div 
                           className="absolute w-2 h-[1.5px] origin-left left-1/2 rounded-full"
                           style={{ transform: `rotate(${-phase}rad)`, backgroundColor: phaseColor }}
                        />
                        <div 
                           className="absolute w-1 h-1 rounded-full"
                           style={{ backgroundColor: phaseColor }}
                        />
                    </div>
                 </div>
              </div>
            </div>
          );
        })}
        
        {listToRender.length === 0 && (
            <div className="text-center text-xs text-slate-500 italic mt-4">No active states.</div>
        )}
      </div>

      {/* Math Notation Footer */}
      <div className="mt-3 p-2 bg-slate-950/80 rounded border border-slate-800 text-center overflow-x-auto custom-scrollbar shrink-0 h-10 flex items-center justify-center">
         <div className="font-serif italic text-slate-400 text-xs whitespace-nowrap px-2">
           |ψ⟩ = {nonZeroAmps.length === 0 ? "0" : nonZeroAmps.map((a, i) => (
             <span key={i}>
               {i > 0 && " + "}
               <span style={{ color: `hsl(${((a.phase * 180 / Math.PI) < 0 ? (a.phase * 180 / Math.PI) + 360 : (a.phase * 180 / Math.PI))}, 70%, 70%)` }}>
                 ({a.amp.r.toFixed(2)}{a.amp.i >= 0 ? '+' : ''}{a.amp.i.toFixed(2)}i)
               </span>
               <span className="text-slate-200 ml-0.5">{labels[a.idx]}</span>
             </span>
           ))}
         </div>
      </div>
    </div>
  );
};

export default StatevectorVisualizer;