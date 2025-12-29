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
  const [copied, setCopied] = useState(false);

  // --- SDK Generators ---
  const genQiskit = (g: Gate[], n: number) => {
    let s = `from qiskit import QuantumCircuit\nimport numpy as np\n\n`;
    s += `# Initialize a circuit with ${n} qubits\n`;
    s += `qc = QuantumCircuit(${n})\n\n`;
    g.forEach(gate => {
      if (gate.control !== undefined) {
         if(gate.type === 'CX') s += `qc.cx(${gate.control}, ${gate.target})\n`;
         else if(gate.type === 'CZ') s += `qc.cz(${gate.control}, ${gate.target})\n`;
         else if(gate.type === 'CY') s += `qc.cy(${gate.control}, ${gate.target})\n`;
         else if(gate.type === 'CS') s += `qc.cp(np.pi/2, ${gate.control}, ${gate.target})\n`;
      } else {
         s += `qc.${gate.type.toLowerCase()}(${gate.target})\n`;
      }
    });
    s += `\n# Draw the circuit\nprint(qc.draw())\n`;
    return s;
  };

  const genCirq = (g: Gate[], n: number) => {
    let s = `import cirq\n\n`;
    s += `# Create qubits\n`;
    s += `qubits = cirq.LineQubit.range(${n})\n\n`;
    s += `circuit = cirq.Circuit(\n`;
    if (g.length === 0) {
        s += `    # Empty circuit\n`;
    }
    g.forEach(gate => {
      let line = `    cirq.`;
      if (gate.control !== undefined) {
          if(gate.type === 'CX') line += `CNOT(qubits[${gate.control}], qubits[${gate.target}]),\n`;
          else if(gate.type === 'CZ') line += `CZ(qubits[${gate.control}], qubits[${gate.target}]),\n`;
          else line += `${gate.type}(qubits[${gate.target}]).controlled_by(qubits[${gate.control}]),\n`; 
      } else {
          line += `${gate.type}(qubits[${gate.target}]),\n`;
      }
      s += line;
    });
    s += `)\n\nprint(circuit)\n`;
    return s;
  };

  const genBraket = (g: Gate[], n: number) => {
      let s = `from braket.circuits import Circuit\n\n`;
      s += `circ = Circuit()\n\n`;
      if (g.length === 0) s += `# No gates added\n`;
      g.forEach(gate => {
          let op = gate.type.toLowerCase();
          if (op === 'cx') op = 'cnot';
          
          if (gate.control !== undefined) {
              if (['cnot', 'cz', 'cy'].includes(op)) {
                  s += `circ.${op}(${gate.control}, ${gate.target})\n`;
              } else {
                  s += `circ.cphase(${gate.control}, ${gate.target}, 1.57) # ${gate.type}\n`;
              }
          } else {
              s += `circ.${op}(${gate.target})\n`;
          }
      });
      s += `\nprint(circ)\n`;
      return s;
  };

  const genPennyLane = (g: Gate[], n: number) => {
    let s = `import pennylane as qml\n\n`;
    s += `dev = qml.device("default.qubit", wires=${n})\n\n`;
    s += `@qml.qnode(dev)\n`;
    s += `def circuit():\n`;
    if (g.length === 0) {
        s += `    return qml.state()\n`;
    } else {
        g.forEach(gate => {
            let op = gate.type === 'CX' ? 'CNOT' : (gate.type === 'CS' ? 'ControlledPhaseShift' : gate.type);
            let wires = gate.control !== undefined ? `wires=[${gate.control}, ${gate.target}]` : `wires=[${gate.target}]`;
            let params = gate.type === 'CS' ? `1.57, ` : '';
            s += `    qml.${op}(${params}${wires})\n`;
        });
        s += `    return qml.state()\n`;
    }
    s += `\nprint(circuit())\n`;
    return s;
  };

  const genQASM = (g: Gate[], n: number) => {
      let qasm = `OPENQASM 2.0;\ninclude "qelib1.inc";\n\nqreg q[${n}];\ncreg c[${n}];\n\n`;
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

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Improved Syntax Highlighter logic
  const getHighlightedCode = () => {
    if (!code) return "";
    
    // Escape HTML special characters
    let html = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Tokenize and wrap in spans
    // Order matters to avoid nested tag corruption
    const tokens = [
      { pattern: /(#.*|\/\/.*)/g, class: 'text-slate-500 italic' }, // Comments
      { pattern: /("[^"]*")/g, class: 'text-amber-300' }, // Strings
      { pattern: /\b(import|from|def|return|for|in|range|print|include|qreg|creg|OPENQASM)\b/g, class: 'text-purple-400 font-bold' }, // Keywords
      { pattern: /\b(qiskit|cirq|braket|pennylane|qml|numpy|np)\b/g, class: 'text-blue-400 font-semibold' }, // Libraries
      { pattern: /\b(QuantumCircuit|Circuit|LineQubit|device|qnode|qubits)\b/g, class: 'text-yellow-300' }, // Objects
      { pattern: /\b(h|x|y|z|s|t|cx|cz|cy|cp|CNOT|CZ|CS|H|X|Y|Z|S|T|ControlledPhaseShift)\b/g, class: 'text-emerald-400 font-bold' }, // Gates
      { pattern: /\b(\d+(\.\d+)?)\b/g, class: 'text-orange-400' } // Numbers
    ];

    // Combine all token patterns into a single regex using capturing groups
    const masterRegex = new RegExp(tokens.map(t => `(${t.pattern.source})`).join('|'), 'g');
    
    return html.replace(masterRegex, (...args) => {
      const match = args[0];
      const captures = args.slice(1, tokens.length + 1);
      const tokenIndex = captures.findIndex(c => c !== undefined);
      
      if (tokenIndex !== -1) {
        return `<span class="${tokens[tokenIndex].class}">${match}</span>`;
      }
      return match;
    });
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden border-l border-slate-800">
       
       <div className="p-4 border-b border-slate-800 bg-slate-950 flex flex-col gap-3">
          <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                Source Export
              </h2>
              <button 
                onClick={handleCopy}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'}`}
              >
                {copied ? (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied</>
                ) : (
                    <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg> Copy</>
                )}
              </button>
          </div>
          
          <div className="flex bg-slate-900 rounded p-1 gap-1 overflow-x-auto no-scrollbar border border-slate-800">
            {[
                { id: 'qiskit', label: 'Qiskit' },
                { id: 'cirq', label: 'Cirq' },
                { id: 'braket', label: 'Braket' },
                { id: 'pennylane', label: 'PLane' },
                { id: 'qasm', label: 'QASM' },
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveSDK(tab.id as SDK)}
                    className={`flex-1 min-w-[60px] py-1.5 text-[9px] font-bold uppercase rounded transition-all ${
                        activeSDK === tab.id 
                        ? 'bg-blue-600 text-white shadow-lg' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
          </div>
       </div>

       <div className="flex-1 relative bg-[#0d1117] flex overflow-hidden">
           {/* Line Numbers */}
           <div className="w-10 bg-slate-900/50 text-right pr-2 pt-4 select-none border-r border-slate-800/50 shrink-0">
               {Array.from({ length: Math.max(1, lineCount) }).map((_, i) => (
                   <div key={i} className="text-[10px] font-mono text-slate-600 leading-relaxed">{i + 1}</div>
               ))}
           </div>

           {/* Code Area */}
           <div className="flex-1 overflow-auto custom-scrollbar p-4 group">
               <pre 
                 className="text-[11px] font-mono text-slate-300 whitespace-pre leading-relaxed"
                 dangerouslySetInnerHTML={{ __html: getHighlightedCode() }}
               />
           </div>
       </div>
       
       <div className="p-2.5 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-[9px] font-mono text-slate-500 px-4">
           <span>{activeSDK === 'qasm' ? 'Quantum Assembly 2.0' : 'Python 3.x Script'}</span>
           <span className="flex items-center gap-1">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
               Ready to run
           </span>
       </div>

       {/* Tailwind Safelist - Hidden div to ensure CDN parses these classes and includes them in the build */}
       <div className="hidden text-slate-500 text-amber-300 text-purple-400 text-blue-400 text-yellow-300 text-emerald-400 text-orange-400 font-bold font-semibold italic"></div>
    </div>
  );
};

export default CodeViewer;