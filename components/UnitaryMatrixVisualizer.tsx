
import React, { useMemo } from 'react';
import { Complex, Gate } from '../types';

interface UnitaryMatrixVisualizerProps {
  gates: Gate[];
  numQubits: number;
}

// Math Helpers
const zero: Complex = { r: 0, i: 0 };
const one: Complex = { r: 1, i: 0 };
const add = (a: Complex, b: Complex): Complex => ({ r: a.r + b.r, i: a.i + b.i });
const mul = (a: Complex, b: Complex): Complex => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r });
const mulS = (a: Complex, s: number): Complex => ({ r: a.r * s, i: a.i * s });

const UnitaryMatrixVisualizer: React.FC<UnitaryMatrixVisualizerProps> = ({ gates, numQubits }) => {
  const dim = 1 << numQubits;

  const matrix = useMemo(() => {
    // We compute the matrix by acting the circuit on each basis state |k>
    // The result |psi_k> corresponds to the k-th column of the Unitary U.
    const cols: Complex[][] = [];

    const INV_SQRT_2 = 1 / Math.sqrt(2);

    // Re-implement simulation logic locally for matrix construction
    const runSimulation = (initialState: Complex[]) => {
       let state = [...initialState];
       const halfStates = dim / 2;

       const applyGate = (u00: Complex, u01: Complex, u10: Complex, u11: Complex, target: number) => {
           const newState = [...state];
           for (let i = 0; i < halfStates; i++) {
               const lowMask = (1 << target) - 1;
               const low = i & lowMask;
               const high = (i & ~lowMask) << 1;
               const idx0 = high | low;
               const idx1 = idx0 | (1 << target);
               const a0 = state[idx0];
               const a1 = state[idx1];
               newState[idx0] = add(mul(u00, a0), mul(u01, a1));
               newState[idx1] = add(mul(u10, a0), mul(u11, a1));
           }
           state = newState;
       };

       const applyControlledGate = (type: string, ctrl: number, tgt: number) => {
            const newState = [...state];
            for (let i = 0; i < halfStates; i++) {
                const lowMask = (1 << tgt) - 1;
                const low = i & lowMask;
                const high = (i & ~lowMask) << 1;
                const idx0 = high | low;
                const idx1 = idx0 | (1 << tgt);
                // Check if control bit is set in the index
                // Note: We check the index bits to see if control is active
                const isControlSet = (idx0 & (1 << ctrl)) !== 0;

                if (isControlSet) {
                     const a0 = state[idx0];
                     const a1 = state[idx1];
                     if (type === 'CX') {
                         newState[idx0] = a1; newState[idx1] = a0;
                     } else if (type === 'CZ') {
                         newState[idx1] = mulS(a1, -1);
                     } else if (type === 'CY') {
                         newState[idx0] = { r: a1.i, i: -a1.r }; 
                         newState[idx1] = { r: -a0.i, i: a0.r };
                     } else if (type === 'CS') {
                         newState[idx1] = { r: -a1.i, i: a1.r };
                     }
                }
            }
            state = newState;
       };

       gates.forEach(gate => {
           const T = gate.target;
           const C = gate.control;
           if (T >= numQubits || (C !== undefined && C >= numQubits)) return;

           if (gate.type === 'H') applyGate({r: INV_SQRT_2, i:0}, {r: INV_SQRT_2, i:0}, {r: INV_SQRT_2, i:0}, {r: -INV_SQRT_2, i:0}, T);
           else if (gate.type === 'X') applyGate(zero, one, one, zero, T);
           else if (gate.type === 'Y') applyGate(zero, {r:0, i:-1}, {r:0, i:1}, zero, T);
           else if (gate.type === 'Z') applyGate(one, zero, zero, {r:-1, i:0}, T);
           else if (gate.type === 'S') applyGate(one, zero, zero, {r:0, i:1}, T);
           else if (gate.type === 'T') {
               const val = { r: Math.cos(Math.PI/4), i: Math.sin(Math.PI/4) };
               applyGate(one, zero, zero, val, T);
           } else if (C !== undefined) {
               applyControlledGate(gate.type, C, T);
           }
       });
       return state;
    };

    // Build columns
    for(let k=0; k<dim; k++) {
        const basisVector = new Array(dim).fill(zero);
        basisVector[k] = one;
        cols.push(runSimulation(basisVector));
    }
    return cols;
  }, [gates, numQubits, dim]);

  if (numQubits > 5) {
      return <div className="text-slate-500 text-xs p-8 text-center flex items-center justify-center h-full">Matrix too large to visualize ({dim}x{dim}). Reduce qubits to ≤ 5.</div>;
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 p-4 backdrop-blur-sm">
      <div className="flex justify-between items-start mb-4">
         <div>
            <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Unitary Operator (U)</h3>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                Dimension: {dim}x{dim} • Evolution: |ψ(t)⟩ = U|ψ(0)⟩
            </p>
         </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar relative">
         <div 
            className="grid gap-1"
            style={{ 
                gridTemplateColumns: `repeat(${dim}, minmax(0, 1fr))`,
                width: 'fit-content',
                minWidth: '100%'
            }}
         >
            {/* Render Columns (which correspond to output states for each input basis) */}
            {/* But CSS Grid fills rows first. We need to transpose visual loop to fill Row 0 (Col 0..N), Row 1... */}
            {Array.from({ length: dim }).map((_, rowIdx) => (
                <React.Fragment key={`row-${rowIdx}`}>
                    {Array.from({ length: dim }).map((_, colIdx) => {
                        const val = matrix[colIdx][rowIdx]; // Matrix[row][col] is accessed via col-vector[row]
                        const magSq = val.r * val.r + val.i * val.i;
                        const opacity = Math.min(1, magSq);
                        
                        // Phase color
                        const phase = Math.atan2(val.i, val.r);
                        const hue = ((phase * 180 / Math.PI) + 360) % 360;
                        const color = `hsl(${hue}, 70%, 60%)`;
                        
                        return (
                            <div 
                                key={`${rowIdx}-${colIdx}`}
                                className="aspect-square bg-slate-950 border border-slate-800/50 relative flex items-center justify-center group rounded-sm"
                                title={`Row ${rowIdx} | Col ${colIdx}\nValue: ${val.r.toFixed(3)} ${val.i>=0?'+':''}${val.i.toFixed(3)}i\nMag²: ${magSq.toFixed(3)}`}
                            >
                                {magSq > 0.001 && (
                                    <div 
                                        className="w-3/4 h-3/4 rounded-full transition-all duration-300"
                                        style={{ 
                                            backgroundColor: color, 
                                            opacity: 0.3 + (opacity * 0.7),
                                            transform: `scale(${0.3 + 0.7 * Math.sqrt(opacity)})`
                                        }}
                                    />
                                )}
                                <span className="absolute text-[8px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 z-10 bg-black/80 px-1 rounded pointer-events-none whitespace-nowrap">
                                    {val.r.toFixed(2)}{val.i >= 0 ? '+' : ''}{val.i.toFixed(2)}i
                                </span>
                            </div>
                        );
                    })}
                </React.Fragment>
            ))}
         </div>
         
         {/* Axis Labels */}
         <div className="absolute top-0 left-0 bottom-0 -ml-6 flex flex-col justify-between py-2 text-[8px] font-mono text-slate-600">
             {Array.from({length: dim}).map((_, i) => (
                 <div key={i} className="flex-1 flex items-center justify-end pr-2">|{i.toString(2).padStart(numQubits, '0')}⟩</div>
             ))}
         </div>
      </div>
      
      <div className="mt-2 flex justify-between items-center text-[9px] text-slate-500 font-mono">
          <div>Rows: Output Basis</div>
          <div>Cols: Input Basis</div>
      </div>
    </div>
  );
};

export default UnitaryMatrixVisualizer;
