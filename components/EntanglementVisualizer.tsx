
import React, { useMemo } from 'react';
import { Complex } from '../types';

interface EntanglementVisualizerProps {
  amplitudes: Complex[];
}

// Helper: Square Magnitude
const magSq = (c: Complex) => c.r * c.r + c.i * c.i;

// Helper: Get reduced density matrix for a subset of qubits
// Returns a matrix (2^k x 2^k) where k is number of kept qubits.
const getReducedDensityMatrix = (amplitudes: Complex[], numQubits: number, keepIndices: number[]) => {
    const numStates = amplitudes.length;
    const dim = 1 << keepIndices.length;
    
    // Initialize DM
    const rho = new Array(dim * dim).fill(null).map(() => ({ r: 0, i: 0 }));

    const traceIndices = [];
    for(let q=0; q<numQubits; q++) if(!keepIndices.includes(q)) traceIndices.push(q);
    
    const traceDim = 1 << traceIndices.length;
    
    for (let k = 0; k < traceDim; k++) {
        // Construct the trace part mask
        let traceVal = 0;
        traceIndices.forEach((bitPos, i) => {
             if ((k & (1 << i)) !== 0) traceVal |= (1 << bitPos);
        });

        // Now iterate u and v (indices in reduced space)
        for (let u = 0; u < dim; u++) {
            // Reconstruct full index for u
            let fullU = traceVal;
            keepIndices.forEach((bitPos, i) => {
                if ((u & (1 << i)) !== 0) fullU |= (1 << bitPos);
            });
            const ampU = amplitudes[fullU] || {r:0, i:0};

            for (let v = 0; v < dim; v++) {
                 // Reconstruct full index for v
                 let fullV = traceVal;
                 keepIndices.forEach((bitPos, i) => {
                    if ((v & (1 << i)) !== 0) fullV |= (1 << bitPos);
                 });
                 const ampV = amplitudes[fullV] || {r:0, i:0};
                 
                 // rho[u,v] += ampU * conj(ampV)
                 const idx = u * dim + v;
                 rho[idx].r += ampU.r * ampV.r + ampU.i * ampV.i;
                 rho[idx].i += ampU.i * ampV.r - ampU.r * ampV.i;
            }
        }
    }
    return rho;
};

// Calculate 2x2 Matrix Eigenvalues (Probabilities)
const calculateEigenvalues = (rho: {r:number, i:number}[]) => {
    const rho00 = rho[0].r;
    const rho11 = rho[3].r;
    const rho01 = rho[1]; // r, i
    const det = rho00 * rho11 - (rho01.r * rho01.r + rho01.i * rho01.i);
    const diff = Math.sqrt(Math.max(0, 1 - 4 * det)); // 1 comes from Trace=1
    const l1 = (1 + diff) / 2;
    const l2 = (1 - diff) / 2;
    return [l1, l2];
};

const calculateEntropy = (eigenvalues: number[]) => {
    const safeLog = (x: number) => x > 1e-9 ? x * Math.log2(x) : 0;
    return -(safeLog(eigenvalues[0]) + safeLog(eigenvalues[1]));
};

