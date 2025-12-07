
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import BlochSphere from './components/BlochSphere';
import ChatInterface from './components/ChatInterface';
import StatevectorVisualizer from './components/StatevectorVisualizer';
import MeasurementLab from './components/MeasurementLab';
import PolarPlotVisualizer from './components/PolarPlotVisualizer';
import QuantumTunnelingVisualizer from './components/QuantumTunnelingVisualizer';
import EntanglementVisualizer from './components/EntanglementVisualizer';
import HardwareBridge from './components/HardwareBridge';
import QuantumSolver from './components/QuantumSolver';
import GateSelector from './components/GateSelector';
import { Gate, GateType, Complex, QubitState } from './types';
import { CIRCUIT_EXAMPLES } from './data/circuitExamples';

// --- Types & Constants ---
const STEPS = 20; // Increased to 20 for complex algorithms
const WIRES = 4; // Upgraded to 4 qubits for advanced state visualization

// --- Complex Math Helpers ---
const zero: Complex = { r: 0, i: 0 };
const one: Complex = { r: 1, i: 0 };
const add = (a: Complex, b: Complex): Complex => ({ r: a.r + b.r, i: a.i + b.i });
const mul = (a: Complex, b: Complex): Complex => ({ r: a.r * b.r - a.i * b.i, i: a.r * b.i + a.i * b.r });
const mulS = (a: Complex, s: number): Complex => ({ r: a.r * s, i: a.i * s });
const magSq = (a: Complex): number => a.r * a.r + a.i * a.i;

interface DraggableGate {
  id: GateType;
  label: string;
  color: string;
}

interface ProjectFile {
  version: string;
  title: string;
  history: (Gate | null)[][][];
  currentStep: number;
  timestamp: number;
}

const PALETTE: DraggableGate[] = [
  // Pauli Gates
  { id: 'H', label: 'H (Hadamard)', color: 'bg-blue-600' },
  { id: 'X', label: 'X (NOT)', color: 'bg-pink-600' },
  { id: 'Y', label: 'Y (Pauli-Y)', color: 'bg-teal-600' },
  { id: 'Z', label: 'Z (Phase π)', color: 'bg-orange-500' },
  // Phase Gates
  { id: 'S', label: 'S (Phase π/2)', color: 'bg-purple-600' },
  { id: 'T', label: 'T (Phase π/4)', color: 'bg-fuchsia-600' },
  // Controlled Gates
  { id: 'CX', label: 'CNOT', color: 'bg-sky-500' },
  { id: 'CZ', label: 'CZ (Control-Z)', color: 'bg-emerald-500' },
  { id: 'CY', label: 'CY (Control-Y)', color: 'bg-teal-500' },
  { id: 'CS', label: 'CS (Control-S)', color: 'bg-purple-500' },
];

