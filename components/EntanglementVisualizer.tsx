import React, { useMemo } from 'react';
import { Complex } from '../types';

interface EntanglementVisualizerProps {
  amplitudes: Complex[];
}

// Helper: Square Magnitude
const magSq = (c: Complex) => c.r * c.r + c.i * c.i;

// Helper: Get reduced density matrix for a subset of qubits
// Returns a matrix (2^k x 2^k) where k is number of kept qubits.
// Flat array of complex numbers.
const getReducedDensityMatrix = (amplitudes: Complex[], numQubits: number, keepIndices: number[]) => {
    const numStates = amplitudes.length;
    const keepMask = keepIndices.reduce((acc, idx) => acc | (1 << idx), 0);
    const dim = 1 << keepIndices.length;
    
    // Map full basis index to reduced basis index
    // e.g. if keep=[0, 2], full=5 (101) -> reduced=3 (11)
    const getReducedIndex = (fullIndex: number) => {
        let reduced = 0;
        keepIndices.forEach((bitPos, i) => {
            if ((fullIndex & (1 << bitPos)) !== 0) {
                reduced |= (1 << i);
            }
        });
        return reduced;
    };

    // Initialize DM
    const rho = new Array(dim * dim).fill(null).map(() => ({ r: 0, i: 0 }));

    // Iterate over all pairs of states (i, j) in the full basis
    // But we only care when trace_part(i) == trace_part(j)
    // Optimization: Iterate over trace basis 'k' and keep basis 'u', 'v'
    // This is hard to iterate directly.
    // Simpler: Iterate over full basis states i.
    // For each i, decompose into (u, k) where u is keep part, k is trace part.
    // Then iterate over full basis j. If trace part of j matches k, 
    // add amp[i] * conj(amp[j]) to rho[u, v] where v is keep part of j.
    
    // Better Optimization:
    // Iterate over all 'trace' configurations k.
    // For each k, we have a sub-vector of size 2^|keep|.
    // Add outer product of this sub-vector to rho.
    
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

// Calculate Von Neumann Entropy of a density matrix
// For 1 qubit (2x2) or 2 qubits (4x4)
// Need eigenvalues. 4x4 diagonalization is hard in JS without lib.
// Fallback: For N=4, pairwise MI requires S(rho_AB) (4x4).
// Simplification: Calculate Linear Entropy S_L = 1 - Tr(rho^2) (Purity based)
// Or just limit rigorous calculation to 1-qubit subsystems for graph nodes, 
// and approximate or skip edges if >3 qubits for now?
// Actually, let's implement rigorous diagonalization for 2x2.
// For 4x4, it's too complex for this snippet.
// However, mutual information I(A:B) = S(A) + S(B) - S(AB).
// For pure total state, S(AB) = S(CD).
// If we just use Purity (Linear Entropy) as a proxy for visualization? 
// Linear MI: I_L(A:B) = S_L(A) + S_L(B) - S_L(AB). Can be negative. Not ideal.
//
// Compromise: For N > 3, we only display Single Qubit Entropies (Nodes) and skip edges 
// to avoid expensive/complex 4x4 diagonalization, OR we assume pure state bipartitions if possible.
// But for N=4, S(AB) = S(CD). CD is also 2 qubits. Still need 4x4 eigenvalues.
//
// Revised Plan: Only show Edges for N <= 3. Show Nodes for all N.
const calculateEntropy = (rho: {r:number, i:number}[], dim: number) => {
    if (dim === 2) {
        // 2x2 exact solution
        const rho00 = rho[0].r;
        const rho11 = rho[3].r;
        const rho01 = rho[1]; // r, i
        const det = rho00 * rho11 - (rho01.r * rho01.r + rho01.i * rho01.i);
        const diff = Math.sqrt(Math.max(0, 1 - 4 * det));
        const l1 = (1 + diff) / 2;
        const l2 = (1 - diff) / 2;
        const safeLog = (x: number) => x > 1e-9 ? x * Math.log2(x) : 0;
        return -(safeLog(l1) + safeLog(l2));
    }
    // For dim > 2, return 0 (not implemented)
    return 0;
};

const EntanglementVisualizer: React.FC<EntanglementVisualizerProps> = ({ amplitudes }) => {
  const numStates = amplitudes.length;
  const numQubits = Math.log2(numStates);

  // 1. Calculate Single Qubit Entropies
  const qubitEntropies = useMemo(() => {
    const entropies: number[] = [];
    for (let q = 0; q < numQubits; q++) {
        const rho = getReducedDensityMatrix(amplitudes, numQubits, [q]);
        const s = calculateEntropy(rho, 2);
        entropies.push(Math.abs(s) < 1e-9 ? 0 : s);
    }
    return entropies;
  }, [amplitudes, numQubits, numStates]);

  // 2. Calculate Pairwise Mutual Information (Only for N <= 3)
  const mutualInfo = useMemo(() => {
    const mi: { source: number, target: number, value: number }[] = [];
    if (numQubits > 3) return mi; // Edges disabled for > 3 qubits due to 4x4 diagonalization limit

    // Generate all pairs
    for(let i=0; i<numQubits; i++) {
        for(let j=i+1; j<numQubits; j++) {
            // I(A:B) = S(A) + S(B) - S(AB)
            // If total N=3 pure, S(AB) = S(C).
            // If total N=2 pure, S(AB) = S(empty) = 0.
            let s_ab = 0;
            if (numQubits === 2) s_ab = 0;
            else if (numQubits === 3) {
                // Find k != i, j
                const k = [0,1,2].find(x => x!==i && x!==j) || 0;
                s_ab = qubitEntropies[k];
            }

            const val = Math.max(0, qubitEntropies[i] + qubitEntropies[j] - s_ab);
            mi.push({ source: i, target: j, value: val });
        }
    }
    return mi;
  }, [qubitEntropies, numQubits]);

  // Layout for Nodes (Polygon)
  const nodes = useMemo(() => {
     const res = [];
     const center = { x: 50, y: 50 };
     const radius = 35;
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
    <div className="w-full h-full flex flex-col bg-slate-900/50 rounded-xl border border-slate-800 p-4 backdrop-blur-sm">
      <div className="flex justify-between items-start mb-2">
         <div>
            <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-wider">Entanglement Graph</h3>
            <p className="text-[10px] text-slate-500">
                {numQubits > 3 ? "Pairwise correlation hidden (N>3)" : "Mutual Information & Entropy"}
            </p>
         </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
         <svg viewBox="0 0 100 100" className="w-full h-full max-w-[240px] max-h-[240px] overflow-visible">
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
                     strokeWidth={strength * 4}
                     strokeLinecap="round"
                     className="opacity-60 transition-all duration-500"
                   >
                   </line>
                   {/* MI Label */}
                   <rect 
                      x={(n1.x + n2.x)/2 - 7} y={(n1.y + n2.y)/2 - 3} 
                      width="14" height="6" rx="1" 
                      fill="#0f172a" stroke="#334155" strokeWidth="0.5"
                   />
                   <text 
                     x={(n1.x + n2.x)/2} y={(n1.y + n2.y)/2} 
                     dy="2" 
                     textAnchor="middle" 
                     fontSize="3" 
                     fill="#94a3b8" 
                     fontWeight="bold"
                   >
                     {strength.toFixed(2)}
                   </text>
                 </g>
               );
            })}
            
            {/* Nodes */}
            {nodes.map((node, i) => {
               const entropy = qubitEntropies[i] || 0; 
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
                    
                    <text x={node.x} y={node.y + 11} textAnchor="middle" fontSize="3" fill="#64748b" fontFamily="monospace">
                       S={entropy.toFixed(2)}
                    </text>
                 </g>
               )
            })}
         </svg>
      </div>
    </div>
  );
};

export default EntanglementVisualizer;