const EntanglementVisualizer: React.FC<EntanglementVisualizerProps> = ({ amplitudes }) => {
  const numStates = amplitudes.length;
  const numQubits = Math.log2(numStates);

  // 1. Calculate Single Qubit Entropies & Eigenvalues
  const qubitData = useMemo(() => {
    const data = [];
    for (let q = 0; q < numQubits; q++) {
        const rho = getReducedDensityMatrix(amplitudes, numQubits, [q]);
        const eig = calculateEigenvalues(rho);
        const s = calculateEntropy(eig);
        data.push({
            id: q,
            entropy: Math.abs(s) < 1e-9 ? 0 : s,
            eigenvalues: eig
        });
    }
    return data;
  }, [amplitudes, numQubits, numStates]);

  // 2. Calculate Pairwise Mutual Information (Only for N <= 3)
  const mutualInfo = useMemo(() => {
    const mi: { source: number, target: number, value: number }[] = [];
    if (numQubits > 3) return mi; 

    for(let i=0; i<numQubits; i++) {
        for(let j=i+1; j<numQubits; j++) {
            let s_ab = 0;
            if (numQubits === 2) s_ab = 0;
            else if (numQubits === 3) {
                const k = [0,1,2].find(x => x!==i && x!==j) || 0;
                s_ab = qubitData[k].entropy;
            }
            const val = Math.max(0, qubitData[i].entropy + qubitData[j].entropy - s_ab);
            mi.push({ source: i, target: j, value: val });
        }
    }
    return mi;
  }, [qubitData, numQubits]);

  // 3. Bell State & CHSH Analysis (Specific for 2 Qubits)
  const bellAnalysis = useMemo(() => {
      if (numQubits !== 2) return null;
      
      const entropy = qubitData[0].entropy;
      const eig = qubitData[0].eigenvalues;
      const l1 = eig[0];
      const l2 = eig[1];
      
      // Concurrence C = 2 * sqrt(l1 * l2) for pure states
      const concurrence = 2 * Math.sqrt(l1 * l2);
      
      // Max CHSH violation S = 2 * sqrt(1 + C^2)
      const chsh = 2 * Math.sqrt(1 + concurrence * concurrence);
      
      let bellStateName = "";
      if (concurrence > 0.99) {
          // Identify specific Bell State
          // Check phases
          // Phi+: 00 + 11, Phi-: 00 - 11, Psi+: 01 + 10, Psi-: 01 - 10
          const a00 = amplitudes[0];
          const a01 = amplitudes[1];
          const a10 = amplitudes[2];
          const a11 = amplitudes[3];
          
          if (magSq(a00) > 0.4 && magSq(a11) > 0.4) {
              const phaseDiff = Math.atan2(a00.i*a11.r - a00.r*a11.i, a00.r*a11.r + a00.i*a11.i);
              bellStateName = Math.abs(phaseDiff) < 0.1 ? "|Φ⁺⟩" : "|Φ⁻⟩";
          } else if (magSq(a01) > 0.4 && magSq(a10) > 0.4) {
              const phaseDiff = Math.atan2(a01.i*a10.r - a01.r*a10.i, a01.r*a10.r + a01.i*a10.i);
              bellStateName = Math.abs(phaseDiff) < 0.1 ? "|Ψ⁺⟩" : "|Ψ⁻⟩";
          }
      }

      return { concurrence, chsh, bellStateName, eigenvalues: eig };
  }, [amplitudes, numQubits, qubitData]);

  // Layout for Nodes (Polygon)
  const nodes = useMemo(() => {
     const res = [];
     const center = { x: 50, y: 50 };
     const radius = 30;
     for(let i=0; i<numQubits; i++) {
         const angle = (i / numQubits) * 2 * Math.PI - Math.PI/2;
         res.push({
             id: i,
             x: center.x + radius * Math.cos(angle),
             y: center.y + radius * Math.sin(angle)
         });
     }
     return res;
  }, [numQubits]);

  if (numQubits < 2) {
    return <div className="text-slate-500 text-xs p-4 text-center">Need 2+ qubits for entanglement.</div>;
  }

  return (
    <div className="w-full h-full flex gap-4 p-2 overflow-hidden">
        
        {/* Left Panel: Graph */}
        <div className="flex-1 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 p-4 backdrop-blur-sm relative items-center justify-center">
            <h3 className="absolute top-3 left-3 text-slate-200 font-semibold text-xs uppercase tracking-wider">Topology</h3>
            <svg viewBox="0 0 100 100" className="w-full h-full max-w-[200px] max-h-[200px] overflow-visible">
                <defs>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                    <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <linearGradient id="gradientEdge" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
                </defs>

                {/* Edges */}
                {mutualInfo.map((link, idx) => {
                const n1 = nodes[link.source];
                const n2 = nodes[link.target];
                const strength = link.value; 
                if (strength < 0.01) return null;
                
                return (
                    <g key={`edge-${idx}`}>
                    <line 
                        x1={n1.x} y1={n1.y} 
                        x2={n2.x} y2={n2.y} 
                        stroke="url(#gradientEdge)"
                        strokeWidth={Math.min(strength * 4, 6)}
                        strokeLinecap="round"
                        className="opacity-60 transition-all duration-500"
                    />
                    </g>
                );
                })}
                
                {/* Nodes */}
                {nodes.map((node, i) => {
                const entropy = qubitData[i].entropy; 
                const isEntangled = entropy > 0.01;
                const glowColor = isEntangled ? "#e879f9" : "#334155";
                
                return (
                    <g key={`node-${i}`} className="transition-all duration-500">
                        <circle 
                        cx={node.x} cy={node.y} 
                        r={6 + entropy * 3} 
                        fill="none" 
                        stroke={glowColor} 
                        strokeWidth="0.5"
                        opacity={0.5 + entropy * 0.5}
                        filter={isEntangled ? "url(#glow)" : ""}
                        />
                        
                        <circle cx={node.x} cy={node.y} r="6" fill="#1e293b" stroke={isEntangled ? "#c084fc" : "#475569"} strokeWidth="1.5" />
                        <text x={node.x} y={node.y} dy="1.5" textAnchor="middle" fontSize="5" fill="#e2e8f0" fontWeight="bold">q{i}</text>
                    </g>
                )
                })}
            </svg>
            <div className="absolute bottom-2 text-[9px] text-slate-500 text-center w-full">
                Node size ∝ Von Neumann Entropy S(ρ)
            </div>
        </div>

        {/* Right Panel: Bell Analysis (Only for 2 Qubits) */}
        {bellAnalysis && (
            <div className="flex-1 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 p-4 backdrop-blur-sm overflow-y-auto custom-scrollbar">
                <h3 className="text-slate-200 font-semibold text-xs uppercase tracking-wider mb-4 border-b border-slate-700/50 pb-2">Bell Test Lab</h3>
                
                {/* Bell State Badge */}
                {bellAnalysis.bellStateName ? (
                    <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-3 mb-4 flex items-center justify-between animate-in zoom-in">
                        <div>
                            <div className="text-[10px] text-purple-300 font-bold uppercase">Detected State</div>
                            <div className="text-lg font-mono font-bold text-white">{bellAnalysis.bellStateName}</div>
                        </div>
                        <div className="text-2xl">🔔</div>
                    </div>
                ) : (
                    <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-3 mb-4">
                        <div className="text-[10px] text-slate-500 font-bold uppercase">State Type</div>
                        <div className="text-sm font-bold text-slate-300">
                            {bellAnalysis.concurrence < 0.01 ? "Separable (Product State)" : "Partial Entanglement"}
                        </div>
                    </div>
                )}

                {/* Schmidt Decomposition */}
                <div className="mb-4">
                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Schmidt Probabilities (λ²)</div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-slate-800">
                        <div className="bg-cyan-500 transition-all duration-500" style={{ width: `${bellAnalysis.eigenvalues[0] * 100}%` }}></div>
                        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${bellAnalysis.eigenvalues[1] * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
                        <span>λ₀² = {bellAnalysis.eigenvalues[0].toFixed(3)}</span>
                        <span>λ₁² = {bellAnalysis.eigenvalues[1].toFixed(3)}</span>
                    </div>
                </div>

                {/* CHSH Meter */}
                <div>
                    <div className="flex justify-between items-end mb-1">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">CHSH Violation (S)</div>
                        <div className={`text-xs font-mono font-bold ${bellAnalysis.chsh > 2.01 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {bellAnalysis.chsh.toFixed(3)}
                        </div>
                    </div>
                    
                    <div className="relative h-6 bg-slate-800 rounded w-full mt-1 border border-slate-700">
                        {/* Classical Limit Line at 2.0 */}
                        <div className="absolute top-0 bottom-0 w-px bg-white z-10" style={{ left: `${(2.0 / 2.828) * 100}%` }}></div>
                        <div className="absolute -top-3 text-[8px] text-white font-bold -translate-x-1/2" style={{ left: `${(2.0 / 2.828) * 100}%` }}>2.0</div>
                        
                        {/* Bar */}
                        <div 
                            className={`h-full rounded transition-all duration-500 ${bellAnalysis.chsh > 2 ? 'bg-gradient-to-r from-cyan-600 to-emerald-500' : 'bg-slate-600'}`}
                            style={{ width: `${(bellAnalysis.chsh / 2.828) * 100}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-[8px] text-slate-500 mt-1">
                        <span>0</span>
                        <span>Local Realism Limit</span>
                        <span>2√2 (QM Max)</span>
                    </div>
                    
                    {bellAnalysis.chsh > 2.01 && (
                        <div className="mt-2 text-[9px] text-emerald-400 text-center bg-emerald-900/20 p-1 rounded border border-emerald-900/50">
                            Violates Local Realism
                        </div>
                    )}
                </div>

            </div>
        )}
    </div>
  );
};

export default EntanglementVisualizer;
