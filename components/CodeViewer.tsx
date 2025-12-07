
import React, { useState, useEffect } from 'react';
import { Gate } from '../types';

interface CodeViewerProps {
  gates: Gate[];
  numQubits: number;
}

type SDK = 'qiskit' | 'cirq' | 'braket' | 'pennylane' | 'qasm';

const CodeViewer: React.FC<CodeViewerProps> = ({ gates, numQubits }) => {
  const [activeSDK, setActiveSDK] = useState<SDK>('qiskit');
  const [code, setCode] = useState('');

  // --- Generators ---

  const genQiskit = (g: Gate[], n: number) => {
    let s = `from qiskit import QuantumCircuit\n\n`;
    s += `# Create a quantum circuit with ${n} qubits\n`;
    s += `qc = QuantumCircuit(${n})\n\n`;
    g.forEach(gate => {
      if (gate.control !== undefined) {
         if(gate.type === 'CX') s += `qc.cx(${gate.control}, ${gate.target})\n`;
         else if(gate.type === 'CZ') s += `qc.cz(${gate.control}, ${gate.target})\n`;
         else if(gate.type === 'CY') s += `qc.cy(${gate.control}, ${gate.target})\n`;
         else if(gate.type === 'CS') s += `qc.cp(3.14159/2, ${gate.control}, ${gate.target}) # CS approx\n`;
      } else {
         s += `qc.${gate.type.toLowerCase()}(${gate.target})\n`;
      }
    });
    s += `\nprint(qc)\n`;
    return s;
  };

  const genCirq = (g: Gate[], n: number) => {
    let s = `import cirq\n\n`;
    s += `# Create qubits\n`;
    s += `q = cirq.LineQubit.range(${n})\n\n`;
    s += `circuit = cirq.Circuit(\n`;
    g.forEach(gate => {
      let line = `    cirq.`;
      if (gate.control !== undefined) {
          if(gate.type === 'CX') line += `CNOT(q[${gate.control}], q[${gate.target}]),\n`;
          else if(gate.type === 'CZ') line += `CZ(q[${gate.control}], q[${gate.target}]),\n`;
          else line += `${gate.type}(q[${gate.target}]).controlled_by(q[${gate.control}]),\n`; 
      } else {
          line += `${gate.type}(q[${gate.target}]),\n`;
      }
      s += line;
    });
    s += `)\n\nprint(circuit)\n`;
    return s;
  };

  const genBraket = (g: Gate[], n: number) => {
      let s = `from braket.circuits import Circuit\n\n`;
      s += `circ = Circuit()\n\n`;
      g.forEach(gate => {
          let op = gate.type.toLowerCase();
          if (op === 'cx') op = 'cnot'; // Braket uses cnot
          
          if (gate.control !== undefined) {
              // Braket standard gates are mostly cnot, cz, swap, cswap.
              // For others, it gets complex. We'll simplify for standard ones.
              if (['cnot', 'cz', 'cy', 'cphase'].includes(op)) {
                  s += `circ.${op}(${gate.control}, ${gate.target})\n`;
              } else {
                  s += `# Unsupported simple control for ${op} in visualizer\n`;
              }
          } else {
              s += `circ.${op}(${gate.target})\n`;
          }
      });
      s += `\nprint(circ)\n`;
      return s;
  };

  const genPennyLane = (g: Gate[], n: number) => {
    let s = `import pennylane as qml\nfrom pennylane import numpy as np\n\n`;
    s += `dev = qml.device("default.qubit", wires=${n})\n\n`;
    s += `@qml.qnode(dev)\n`;
    s += `def circuit():\n`;
    if (g.length === 0) s += `    return qml.state()\n`;
    
    g.forEach(gate => {
        let op = "";
        if (gate.type === 'CX') op = 'CNOT';
        else if (gate.type === 'CZ') op = 'CZ';
        else if (gate.type === 'CY') op = 'CY';
        else if (gate.type === 'CS') op = 'CS'; // Check support
        else op = gate.type; 
        
        let wires = gate.control !== undefined ? `wires=[${gate.control}, ${gate.target}]` : `wires=[${gate.target}]`;
        s += `    qml.${op}(${wires})\n`;
    });
    s += `    return qml.probs(wires=range(${n}))\n\n`;
    s += `print(circuit())\n`;
    return s;
  };

  const genQASM = (g: Gate[], n: number) => {
      let qasm = `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[${n}];\ncreg c[${n}];\n\n`;
      g.forEach(gate => {
          const t = gate.target;
          const c = gate.control;
          switch(gate.type) {
              case 'H': qasm += `h q[${t}];\n`; break;
              case 'X': qasm += `x q[${t}];\n`; break;
              case 'Y': qasm += `y q[${t}];\n`; break;
              case 'Z': qasm += `z q[${t}];\n`; break;
              case 'S': qasm += `s q[${t}];\n`; break;
              case 'T': qasm += `t q[${t}];\n`; break;
              case 'CX': qasm += `cx q[${c}],q[${t}];\n`; break;
              case 'CZ': qasm += `cz q[${c}],q[${t}];\n`; break;
              case 'CY': qasm += `cy q[${c}],q[${t}];\n`; break;
              case 'CS': qasm += `cp(pi/2) q[${c}],q[${t}];\n`; break;
          }
      });
      return qasm;
  };

  useEffect(() => {
    let newCode = "";
    switch(activeSDK) {
        case 'qiskit': newCode = genQiskit(gates, numQubits); break;
        case 'cirq': newCode = genCirq(gates, numQubits); break;
        case 'braket': newCode = genBraket(gates, numQubits); break;
        case 'pennylane': newCode = genPennyLane(gates, numQubits); break;
        case 'qasm': newCode = genQASM(gates, numQubits); break;
    }
    setCode(newCode);
  }, [activeSDK, gates, numQubits]);

  // Syntax Highlighting (Regex based)
  const getHighlightedCode = () => {
      if (!code) return "";
      let html = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const keywords = /\b(import|from|def|return|for|in|range|print|include|qreg|creg|OPENQASM)\b/g;
      const libs = /\b(qiskit|cirq|braket|pennylane|qml|numpy|np)\b/g;
      const objects = /\b(QuantumCircuit|Circuit|LineQubit|device|qnode)\b/g;
      const gates = /\b(h|x|y|z|s|t|cx|cz|cy|cp|CNOT|CZ|CS|H|X|Y|Z|S|T)\b/g;
      const comments = /(#.*|\/\/.*)/g;
      const numbers = /\b(\d+(\.\d+)?)\b/g;
      const strings = /("[^"]*")/g;

      html = html
        .replace(comments, '<span class="text-slate-500 italic">$1</span>')
        .replace(strings, '<span class="text-amber-300">$1</span>')
        .replace(keywords, '<span class="text-purple-400 font-bold">$1</span>')
        .replace(libs, '<span class="text-blue-400 font-bold">$1</span>')
        .replace(objects, '<span class="text-yellow-300">$1</span>')
        .replace(gates, '<span class="text-emerald-400 font-bold">$1</span>')
        .replace(numbers, '<span class="text-orange-300">$1</span>');
        
      return html;
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border-l border-slate-800">
       
       <div className="p-4 border-b border-slate-800 bg-slate-950">
          <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 flex items-center gap-2">
             <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
             Quantum SDK Export
          </h2>
          <p className="text-[10px] text-slate-500 mt-1">
             Translate visual circuits to production code
          </p>
       </div>

       <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto custom-scrollbar">
          {[
              { id: 'qiskit', label: 'Qiskit (IBM)' },
              { id: 'cirq', label: 'Cirq (Google)' },
              { id: 'braket', label: 'Braket (AWS)' },
              { id: 'pennylane', label: 'PennyLane' },
              { id: 'qasm', label: 'OpenQASM 2.0' },
          ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSDK(tab.id as SDK)}
                className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${
                    activeSDK === tab.id 
                    ? 'border-blue-500 text-blue-400 bg-slate-800/50' 
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                }`}
              >
                  {tab.label}
              </button>
          ))}
       </div>

       <div className="flex-1 relative bg-[#0d1117] p-4 overflow-y-auto custom-scrollbar group">
           <pre 
             className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all leading-relaxed"
             dangerouslySetInnerHTML={{ __html: getHighlightedCode() }}
           />
           
           <button 
             onClick={() => navigator.clipboard.writeText(code)}
             className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg shadow-lg border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
             title="Copy Code"
           >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
           </button>
       </div>
       
       <div className="p-2 bg-slate-950 border-t border-slate-800 text-[9px] text-slate-600 text-center font-mono">
           Generated code is ready to copy-paste into Jupyter Notebooks.
       </div>
    </div>
  );
};

export default CodeViewer;
