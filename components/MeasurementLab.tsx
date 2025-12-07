import React, { useState, useEffect } from 'react';
import { Complex } from '../types';

interface MeasurementLabProps {
  amplitudes: Complex[];
}

const MeasurementLab: React.FC<MeasurementLabProps> = ({ amplitudes }) => {
  const [shots, setShots] = useState(100);
  const [results, setResults] = useState<number[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [accumulate, setAccumulate] = useState(false);

  const numStates = amplitudes.length;
  const numQubits = Math.log2(numStates);
  
  // Calculate probabilities
  const probs = amplitudes.map(c => c.r * c.r + c.i * c.i);
  
  // Reset results when the theoretical state changes or numStates changes
  // Note: If accumulating, you might want to keep them, but physically if the state changes, old measurements are invalid for the new state.
  useEffect(() => {
    setResults(new Array(numStates).fill(0));
  }, [numStates, ...probs]); // Reset on state change

  const runExperiment = () => {
    setIsSimulating(true);
    
    // Cumulative Distribution for sampling
    const cdf = new Array(numStates).fill(0);
    cdf[0] = probs[0];
    for (let i = 1; i < numStates; i++) cdf[i] = cdf[i - 1] + probs[i];

    // Prepare buffer
    const currentCounts = accumulate ? [...results] : new Array(numStates).fill(0);

    // Fast simulation
    const simulate = () => {
       for (let i = 0; i < shots; i++) {
        const rand = Math.random();
        // Robust Inverse Transform Sampling
        // Default to last state to handle floating point epsilons (e.g. rand=0.99999 > cdf[last]=0.99998)
        let outcome = numStates - 1; 
        for(let j=0; j < numStates - 1; j++) {
            if(rand < cdf[j]) {
                outcome = j;
                break;
            }
        }
        currentCounts[outcome]++;
      }
      setResults(currentCounts);
      setIsSimulating(false);
    };

    // Small delay to show "Running" state
    setTimeout(simulate, 100);
  };

  const totalMeasured = results.reduce((a, b) => a + b, 0);
  const labels = Array.from({ length: numStates }, (_, i) => `|${i.toString(2).padStart(numQubits, '0')}⟩`);
  
  // Dynamic color generation
  const getColor = (idx: number) => {
      const hue = (idx / numStates) * 360;
      return `hsl(${hue}, 70%, 60%)`;
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 p-4 md:p-6 backdrop-blur-sm shadow-xl gap-4">
      
      <div className="flex justify-between items-start shrink-0">
        <div>
          <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Measurement Lab</h3>
          <p className="text-[10px] text-slate-500 mt-1">{numQubits}-Qubit System ({numStates} Outcomes)</p>
        </div>
        <div className="flex gap-2">
            <div className={`px-2 py-1 rounded text-[10px] font-mono border ${totalMeasured > 0 ? 'border-blue-500/50 text-blue-400' : 'border-slate-700 text-slate-500'}`}>
                TOTAL: {totalMeasured}
            </div>
            <div className={`px-2 py-1 rounded text-[10px] font-mono border ${isSimulating ? 'border-amber-500/50 text-amber-400 animate-pulse' : 'border-slate-700 text-slate-500'}`}>
                {isSimulating ? 'RUNNING' : 'READY'}
            </div>
        </div>
      </div>

      {/* Bar Chart Area */}
      <div className="flex-1 flex gap-1 items-end justify-center px-2 relative min-h-[150px]">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 z-0">
             {[1, 0.5, 0].map(val => (
                 <div key={val} className="w-full border-t border-slate-500 h-0 flex items-center">
                     <span className="text-[9px] text-slate-400 -ml-6 w-5 text-right">{val * 100}%</span>
                 </div>
             ))}
        </div>

        {probs.map((prob, idx) => {
            const observedProb = totalMeasured > 0 && results[idx] ? results[idx] / totalMeasured : 0;
            const barColor = getColor(idx);
            return (
                <div key={idx} className="flex-1 flex flex-col items-center z-10 group h-full justify-end">
                    <div className="relative w-full h-full flex items-end justify-center">
                        {/* Theoretical Ghost Bar */}
                        <div 
                            className="absolute bottom-0 w-[80%] border-t-2 border-x-2 border-dashed border-slate-500/30 rounded-t-sm transition-all duration-500"
                            style={{ height: `${prob * 100}%` }}
                            title={`Theoretical: ${(prob * 100).toFixed(1)}%`}
                        ></div>
                        
                        {/* Observed Solid Bar */}
                        <div 
                            className="w-[80%] rounded-t-sm transition-all duration-300 relative shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                            style={{ 
                                height: `${observedProb * 100}%`,
                                backgroundColor: barColor
                            }}
                        >
                            <div className="absolute -top-6 w-full text-center text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 drop-shadow-md">
                                {results[idx]} ({(observedProb * 100).toFixed(0)}%)
                            </div>
                        </div>
                    </div>
                    {/* Hide labels if too many, show on hover or selected ones? For now, simpler labels */}
                    <div className="mt-1 text-center w-full overflow-hidden">
                        <div className="font-mono font-bold text-[9px] md:text-[10px] text-slate-200 rotate-0 md:rotate-0 truncate">
                            {numStates > 8 ? idx.toString(2) : labels[idx]}
                        </div>
                    </div>
                </div>
            )
        })}
      </div>

      {/* Controls */}
      <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-4">
           <div className="flex-1">
               <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                  <span>Batch Size: {shots}</span>
               </div>
               <input 
                 type="range" 
                 min="10" 
                 max="1000" 
                 step="10"
                 value={shots} 
                 onChange={(e) => setShots(parseInt(e.target.value))}
                 disabled={isSimulating}
                 className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
               />
           </div>
           
           <div className="flex items-center gap-2">
               <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider cursor-pointer select-none">Collect</label>
               <div 
                 onClick={() => setAccumulate(!accumulate)}
                 className={`w-10 h-5 rounded-full p-1 cursor-pointer transition-colors ${accumulate ? 'bg-cyan-600' : 'bg-slate-700'}`}
                 title="Accumulate results over multiple runs"
               >
                 <div className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform ${accumulate ? 'translate-x-5' : 'translate-x-0'}`}></div>
               </div>
           </div>
        </div>

        <div className="flex gap-2">
            <button 
               onClick={runExperiment}
               disabled={isSimulating}
               className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-800 text-white font-bold rounded shadow-lg transition-all active:scale-[0.98] text-xs md:text-sm uppercase tracking-wider"
            >
               {isSimulating ? 'Measuring...' : 'Run Experiment'}
            </button>
            
            {accumulate && totalMeasured > 0 && (
                <button 
                   onClick={() => setResults(new Array(numStates).fill(0))}
                   disabled={isSimulating}
                   className="px-3 py-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 rounded transition-colors text-xs font-bold uppercase"
                   title="Clear collected data"
                >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default MeasurementLab;