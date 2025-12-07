import React from 'react';
import { Complex } from '../types';

interface PolarPlotVisualizerProps {
  amplitudes: Complex[];
}

const PolarPlotVisualizer: React.FC<PolarPlotVisualizerProps> = ({ amplitudes }) => {
  const numStates = amplitudes.length;
  const numQubits = Math.log2(numStates);
  const labels = Array.from({ length: numStates }, (_, i) => `|${i.toString(2).padStart(numQubits, '0')}⟩`);
  
  const getColor = (idx: number) => {
      const hue = (idx / numStates) * 360;
      return `hsl(${hue}, 70%, 60%)`;
  };

  // Adjust grid columns based on count
  const gridCols = numStates <= 4 ? 'grid-cols-2' : numStates <= 8 ? 'grid-cols-4' : 'grid-cols-4 md:grid-cols-4';

  return (
    <div className="w-full h-full flex flex-col items-center p-4 overflow-y-auto custom-scrollbar">
      <div className="w-full bg-slate-900/50 rounded-xl border border-slate-800 p-6 backdrop-blur-sm">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Phasor Diagram</h3>
            <div className="text-[10px] text-slate-500 font-mono text-right">
                Amplitude & Phase
            </div>
        </div>
        
        <div className={`grid ${gridCols} gap-4`}>
          {amplitudes.map((amp, idx) => {
             const mag = Math.sqrt(amp.r * amp.r + amp.i * amp.i);
             const phase = Math.atan2(amp.i, amp.r); // -PI to PI
             const color = getColor(idx);
             
             // SVG Configuration
             const size = 80;
             const center = size / 2;
             const maxRadius = (size / 2) - 2;
             
             const r = Math.min(mag, 1) * maxRadius;
             // SVG Y is down, so we subtract sin(phase) for Y
             const x = center + r * Math.cos(phase);
             const y = center - r * Math.sin(phase);

             return (
               <div key={idx} className="flex flex-col items-center group">
                  <div className="relative mb-2">
                    <svg width={size} height={size} className="overflow-visible">
                      {/* Unit Circle Background */}
                      <circle cx={center} cy={center} r={maxRadius} fill="#0f172a" stroke="#334155" strokeWidth="1" />
                      <circle cx={center} cy={center} r={maxRadius * 0.5} fill="none" stroke="#1e293b" strokeDasharray="3 3" />
                      
                      {/* Axes */}
                      <line x1={center} y1={2} x2={center} y2={size-2} stroke="#1e293b" />
                      <line x1={2} y1={center} x2={size-2} y2={center} stroke="#1e293b" />

                      {/* Vector */}
                      {mag > 0.01 && (
                        <>
                          <line x1={center} y1={center} x2={x} y2={y} stroke={color} strokeWidth="2" strokeLinecap="round" />
                          <circle cx={x} cy={y} r="3" fill={color} />
                        </>
                      )}
                      
                      {/* Center Point */}
                      <circle cx={center} cy={center} r={1.5} fill="#475569" />
                    </svg>
                    
                    {/* Basis Label Badge */}
                    <div className="absolute -top-1 -left-1 bg-slate-950/80 border border-slate-800 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold text-slate-300">
                      {labels[idx]}
                    </div>
                  </div>

                  {/* Numerical Data */}
                  <div className="text-center font-mono text-[9px]">
                    <div style={{ color: color }} className="font-semibold">
                      {mag.toFixed(2)}
                    </div>
                  </div>
               </div>
             )
          })}
        </div>
      </div>
    </div>
  );
};

export default PolarPlotVisualizer;