const App: React.FC = () => {
  // --- History State Management ---
  const [history, setHistory] = useState<(Gate | null)[][][]>([
    Array.from({ length: STEPS }, () => Array(WIRES).fill(null))
  ]);
  const [currentStep, setCurrentStep] = useState(0);

  // Derived Grid State
  const grid = history[currentStep];

  // --- Project Management State ---
  const [projectTitle, setProjectTitle] = useState("Untitled Circuit");
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  
  // --- UI State ---
  const [isLocked, setIsLocked] = useState(false);
  const [isFullScreenBloch, setIsFullScreenBloch] = useState(false);
  const [isFullScreenViz, setIsFullScreenViz] = useState(false); // New state for Viz Fullscreen

  // --- Zoom & Pan State ---
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);

  // Helper to update grid with history
  const updateGrid = (newGrid: (Gate | null)[][]) => {
    if (isLocked) return;
    const newHistory = history.slice(0, currentStep + 1);
    newHistory.push(newGrid);
    setHistory(newHistory);
    setCurrentStep(newHistory.length - 1);
  };

  const undo = () => {
    if (isLocked) return;
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const redo = () => {
    if (isLocked) return;
    if (currentStep < history.length - 1) setCurrentStep(currentStep - 1); // Logic fix: redo goes forward, previous logic was setCurrentStep(currentStep+1) but check bounds
    if (currentStep < history.length - 1) setCurrentStep(currentStep + 1);
  };

  // --- View Control ---
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const fitToCircuit = (targetGrid = grid) => {
    if (!boardRef.current) return;
    
    // 1. Identify active area (max step index with a gate)
    let maxStep = -1;
    targetGrid.forEach((stepGates, sIdx) => {
        if (stepGates.some(g => g !== null)) maxStep = sIdx;
    });

    // Ensure we show at least a few steps or up to the last gate + buffer
    const visibleSteps = Math.max(maxStep + 4, 6); 
    
    const isMobile = window.innerWidth < 768;
    const STEP_W = isMobile ? 64 : 80; // w-16 or w-20
    const WIRE_LABEL_W = 64; // pl-16
    const PADDING_X = 96; // p-12 * 2 roughly
    
    // Estimated width of the "used" circuit part
    const usedWidth = visibleSteps * STEP_W + WIRE_LABEL_W + PADDING_X;
    const totalWidth = STEPS * STEP_W + WIRE_LABEL_W + PADDING_X;

    const availableWidth = boardRef.current.clientWidth;
    
    // Compute ideal zoom to fit width (clamped)
    // We assume height usually fits or user scrolls vertically if needed, but primary focus is width
    let newZoom = availableWidth / usedWidth;
    newZoom = Math.min(Math.max(newZoom, 0.5), 1.3); 
    
    // Compute Pan X
    // The grid is centered by CSS (justify-center).
    // Center of TOTAL grid is at 0 visual offset.
    // We want the center of USED grid to be at 0 visual offset.
    // Shift = (TotalWidth / 2) - (UsedWidth / 2)
    const newPanX = (totalWidth / 2) - (usedWidth / 2);
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: 0 });
  };
  
  const toggleBrowserFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // --- Save / Load Logic ---
  const saveProject = () => {
    const projectData: ProjectFile = {
      version: "1.0",
      title: projectTitle,
      history: history,
      currentStep: currentStep,
      timestamp: Date.now()
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Sanitize title for filename
    const filename = projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'quantum_circuit';
    link.download = `${filename}.qjson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content) as ProjectFile;
        
        // Basic validation
        if (data.history && Array.isArray(data.history) && Array.isArray(data.history[0])) {
          setHistory(data.history);
          const newStep = typeof data.currentStep === 'number' ? Math.min(data.currentStep, data.history.length - 1) : data.history.length - 1;
          setCurrentStep(newStep);
          setProjectTitle(data.title || "Untitled Circuit");
          
          // Trigger Fit after state update
          setTimeout(() => fitToCircuit(data.history[newStep]), 50);
        } else {
           alert("Invalid project file format.");
        }
      } catch (error) {
        console.error("Error loading project:", error);
        alert("Failed to load project file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input to allow reloading same file
  };

  // Keyboard Shortcuts for Undo/Redo/Save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveProject();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault();
        fitToCircuit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, history, projectTitle, isLocked]);

  const [amplitudes, setAmplitudes] = useState<Complex[]>([]);
  const [activeTab, setActiveTab] = useState<'visuals' | 'tutor' | 'hardware' | 'solver'>('visuals');
  const [vizMode, setVizMode] = useState<'statevector' | 'phasor' | 'measure' | 'tunneling' | 'entanglement'>('statevector');
  const [dragOverCell, setDragOverCell] = useState<{ step: number, wire: number } | null>(null);

  // Sidebar Resize State
  const [sidebarWidth, setSidebarWidth] = useState(384); // Default 384px (w-96)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);

  // Gates Palette State
  const [isGatePaletteOpen, setIsGatePaletteOpen] = useState(true);

  // Popup Menu State
  const [activePopup, setActivePopup] = useState<{ step: number, wire: number, x: number, y: number } | null>(null);

  // --- Simulation Engine ---
  const flattenedCircuit = useMemo(() => {
    const circuit: Gate[] = [];
    grid.forEach((step, stepIdx) => {
      step.forEach((gate) => {
        if (gate) circuit.push(gate);
      });
    });
    return circuit;
  }, [grid]);

  useEffect(() => {
    // Generic Simulation for N Qubits
    const numStates = 1 << WIRES;
    let state = new Array(numStates).fill(zero);
    state[0] = one; // Initial State |00...0>
    
    const INV_SQRT_2 = 1 / Math.sqrt(2);

    // Generic Single Qubit Gate Application
    const applyGate = (u00: Complex, u01: Complex, u10: Complex, u11: Complex, target: number) => {
       const newState = [...state];
       const halfStates = numStates / 2;
       
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

    // Generic Controlled Gate Application
    const applyControlledGate = (type: GateType, ctrl: number, tgt: number) => {
        const newState = [...state];
        const halfStates = numStates / 2;

        for (let i = 0; i < halfStates; i++) {
            const lowMask = (1 << tgt) - 1;
            const low = i & lowMask;
            const high = (i & ~lowMask) << 1;
            
            const idx0 = high | low;
            const idx1 = idx0 | (1 << tgt);

            const isControlSet = (idx0 & (1 << ctrl)) !== 0;

            if (isControlSet) {
                 const a0 = state[idx0];
                 const a1 = state[idx1];

                 if (type === 'CX') {
                     newState[idx0] = a1;
                     newState[idx1] = a0;
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

    flattenedCircuit.forEach(gate => {
       const T = gate.target;
       const C = gate.control;

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

    setAmplitudes(state);
  }, [flattenedCircuit]);

  // --- Resize Handler ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 280 && newWidth <= 800) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // --- Zoom & Pan Handlers ---
  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
          e.preventDefault(); // Stop browser zoom
          const zoomSensitivity = 0.0015;
          const delta = -e.deltaY * zoomSensitivity;
          const newZoom = Math.min(Math.max(zoom + delta, 0.4), 3.0);
          
          if (boardRef.current) {
            // Zoom-to-cursor logic
            const rect = boardRef.current.getBoundingClientRect();
            // Center of the board in screen coordinates
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            // Mouse position relative to center
            const mouseX = e.clientX - centerX;
            const mouseY = e.clientY - centerY;
            
            // Pan adjustment:
            // The point under mouse at (mouseX, mouseY) corresponds to logic coordinates: P = (mouse - pan) / oldZoom
            // We want (mouse - newPan) / newZoom = P
            // newPan = mouse - P * newZoom = mouse - (mouse - pan) * (newZoom / oldZoom)
            const scaleFactor = newZoom / zoom;
            const newPanX = mouseX - (mouseX - pan.x) * scaleFactor;
            const newPanY = mouseY - (mouseY - pan.y) * scaleFactor;
            
            setPan({ x: newPanX, y: newPanY });
          }
          
          setZoom(newZoom);
      } else {
          // Pan with scroll wheel
          setPan(p => ({
              x: p.x - e.deltaX,
              y: p.y - e.deltaY
          }));
      }
  };

  const startPan = (e: React.MouseEvent) => {
      // Middle mouse (1) or Left Click (0) to pan
      // We check if target is not a gate/interactive element
      const target = e.target as HTMLElement;
      const isInteractive = target.closest('.gate-cell') || target.closest('button');
      
      if ((e.button === 1 || e.button === 0) && !isInteractive) { 
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
  };

  const doPan = (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      
      setPan(p => ({ x: p.x + dx, y: p.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const endPan = () => {
      setIsPanning(false);
  };

  const getReducedState = (targetQubit: number): QubitState => {
     if (amplitudes.length === 0) return { theta: 0, phi: 0, probabilityZero: 1, probabilityOne: 0 };
     let p0 = 0;
     const numStates = amplitudes.length;
     for (let i = 0; i < numStates; i++) {
         if ((i & (1 << targetQubit)) === 0) p0 += magSq(amplitudes[i]);
     }
     const theta = 2 * Math.acos(Math.sqrt(Math.max(0, Math.min(1, p0))));
     return { theta, phi: 0, probabilityZero: p0, probabilityOne: 1 - p0 };
  };

  const handleCellClick = (e: React.MouseEvent, step: number, wire: number) => {
    e.stopPropagation();
    if (isLocked) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setActivePopup({ step, wire, x: rect.right + 5, y: rect.top });
  };

  const handlePopupSelect = (gateType: GateType | 'DELETE') => {
    if (!activePopup || isLocked) return;
    const { step, wire } = activePopup;
    const newGrid = grid.map(row => [...row]);

    if (gateType === 'DELETE') {
        newGrid[step][wire] = null;
    } else {
        const newGate: Gate = {
            id: Math.random().toString(36).substr(2, 9),
            type: gateType,
            target: wire,
        };
        if (['CX', 'CZ', 'CY', 'CS'].includes(gateType)) {
            let defaultControl = (wire + 1) % WIRES;
            if (defaultControl === wire) defaultControl = (wire - 1 + WIRES) % WIRES;
            newGate.control = defaultControl;
            newGrid[step][defaultControl] = null; 
        }
        newGrid[step][wire] = newGate;
    }
    updateGrid(newGrid);
    setActivePopup(null);
  };

  const handleDragStart = (e: React.DragEvent, gate: DraggableGate) => {
    if (isLocked) { e.preventDefault(); return; }
    e.dataTransfer.setData('gateType', gate.id);
    e.dataTransfer.setData('gateColor', gate.color);
  };

  const handleDrop = (e: React.DragEvent, stepIdx: number, wireIdx: number) => {
    e.preventDefault();
    if (isLocked) return;
    setDragOverCell(null);
    const gateType = e.dataTransfer.getData('gateType') as GateType;
    if (!gateType) return;
    const newGrid = grid.map(row => [...row]);
    const newGate: Gate = { id: Math.random().toString(36).substr(2, 9), type: gateType, target: wireIdx };
    if (['CX', 'CZ', 'CY', 'CS'].includes(gateType)) {
      let defaultControl = (wireIdx + 1) % WIRES;
      if (defaultControl === wireIdx) defaultControl = (wireIdx - 1 + WIRES) % WIRES;
      newGate.control = defaultControl;
      newGrid[stepIdx][defaultControl] = null;
    }
    newGrid[stepIdx][wireIdx] = newGate;
    updateGrid(newGrid);
  };

  const handleDragOver = (e: React.DragEvent, step: number, wire: number) => {
    e.preventDefault();
    if (isLocked) return;
    if (dragOverCell?.step !== step || dragOverCell?.wire !== wire) setDragOverCell({ step, wire });
  };
  
  const handleGateClick = (gate: DraggableGate) => {
    if (isLocked) return;
    const newGrid = grid.map(row => [...row]);
    for (let step = 0; step < STEPS; step++) {
      const col = newGrid[step];
      if (['CX', 'CZ', 'CY', 'CS'].includes(gate.id)) {
        for(let t=0; t<WIRES; t++) {
             let c = (t + 1) % WIRES;
             if (!col[t] && !col[c]) {
                 const newGate: Gate = { id: Math.random().toString(36).substr(2, 9), type: gate.id, target: c, control: t };
                 newGrid[step][c] = newGate;
                 updateGrid(newGrid);
                 return;
             }
        }
      } else {
        for(let w=0; w<WIRES; w++) {
            if (!col[w]) {
                newGrid[step][w] = { id: Math.random().toString(36).substr(2, 9), type: gate.id, target: w };
                updateGrid(newGrid);
                return;
            }
        }
      }
    }
  };

  const clearCircuit = () => {
    if (isLocked) return;
    updateGrid(Array.from({ length: STEPS }, () => Array(WIRES).fill(null)));
    resetView();
  };

  const loadExample = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isLocked) return;
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) return;
    const example = CIRCUIT_EXAMPLES[idx];
    const newGrid = Array.from({ length: STEPS }, () => Array(WIRES).fill(null));
    example.gates.forEach(g => {
        if (g.s < STEPS && g.w < WIRES) {
             const gate: Gate = { id: Math.random().toString(36).substr(2, 9), type: g.t, target: g.w, control: g.c };
             newGrid[g.s][g.w] = gate;
        }
    });
    updateGrid(newGrid);
    setProjectTitle(example.name);
    e.target.value = ""; 
    setTimeout(() => fitToCircuit(newGrid), 50); // Auto-fit
  };
  
  const handleLoadGates = (gates: Gate[]) => {
      if (isLocked) return;
      const newGrid = Array.from({ length: STEPS }, () => Array(WIRES).fill(null));
      let currentCol = 0;
      gates.forEach(gate => {
          if (currentCol >= STEPS) return;
          const isTargetOccupied = newGrid[currentCol][gate.target] !== null;
          const isControlOccupied = gate.control !== undefined ? newGrid[currentCol][gate.control!] !== null : false;
          if (isTargetOccupied || isControlOccupied) currentCol++;
          if (currentCol < STEPS) newGrid[currentCol][gate.target] = gate;
      });
      updateGrid(newGrid);
      setTimeout(() => fitToCircuit(newGrid), 50); // Auto-fit
  };

  const getGateSymbol = (type: GateType) => {
    if (type === 'CX') return <span className="text-xl">⊕</span>;
    if (type === 'CZ') return 'Z';
    if (type === 'CY') return 'Y';
    if (type === 'CS') return 'S';
    return type;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden selection:bg-cyan-500/30">
      
      {/* 1. Header Toolbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0 z-20 shadow-lg">
        {/* ... (Header content unchanged) ... */}
        <div className="flex items-center gap-3 group cursor-pointer">
           <div className="relative w-9 h-9 flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.4)] transition-all duration-300">
               <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <circle cx="12" cy="12" r="3" strokeWidth="2" />
                   <ellipse cx="12" cy="12" rx="8" ry="3" strokeWidth="1.5" transform="rotate(45 12 12)" />
                   <ellipse cx="12" cy="12" rx="8" ry="3" strokeWidth="1.5" transform="rotate(-45 12 12)" />
               </svg>
           </div>
           <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-0.5">QuantumLens</span>
              <input 
                type="text" 
                value={projectTitle} 
                onChange={(e) => !isLocked && setProjectTitle(e.target.value)}
                readOnly={isLocked}
                className={`bg-transparent text-white font-bold text-sm md:text-base border border-transparent rounded px-1 -ml-1 outline-none w-40 md:w-64 transition-all placeholder-slate-500 ${isLocked ? 'cursor-default focus:border-transparent' : 'hover:border-slate-600 focus:border-cyan-500 focus:bg-slate-800'}`}
                placeholder="Untitled Circuit"
              />
           </div>
        </div>
        
        <div className="flex gap-2 items-center">
             <div className="flex bg-slate-800 rounded p-0.5 gap-0.5 mr-2 shadow-inner border border-slate-700/50">
             <button onClick={saveProject} title="Save Project (Ctrl+S)" className="p-1.5 px-3 rounded hover:bg-slate-700 transition-colors text-slate-300 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                <span className="hidden md:inline">Save</span>
             </button>
             <div className="w-px bg-slate-600 my-1 opacity-30"></div>
             <button onClick={() => !isLocked && projectFileInputRef.current?.click()} disabled={isLocked} className={`p-1.5 px-3 rounded transition-colors text-slate-300 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <span className="hidden md:inline">Load</span>
             </button>
             <input type="file" ref={projectFileInputRef} onChange={loadProject} accept=".qjson,.json" className="hidden" disabled={isLocked} />
          </div>

          <div className="relative">
             <select onChange={loadExample} disabled={isLocked} className={`bg-slate-800 text-slate-300 text-xs font-semibold uppercase tracking-wider py-1.5 pl-3 pr-8 rounded appearance-none border border-transparent outline-none transition-colors shadow-sm ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700 hover:border-slate-500 cursor-pointer focus:ring-1 focus:ring-cyan-500'}`} defaultValue="">
               <option value="" disabled>Load Example</option>
               {CIRCUIT_EXAMPLES.map((ex, idx) => (
                 <option key={idx} value={idx}>{ex.name}</option>
               ))}
             </select>
          </div>
          
           <div className="w-px bg-slate-800 mx-1 h-6"></div>
           <button onClick={() => setIsLocked(!isLocked)} className={`p-1.5 px-3 rounded transition-all duration-300 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border ${isLocked ? 'bg-amber-950/40 text-amber-400 border-amber-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-transparent'}`}>
             {isLocked ? (
                 <>
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                   <span className="hidden md:inline">Locked</span>
                 </>
             ) : (
                 <>
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                   <span className="hidden md:inline">Edit Mode</span>
                 </>
             )}
          </button>
          
          <div className="w-px bg-slate-800 mx-1 h-6"></div>
          <button onClick={() => setIsGatePaletteOpen(!isGatePaletteOpen)} className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors border shadow-sm ${isGatePaletteOpen ? 'bg-indigo-600/90 text-white border-indigo-500' : 'bg-slate-800 text-slate-300 border-transparent'}`}>
            Gates
          </button>
          <div className="w-px bg-slate-800 mx-1 h-6"></div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors border shadow-sm ${isSidebarOpen ? 'bg-blue-600/90 text-white border-blue-500' : 'bg-slate-800 text-slate-300 border-transparent'}`}>
            Panel
          </button>
           <div className="w-px bg-slate-800 mx-1 h-6"></div>
          <button onClick={toggleBrowserFullScreen} className={`px-2 py-1.5 text-xs font-semibold uppercase tracking-wider bg-slate-800 rounded transition-colors text-slate-300 border border-transparent shadow-sm hover:bg-slate-700`} title="Toggle Full Screen">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          </button>
          <div className="w-px bg-slate-800 mx-1 h-6"></div>
          <button onClick={clearCircuit} disabled={isLocked} className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wider bg-slate-800 rounded transition-colors text-slate-300 border border-transparent shadow-sm ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-500/20 hover:text-rose-400'}`}>
            Clear
          </button>
        </div>
      </header>

      {/* 2. Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* A. Gate Palette */}
        <aside 
            className={`bg-slate-900 border-r border-slate-800 flex flex-col items-center shrink-0 z-10 shadow-xl transition-all duration-300 overflow-hidden ${isLocked ? 'opacity-50 pointer-events-none grayscale' : ''}`}
            style={{ width: isGatePaletteOpen ? '6rem' : 0, padding: isGatePaletteOpen ? '1.5rem 0' : 0 }}
        >
          {/* Inner container with fixed width to prevent squishing */}
          <div className="w-24 flex flex-col items-center gap-4 overflow-y-auto custom-scrollbar h-full pb-6">
            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 whitespace-nowrap">Gates</div>
            {PALETTE.map((gate) => (
                <div
                key={gate.id}
                draggable={!isLocked}
                onDragStart={(e) => handleDragStart(e, gate)}
                onClick={() => handleGateClick(gate)}
                className={`w-12 h-12 md:w-14 md:h-14 ${gate.color} flex items-center justify-center rounded-lg cursor-pointer shadow-lg font-bold text-white select-none hover:scale-110 hover:shadow-xl hover:ring-2 ring-white/20 transition-all z-20 active:scale-95 shrink-0`}
                >
                {gate.id === 'CX' ? '⊕' : gate.id}
                </div>
            ))}
          </div>
        </aside>

        {/* B. Circuit Grid (Infinite Canvas) */}
        <main 
            ref={boardRef}
            className={`flex-1 overflow-hidden relative bg-slate-950 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'} ${isLocked ? 'cursor-not-allowed' : ''}`}
            onWheel={handleWheel}
            onMouseDown={startPan}
            onMouseMove={doPan}
            onMouseUp={endPan}
            onMouseLeave={endPan}
        >
          {/* Moving Background Layer */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
                backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
                backgroundSize: `${30 * zoom}px ${30 * zoom}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
                // Disable transition during pan for instant feedback
                transition: isPanning ? 'none' : 'background-size 0.2s, background-position 0.2s'
            }}
          />
          
          {/* Zoom/Pan Content Container */}
          <div 
            className={`absolute top-0 left-0 w-full h-full flex items-center justify-center origin-center ${isPanning ? 'duration-0' : 'transition-transform duration-200 ease-out'}`}
            style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
            }}
          >
             <div className="relative p-12 min-w-max">
                 {/* Wire Lines (Layer 0) */}
                 <div className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none z-0 pl-16 pr-8 pt-12">
                    <div className="flex flex-col gap-12">
                       {Array.from({length: WIRES}, (_, q) => (
                         <div key={q} className="relative w-full h-12 flex items-center">
                           {/* Main Wire */}
                           <div className="w-full h-0.5 bg-slate-700/50 shadow-sm"></div>
                           {/* Qubit Label */}
                           <div className="absolute -left-12 text-slate-500 font-mono text-sm font-bold flex items-center justify-center w-8 h-8 rounded bg-slate-900 border border-slate-700">q{q}</div>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* Grid Cells (Layer 1) */}
                 <div className="flex gap-0 relative z-10">
                    {grid.map((step, stepIdx) => {
                       const controllingGates = step.filter(g => g?.control !== undefined);
                       return (
                      <div key={stepIdx} className="gate-cell flex flex-col gap-12 relative w-16 md:w-20 h-full">
                        {/* Step Separator */}
                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-800 -z-10 opacity-30 border-dashed border-l border-slate-700/30"></div>
                        
                        {/* Control Lines (Vertical) */}
                        {controllingGates.map((g) => {
                            if (!g || g.control === undefined) return null;
                            const controlMin = Math.min(g.target, g.control);
                            const controlMax = Math.max(g.target, g.control);
                            const connectorColor = PALETTE.find(p => p.id === g.type)?.color || 'bg-sky-500';
                            return (
                               <div key={`${g.id}-line`} className={`absolute left-1/2 -translate-x-1/2 w-1 ${connectorColor} z-0 rounded-full opacity-80 shadow-sm`} style={{ top: `${(controlMin * 6 + 1.5)}rem`, height: `${(controlMax - controlMin) * 6}rem` }}></div>
                            );
                        })}

                        {/* Gates */}
                        {step.map((cell, wireIdx) => {
                           const isOver = dragOverCell?.step === stepIdx && dragOverCell?.wire === wireIdx;
                           const gateColor = cell ? PALETTE.find(p => p.id === cell.type)?.color || 'bg-slate-700' : '';
                           const isControlSource = !cell && step.some(g => g?.control === wireIdx);
                           const connectorColor = isControlSource ? (PALETTE.find(p => p.id === step.find(g => g?.control === wireIdx)?.type)?.color || 'bg-sky-500') : '';

                           return (
                             <div
                               key={`${stepIdx}-${wireIdx}`}
                               onDrop={(e) => handleDrop(e, stepIdx, wireIdx)}
                               onDragOver={(e) => handleDragOver(e, stepIdx, wireIdx)}
                               onDragLeave={() => setDragOverCell(null)}
                               onClick={(e) => handleCellClick(e, stepIdx, wireIdx)}
                               className={`w-12 h-12 mx-auto flex items-center justify-center rounded transition-all duration-200 ${isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'} ${isOver && !isLocked ? 'bg-slate-700/50 ring-2 ring-blue-500 scale-110' : ''} ${!cell && !isControlSource && !isLocked ? 'hover:bg-slate-800/50 hover:ring-1 hover:ring-slate-700' : ''}`}
                             >
                               {cell && (
                                 <div className={`w-full h-full ${gateColor} flex items-center justify-center rounded shadow-lg font-bold text-white z-20 relative pointer-events-none ring-1 ring-black/20`}>
                                   {getGateSymbol(cell.type)}
                                 </div>
                               )}
                               {isControlSource && (
                                  <div className={`w-4 h-4 rounded-full ${connectorColor} shadow-lg z-20 relative transform scale-110 pointer-events-none ring-2 ring-slate-950`}></div>
                               )}
                               {!cell && !isControlSource && isOver && !isLocked && (
                                 <div className="w-3 h-3 rounded-full bg-blue-400/50 animate-pulse pointer-events-none"></div>
                               )}
                             </div>
                           );
                        })}
                      </div>
                      );
                    })}
                 </div>
              </div>
          </div>

          {/* Zoom Controls HUD */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-50">
             <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-1.5 flex flex-col shadow-2xl">
                <button 
                  onClick={() => setZoom(z => Math.min(z + 0.2, 3.0))}
                  className="p-2 hover:bg-slate-800 text-slate-300 rounded"
                  title="Zoom In"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
                <div className="h-px bg-slate-700 my-1"></div>
                <button 
                  onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))}
                  className="p-2 hover:bg-slate-800 text-slate-300 rounded"
                  title="Zoom Out"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <div className="h-px bg-slate-700 my-1"></div>
                <button 
                   onClick={() => fitToCircuit()}
                   className="p-2 hover:bg-slate-800 text-emerald-400 rounded"
                   title="Fit to Circuit"
                >
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                </button>
                 <div className="h-px bg-slate-700 my-1"></div>
                <button 
                   onClick={resetView}
                   className="p-2 hover:bg-slate-800 text-cyan-400 rounded font-bold text-[10px]"
                   title="Reset View"
                >
                   1:1
                </button>
             </div>
             <div className="bg-slate-950/80 px-2 py-1 rounded text-[10px] text-slate-500 font-mono text-center border border-slate-800">
                 {Math.round(zoom * 100)}%
             </div>
          </div>
        </main>

        {/* C. Output Visualization & Tools */}
        <aside 
            className={`bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 shadow-2xl z-20 relative transition-[width] ease-in-out ${isResizing ? 'duration-0' : 'duration-300'}`}
            style={{ width: isSidebarOpen ? sidebarWidth : 0 }}
        >
           <div className="absolute left-0 top-0 bottom-0 w-1.5 -ml-1 cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors" onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }} />

           <div className="w-full h-full overflow-hidden flex flex-col">
               <div className="flex border-b border-slate-800 bg-slate-900">
                  {['visuals', 'tutor', 'hardware', 'solver'].map((tab) => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50' : 'text-slate-500'}`}
                    >
                        {tab === 'visuals' ? 'Output' : tab === 'tutor' ? 'AI Tutor' : tab === 'solver' ? 'Solver' : 'Hardware'}
                    </button>
                  ))}
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-slate-900/50">
                  {activeTab === 'visuals' ? (
                     <div className="space-y-6 p-4">
                        {/* Viz components (keeping existing structure) */}
                        <div className="space-y-4 group">
                           <div className="flex justify-between items-center pr-2">
                             <h3 className="text-xs uppercase text-slate-500 font-bold tracking-widest pl-1">Qubits</h3>
                             <button onClick={() => setIsFullScreenBloch(true)} className="text-slate-600 hover:text-cyan-400 p-1 rounded-full hover:bg-slate-800 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                             </button>
                           </div>
                           <div className="grid grid-cols-2 gap-2 cursor-pointer relative" onClick={() => setIsFullScreenBloch(true)}>
                              {Array.from({length: WIRES}, (_, q) => (
                                <div key={q} className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 flex flex-col items-center shadow-sm hover:border-cyan-500/30 transition-colors">
                                   <BlochSphere state={getReducedState(q)} size={120} />
                                   <span className="text-xs text-slate-400 font-mono mt-2 font-bold">q{q}</span>
                                </div>
                              ))}
                           </div>
                        </div>

                        <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                           {['statevector', 'phasor', 'measure', 'entanglement', 'tunneling'].map(m => (
                              <button key={m} onClick={() => setVizMode(m as any)} className={`flex-1 py-1 px-2 text-[10px] uppercase font-bold rounded transition-colors whitespace-nowrap ${vizMode === m ? 'bg-slate-800 text-cyan-400 shadow ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}>
                                 {m === 'entanglement' ? 'Entangle' : m}
                              </button>
                           ))}
                        </div>

                        <div className={`relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden ${vizMode === 'tunneling' ? 'h-[500px]' : 'min-h-[300px]'} flex items-center justify-center shadow-inner group`}>
                           <button 
                                onClick={() => setIsFullScreenViz(true)}
                                className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-slate-400 hover:text-white rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                title="Full Screen"
                           >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                           </button>

                           {vizMode === 'statevector' && <StatevectorVisualizer amplitudes={amplitudes} />}
                           {vizMode === 'phasor' && <PolarPlotVisualizer amplitudes={amplitudes} />}
                           {vizMode === 'measure' && <MeasurementLab amplitudes={amplitudes} />}
                           {vizMode === 'entanglement' && <EntanglementVisualizer amplitudes={amplitudes} />}
                           {vizMode === 'tunneling' && <QuantumTunnelingVisualizer />}
                        </div>
                     </div>
                  ) : activeTab === 'tutor' ? (
                     <div className="h-full flex flex-col">
                        <ChatInterface currentGates={flattenedCircuit} onApplyCircuit={handleLoadGates} />
                     </div>
                  ) : activeTab === 'solver' ? (
                     <div className="h-full flex flex-col">
                        <QuantumSolver onLoadGates={handleLoadGates} />
                     </div>
                  ) : (
                    <div className="h-full flex flex-col">
                        <HardwareBridge amplitudes={amplitudes} numQubits={WIRES} />
                    </div>
                  )}
               </div>
           </div>
        </aside>

        {activePopup && (
           <GateSelector x={activePopup.x} y={activePopup.y} palette={PALETTE} onSelect={handlePopupSelect} onClose={() => setActivePopup(null)} />
        )}

        {/* Bloch Sphere Full Screen Modal */}
        {isFullScreenBloch && (
            <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
                <div className="p-6 flex justify-between items-center border-b border-slate-800/50 bg-slate-900/50">
                   <div className="flex items-center gap-4">
                       <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Hilbert Space</h2>
                   </div>
                   <button onClick={() => setIsFullScreenBloch(false)} className="p-3 bg-slate-900 rounded-full hover:bg-slate-800 border border-slate-700 text-slate-300 transition-all">Close</button>
                </div>
                <div className="flex-1 overflow-auto p-8 lg:p-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 items-center justify-items-center">
                   {Array.from({length: WIRES}, (_, q) => (
                      <div key={q} className="flex flex-col items-center gap-6 animate-in zoom-in-50 duration-500" style={{ animationDelay: `${q * 100}ms` }}>
                          <div className="text-2xl font-bold text-slate-300 font-mono">Qubit {q}</div>
                          <div className="bg-slate-900/30 rounded-full p-4 border border-slate-800/50 shadow-2xl">
                             <BlochSphere state={getReducedState(q)} size={350} />
                          </div>
                      </div>
                   ))}
                </div>
            </div>
        )}

        {/* General Visualizer Full Screen Modal */}
        {isFullScreenViz && (
            <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                     <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest">{vizMode === 'entanglement' ? 'Entanglement Graph' : vizMode}</h2>
                     <button onClick={() => setIsFullScreenViz(false)} className="p-2 bg-slate-800 rounded-full hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                </div>
                <div className="flex-1 p-8 overflow-hidden flex items-center justify-center">
                     <div className="w-full h-full max-w-5xl bg-slate-900/50 rounded-xl border border-slate-800 p-6 shadow-2xl relative">
                          {vizMode === 'statevector' && <StatevectorVisualizer amplitudes={amplitudes} />}
                          {vizMode === 'phasor' && <PolarPlotVisualizer amplitudes={amplitudes} />}
                          {vizMode === 'measure' && <MeasurementLab amplitudes={amplitudes} />}
                          {vizMode === 'entanglement' && <EntanglementVisualizer amplitudes={amplitudes} />}
                          {vizMode === 'tunneling' && <QuantumTunnelingVisualizer />}
                     </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');
const root = createRoot(rootElement);
root.render(<App />);
