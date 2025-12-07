import React, { useState } from 'react';
import { Gate } from '../types';
import { solveQuantumProblem, QuantumAlgorithmSolution } from '../services/geminiService';

interface QuantumSolverProps {
  onLoadGates: (gates: Gate[]) => void;
}

const PRESETS = [
  "Solve x OR y = 1 (find states)",
  "Grover's Search for value 3 (binary 11)",
  "Create a GHZ Entangled State for 4 qubits",
  "Teleport state from q0 to q2",
  "Find x where x^2 = 1 (modulo 3)"
];

const QuantumSolver: React.FC<QuantumSolverProps> = ({ onLoadGates }) => {
  const [input, setInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [solution, setSolution] = useState<QuantumAlgorithmSolution | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSolve = async () => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    setSolution(null);
    setError(null);
    
    const result = await solveQuantumProblem(input);
    if (result) {
        setSolution(result);
    } else {
        setError("Failed to generate a solution. Please try again or rephrase.");
    }
    setIsAnalyzing(false);
  };

  const handleApply = () => {
      if (solution?.gates) {
          // Map the raw JSON gates to our app's Gate type with IDs
          const mappedGates: Gate[] = solution.gates.map(g => ({
              id: Math.random().toString(36).substr(2, 9),
              type: g.type as any,
              target: g.target,
              control: g.control
          }));
          onLoadGates(mappedGates);
      }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border-l border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950">
        <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-2">
           <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
           Algorithm Solver
        </h2>
        <p className="text-[10px] text-slate-500 mt-1">
          Translate math & logic into quantum circuits
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
         
         {/* Input Section */}
         <div className="space-y-3">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Problem Statement</label>
            <div className="relative">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g., 'Find the state where q0 AND q1 are true' or 'Simulate a coin flip'"
                    className="w-full h-24 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:ring-1 focus:ring-purple-500 outline-none resize-none placeholder-slate-600"
                />
                <button 
                    onClick={handleSolve}
                    disabled={isAnalyzing || !input.trim()}
                    className="absolute bottom-2 right-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-bold uppercase rounded shadow-lg transition-all flex items-center gap-2"
                >
                    {isAnalyzing ? (
                        <>
                           <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           Thinking...
                        </>
                    ) : (
                        <>
                           <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                           Solve
                        </>
                    )}
                </button>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, i) => (
                    <button 
                       key={i} 
                       onClick={() => setInput(p)}
                       className="text-[9px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-colors"
                    >
                       {p}
                    </button>
                ))}
            </div>
         </div>

         {/* Error State */}
         {error && (
            <div className="bg-rose-950/30 border border-rose-900/50 p-3 rounded-lg flex items-center gap-3 animate-in fade-in">
                 <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 <span className="text-rose-200 text-xs">{error}</span>
            </div>
         )}

         {/* Result Section */}
         {solution && (
             <div className="animate-in slide-in-from-bottom-5 duration-500 space-y-4">
                 
                 <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xs font-bold text-white">{solution.algorithmName}</h3>
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                            {solution.gates.length} Gates
                        </span>
                    </div>
                    <div className="text-[11px] text-slate-300 leading-relaxed markdown-body">
                        {solution.explanation}
                    </div>
                 </div>

                 <button 
                    onClick={handleApply}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                 >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                     Load Circuit to Editor
                 </button>

                 <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <h4 className="text-[10px] text-slate-500 font-bold uppercase mb-1">Result Interpretation</h4>
                    <p className="text-[10px] text-cyan-400 font-mono leading-relaxed">
                        {solution.interpretation}
                    </p>
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};

export default QuantumSolver;