
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import BlochSphere from './components/BlochSphere';
import ChatInterface from './components/ChatInterface';
import StatevectorVisualizer from './components/StatevectorVisualizer';
import MeasurementLab from './components/MeasurementLab';
import PolarPlotVisualizer from './components/PolarPlotVisualizer';
import QuantumTunnelingVisualizer from './components/QuantumTunnelingVisualizer';
import EntanglementVisualizer from './components/EntanglementVisualizer';
import UnitaryMatrixVisualizer from './components/UnitaryMatrixVisualizer';
import QSphere from './components/QSphere';
import HardwareBridge from './components/HardwareBridge';
import QuantumSolver from './components/QuantumSolver';
import CodeViewer from './components/CodeViewer';
import QuantumRigVisualizer from './components/QuantumRigVisualizer';
import GateSelector from './components/GateSelector';
import SettingsModal from './components/SettingsModal';
import ReportModal from './components/ReportModal';
import { generatePDFReport } from './services/reportService';
import { generateRigSpecification, RigSpecification } from './services/geminiService';
import { Gate, GateType, Complex, QubitState, AlignmentMode } from './types';
import { CIRCUIT_EXAMPLES } from './data/circuitExamples';

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
  config?: { qubits: number; steps: number };
  alignment?: AlignmentMode;
}

const PALETTE: DraggableGate[] = [
  { id: 'H', label: 'H (Hadamard)', color: 'bg-blue-600' },
  { id: 'X', label: 'X (NOT)', color: 'bg-pink-600' },
  { id: 'Y', label: 'Y (Pauli-Y)', color: 'bg-teal-600' },
  { id: 'Z', label: 'Z (Phase π)', color: 'bg-orange-500' },
  { id: 'S', label: 'S (Phase π/2)', color: 'bg-purple-600' },
  { id: 'T', label: 'T (Phase π/4)', color: 'bg-fuchsia-600' },
  { id: 'CX', label: 'CNOT', color: 'bg-sky-500' },
  { id: 'CZ', label: 'CZ (Control-Z)', color: 'bg-emerald-500' },
  { id: 'CY', label: 'CY (Control-Y)', color: 'bg-teal-500' },
  { id: 'CS', label: 'CS (Control-S)', color: 'bg-purple-500' },
];

const App: React.FC = () => {
  const [numQubits, setNumQubits] = useState(4);
  const [numSteps, setNumSteps] = useState(20);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [alignmentMode, setAlignmentMode] = useState<AlignmentMode>('freeform');

  const [history, setHistory] = useState<(Gate | null)[][][]>([
    Array.from({ length: 20 }, () => Array(4).fill(null))
  ]);
  const [currentStep, setCurrentStep] = useState(0);

  const grid = history[currentStep];

  const [projectTitle, setProjectTitle] = useState("Untitled Circuit");
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  
  const [isLocked, setIsLocked] = useState(false);
  const [isFullScreenBloch, setIsFullScreenBloch] = useState(false);
  const [isFullScreenViz, setIsFullScreenViz] = useState(false); 
  
  const [rigSpec, setRigSpec] = useState<RigSpecification | null>(null);
  const [isGeneratingRig, setIsGeneratingRig] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const boardRef = useRef<HTMLDivElement>(null);

  // --- Alignment Logic Implementation ---
  const compactGrid = (g: (Gate | null)[][], mode: AlignmentMode): (Gate | null)[][] => {
    if (mode === 'freeform') return g;

    const allGates: Gate[] = [];
    const seen = new Set<string>();

    g.forEach(step => {
      step.forEach(gate => {
        if (gate && !seen.has(gate.id)) {
          allGates.push(gate);
          seen.add(gate.id);
        }
      });
    });

    const newGrid = Array.from({ length: numSteps }, () => Array(numQubits).fill(null));
    const nextAvailableStep = new Array(numQubits).fill(0);

    allGates.forEach(gate => {
      const qT = gate.target;
      const qC = gate.control;
      
      let stepToPlace = 0;
      if (qC !== undefined) {
        stepToPlace = Math.max(nextAvailableStep[qT], nextAvailableStep[qC]);
      } else {
        stepToPlace = nextAvailableStep[qT];
      }

      if (stepToPlace < numSteps) {
        newGrid[stepToPlace][qT] = gate;
        nextAvailableStep[qT] = stepToPlace + 1;
        if (qC !== undefined) {
          nextAvailableStep[qC] = stepToPlace + 1;
        }
      }
    });

    return newGrid;
  };

  const handleConfigChange = (newQubits: number, newSteps: number) => {
    setNumQubits(newQubits);
    setNumSteps(newSteps);

    const resizeGrid = (g: (Gate | null)[][]) => {
        let newGrid = [...g];
        if (newSteps > newGrid.length) {
            const extra = Array.from({ length: newSteps - newGrid.length }, () => Array(newQubits).fill(null));
            newGrid = [...newGrid, ...extra];
        } else {
            newGrid = newGrid.slice(0, newSteps);
        }
        newGrid = newGrid.map(step => {
            let newStep = [...step];
            if (newQubits > newStep.length) {
                 newStep = [...newStep, ...Array(newQubits - newStep.length).fill(null)];
            } else {
                 newStep = newStep.slice(0, newQubits);
            }
            return newStep;
        });
        return newGrid;
    };

    setHistory(prev => prev.map(resizeGrid));
  };

  const updateGrid = (newGrid: (Gate | null)[][]) => {
    if (isLocked) return;
    const finalGrid = compactGrid(newGrid, alignmentMode);
    const newHistory = history.slice(0, currentStep + 1);
    newHistory.push(finalGrid);
    setHistory(newHistory);
    setCurrentStep(newHistory.length - 1);
  };

  const toggleAlignmentMode = (mode: AlignmentMode) => {
    if (isLocked) return;
    setAlignmentMode(mode);
    const alignedGrid = compactGrid(grid, mode);
    const newHistory = history.slice(0, currentStep + 1);
    newHistory.push(alignedGrid);
    setHistory(newHistory);
    setCurrentStep(newHistory.length - 1);
  };

  const undo = () => {
    if (isLocked) return;
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const redo = () => {
    if (isLocked) return;
    if (currentStep < history.length - 1) {
       setCurrentStep(currentStep + 1);
    }
  };
  
  const handleHardwareControl = (action: 'next' | 'prev' | 'reset') => {
      if (isLocked) return;
      if (action === 'next') redo();
      else if (action === 'prev') undo();
      else if (action === 'reset') {
          setCurrentStep(0);
          resetView();
      }
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const fitToCircuit = (targetGrid = grid) => {
    if (!boardRef.current) return;
    let maxStep = -1;
    targetGrid.forEach((stepGates, sIdx) => {
        if (stepGates.some(g => g !== null)) maxStep = sIdx;
    });

    const visibleSteps = Math.max(maxStep + 4, 6); 
    const isMobile = window.innerWidth < 768;
    const STEP_W = isMobile ? 64 : 80;
    const WIRE_LABEL_W = 64; 
    const PADDING_X = 96;
    const usedWidth = visibleSteps * STEP_W + WIRE_LABEL_W + PADDING_X;
    const totalWidth = numSteps * STEP_W + WIRE_LABEL_W + PADDING_X;
    const availableWidth = boardRef.current.clientWidth;
    
    let newZoom = availableWidth / usedWidth;
    newZoom = Math.min(Math.max(newZoom, 0.5), 1.3); 
    const newPanX = (totalWidth / 2) - (usedWidth / 2);
    setZoom(newZoom);
    setPan({ x: newPanX, y: 0 });
  };
  
  useEffect(() => {
      const handleResize = () => {
          const timeoutId = setTimeout(() => fitToCircuit(), 100);
          return () => clearTimeout(timeoutId);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, [grid]);
  
  const toggleBrowserFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleMagicGenerate = async () => {
      setIsGeneratingRig(true);
      let depth = 0;
      grid.forEach((step, i) => { if (step.some(g => g !== null)) depth = i + 1; });
      const spec = await generateRigSpecification(numQubits, depth);
      setRigSpec(spec);
      setIsGeneratingRig(false);
  };

  const saveProject = () => {
    const projectData: ProjectFile = {
      version: "1.2",
      title: projectTitle,
      history: history,
      currentStep: currentStep,
      timestamp: Date.now(),
      config: { qubits: numQubits, steps: numSteps },
      alignment: alignmentMode
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
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
        
        if (data.history && Array.isArray(data.history)) {
          const loadedQubits = data.config?.qubits || data.history[0][0].length;
          const loadedSteps = data.config?.steps || data.history[0].length;
          
          setNumQubits(loadedQubits);
          setNumSteps(loadedSteps);
          setHistory(data.history);
          setAlignmentMode(data.alignment || 'freeform');
          
          const newStep = typeof data.currentStep === 'number' ? Math.min(data.currentStep, data.history.length - 1) : data.history.length - 1;
          setCurrentStep(newStep);
          setProjectTitle(data.title || "Untitled Circuit");
          
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
    e.target.value = ''; 
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
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
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, history, projectTitle, isLocked]);

  const [amplitudes, setAmplitudes] = useState<Complex[]>([]);
  const [activeTab, setActiveTab] = useState<'visuals' | 'code' | 'tutor' | 'hardware' | 'solver'>('visuals');
  const [vizMode, setVizMode] = useState<'statevector' | 'qsphere' | 'phasor' | 'measure' | 'tunneling' | 'entanglement' | 'matrix'>('statevector');
  const [dragOverCell, setDragOverCell] = useState<{ step: number, wire: number } | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(384); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [isResizing, setIsResizing] = useState(false);

  const [isGatePaletteOpen, setIsGatePaletteOpen] = useState(true);

  const [activePopup, setActivePopup] = useState<{ step: number, wire: number, x: number, y: number } | null>(null);

  const flattenedCircuit = useMemo(() => {
    const circuit: Gate[] = [];
    grid.forEach((step) => {
      step.forEach((gate) => {
        if (gate) circuit.push(gate);
      });
    });
    return circuit;
  }, [grid]);

  useEffect(() => {
    const numStates = 1 << numQubits;
    let state = new Array(numStates).fill(zero);
    state[0] = one; 
    
    const INV_SQRT_2 = 1 / Math.sqrt(2);

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

    flattenedCircuit.forEach(gate => {
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
    setAmplitudes(state);
  }, [flattenedCircuit, numQubits]);

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

  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
          e.preventDefault(); 
          const zoomSensitivity = 0.0015;
          const delta = -e.deltaY * zoomSensitivity;
          const newZoom = Math.min(Math.max(zoom + delta, 0.4), 3.0);
          if (boardRef.current) {
            const rect = boardRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const mouseX = e.clientX - centerX;
            const mouseY = e.clientY - centerY;
            const scaleFactor = newZoom / zoom;
            const newPanX = mouseX - (mouseX - pan.x) * scaleFactor;
            const newPanY = mouseY - (mouseY - pan.y) * scaleFactor;
            setPan({ x: newPanX, y: newPanY });
          }
          setZoom(newZoom);
      } else {
          setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
  };

  const startPan = (e: React.MouseEvent) => {
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
            let defaultControl = (wire + 1) % numQubits;
            if (defaultControl === wire) defaultControl = (wire - 1 + numQubits) % numQubits;
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
      let defaultControl = (wireIdx + 1) % numQubits;
      if (defaultControl === wireIdx) defaultControl = (wireIdx - 1 + numQubits) % numQubits;
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
    for (let step = 0; step < numSteps; step++) {
      const col = newGrid[step];
      if (['CX', 'CZ', 'CY', 'CS'].includes(gate.id)) {
        for(let t=0; t<numQubits; t++) {
             let c = (t + 1) % numQubits;
             if (!col[t] && !col[c]) {
                 const newGate: Gate = { id: Math.random().toString(36).substr(2, 9), type: gate.id, target: c, control: t };
                 newGrid[step][c] = newGate;
                 updateGrid(newGrid);
                 return;
             }
        }
      } else {
        for(let w=0; w<numQubits; w++) {
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
    updateGrid(Array.from({ length: numSteps }, () => Array(numQubits).fill(null)));
    resetView();
  };

  const loadExample = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isLocked) return;
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) return;
    const example = CIRCUIT_EXAMPLES[idx];
    const maxWire = Math.max(...example.gates.map(g => Math.max(g.w, g.c ?? 0)));
    if (maxWire >= numQubits) {
        alert(`This example requires ${maxWire + 1} qubits. Please adjust settings.`);
        e.target.value = "";
        return;
    }
    const newGrid = Array.from({ length: numSteps }, () => Array(numQubits).fill(null));
    example.gates.forEach(g => {
        if (g.s < numSteps && g.w < numQubits) {
             const gate: Gate = { id: Math.random().toString(36).substr(2, 9), type: g.t, target: g.w, control: g.c };
             newGrid[g.s][g.w] = gate;
        }
    });
    updateGrid(newGrid);
    setProjectTitle(example.name);
    e.target.value = ""; 
    setTimeout(() => fitToCircuit(newGrid), 50); 
  };
  
  const handleLoadGates = (gates: Gate[]) => {
      if (isLocked) return;
      const newGrid = Array.from({ length: numSteps }, () => Array(numQubits).fill(null));
      let currentCol = 0;
      gates.forEach(gate => {
          if (currentCol >= numSteps) return;
          if (gate.target >= numQubits || (gate.control !== undefined && gate.control >= numQubits)) return;
          const isTargetOccupied = newGrid[currentCol][gate.target] !== null;
          const isControlOccupied = gate.control !== undefined ? newGrid[currentCol][gate.control!] !== null : false;
          if (isTargetOccupied || isControlOccupied) currentCol++;
          if (currentCol < numSteps) newGrid[currentCol][gate.target] = gate;
      });
      updateGrid(newGrid);
      setTimeout(() => fitToCircuit(newGrid), 50); 
  };

  const handleGenerateReport = (studentName: string, password?: string) => {
      generatePDFReport({
          studentName,
          projectTitle,
          password,
          amplitudes,
          gates: grid,
          numQubits
      });
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
      <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          config={{ qubitCount: numQubits, stepCount: numSteps }}
          onConfigChange={handleConfigChange}
      />
      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} onGenerate={handleGenerateReport} projectTitle={projectTitle} />
      {rigSpec && <QuantumRigVisualizer spec={rigSpec} numQubits={numQubits} gates={flattenedCircuit} onClose={() => setRigSpec(null)} />}

      {/* Redesigned Desktop-Friendly Navbar */}
      <header className="flex flex-col md:flex-row items-center justify-between px-4 md:px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0 z-20 shadow-lg gap-4 md:gap-0">
        
        {/* Left: Branding & Project Title */}
        <div className="flex items-center gap-4 w-full md:w-auto">
           <div className="relative w-10 h-10 flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all duration-300">
               <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <circle cx="12" cy="12" r="3" strokeWidth="2" />
                   <ellipse cx="12" cy="12" rx="8" ry="3" strokeWidth="1.5" transform="rotate(45 12 12)" />
                   <ellipse cx="12" cy="12" rx="8" ry="3" strokeWidth="1.5" transform="rotate(-45 12 12)" />
               </svg>
           </div>
           <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em] leading-none mb-1">QuantumLens Lab</span>
              <input 
                type="text" 
                value={projectTitle} 
                onChange={(e) => !isLocked && setProjectTitle(e.target.value)}
                readOnly={isLocked}
                className={`bg-transparent text-white font-bold text-base border-b border-transparent hover:border-slate-700 focus:border-cyan-500 outline-none w-full max-w-[200px] transition-all placeholder-slate-600 truncate ${isLocked ? 'cursor-default border-none' : ''}`}
                placeholder="Untitled Circuit"
              />
           </div>
        </div>

        {/* Center: Major Tool Groups */}
        <div className="flex flex-wrap items-center justify-center gap-3 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            
            {/* Group: AI Generation */}
            <div className="flex items-center gap-2 pr-2">
                <button 
                    onClick={handleMagicGenerate}
                    disabled={isGeneratingRig}
                    className="group relative h-9 px-4 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-2 shadow-lg hover:shadow-orange-500/30 transition-all active:scale-95 disabled:grayscale shrink-0"
                    title="Generate 3D Quantum Rig"
                >
                    {isGeneratingRig ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                        <svg className="w-4 h-4 text-yellow-200" fill="currentColor" viewBox="0 0 20 20"><path d="M10 1l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5L10 1z" /></svg>
                    )}
                    <span className="hidden lg:inline">Magic Model</span>
                </button>
            </div>

            <div className="w-px h-6 bg-slate-800 hidden md:block"></div>

            {/* Group: Layout Alignment */}
            <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50 shadow-inner">
               {[
                  { mode: 'freeform', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', label: 'Free' },
                  { mode: 'left', icon: 'M11 19l-7-7 7-7m8 14l-7-7 7-7', label: 'Left' },
                  { mode: 'layers', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', label: 'Grid' }
               ].map(item => (
                 <button 
                    key={item.mode}
                    onClick={() => toggleAlignmentMode(item.mode as AlignmentMode)}
                    className={`h-7 px-3 rounded-md transition-all flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight ${alignmentMode === item.mode ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
                    title={`${item.label} Alignment`}
                 >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={item.icon} /></svg>
                    <span className="hidden xl:inline">{item.label}</span>
                 </button>
               ))}
            </div>

            <div className="w-px h-6 bg-slate-800 hidden md:block"></div>

            {/* Group: History Controls */}
            <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50 shadow-inner">
               <button 
                  onClick={undo} 
                  disabled={currentStep === 0 || isLocked} 
                  className={`h-7 px-3 rounded-md transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight ${currentStep === 0 || isLocked ? 'text-slate-600 cursor-not-allowed opacity-50' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                  title="Undo (Ctrl+Z)"
               >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
               </button>
               <div className="w-px h-4 bg-slate-700 self-center"></div>
               <button 
                  onClick={redo} 
                  disabled={currentStep === history.length - 1 || isLocked} 
                  className={`h-7 px-3 rounded-md transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight ${currentStep === history.length - 1 || isLocked ? 'text-slate-600 cursor-not-allowed opacity-50' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                  title="Redo (Ctrl+Y)"
               >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
               </button>
            </div>

            {/* Group: File Operations */}
            <div className="flex gap-2">
                <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50 shadow-inner">
                    <button onClick={saveProject} title="Save Project (Ctrl+S)" className="h-7 px-3 rounded-md hover:bg-slate-700 transition-all text-slate-300 flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                        <span className="hidden xl:inline">Save</span>
                    </button>
                    <div className="w-px h-4 bg-slate-700 self-center"></div>
                    <button onClick={() => !isLocked && projectFileInputRef.current?.click()} disabled={isLocked} className={`h-7 px-3 rounded-md transition-all text-slate-300 flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight ${isLocked ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-700'}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        <span className="hidden xl:inline">Load</span>
                    </button>
                    <input type="file" ref={projectFileInputRef} onChange={loadProject} accept=".qjson,.json" className="hidden" />
                </div>
                
                <select onChange={loadExample} disabled={isLocked} className={`h-9 bg-slate-800 text-slate-300 text-[10px] font-bold uppercase tracking-wider px-3 rounded-lg border border-slate-700 outline-none transition-all focus:ring-2 focus:ring-cyan-500/50 cursor-pointer ${isLocked ? 'opacity-30' : 'hover:bg-slate-700'}`} defaultValue="">
                    <option value="" disabled>Library</option>
                    {CIRCUIT_EXAMPLES.map((ex, idx) => (
                        <option key={idx} value={idx}>{ex.name}</option>
                    ))}
                </select>
            </div>
        </div>

        {/* Right: Workspace & State Toggles */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            
           <button onClick={() => setIsLocked(!isLocked)} className={`h-9 px-4 rounded-lg transition-all duration-300 text-[11px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-lg ${isLocked ? 'bg-amber-950/40 text-amber-400 border-amber-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}>
             {isLocked ? (
                 <>
                   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                   <span>Locked</span>
                 </>
             ) : (
                 <>
                   <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                   <span>Edit Mode</span>
                 </>
             )}
          </button>

          <div className="flex bg-slate-800/80 p-1 rounded-lg border border-slate-700/50 shadow-inner">
             <button onClick={() => setIsReportModalOpen(true)} className="w-9 h-7 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center" title="Generate PDF Report">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
             </button>
             <button onClick={() => setIsSettingsOpen(true)} className="w-9 h-7 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center" title="System Settings">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
             </button>
             <button onClick={toggleBrowserFullScreen} className="w-9 h-7 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-all flex items-center justify-center" title="Full Screen View">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
             </button>
          </div>

          <div className="flex gap-2 ml-2">
             <button onClick={() => setIsGatePaletteOpen(!isGatePaletteOpen)} className={`h-9 px-3 rounded-lg text-[10px] font-bold uppercase border transition-all ${isGatePaletteOpen ? 'bg-indigo-600/90 text-white border-indigo-400 shadow-lg shadow-indigo-900/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                Gates
             </button>
             <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`h-9 px-3 rounded-lg text-[10px] font-bold uppercase border transition-all ${isSidebarOpen ? 'bg-blue-600/90 text-white border-blue-400 shadow-lg shadow-blue-900/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                Panel
             </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside className={`bg-slate-900 border-r border-slate-800 flex flex-col items-center shrink-0 z-30 shadow-xl transition-all duration-300 overflow-hidden absolute md:relative h-full ${isLocked ? 'opacity-50 pointer-events-none grayscale' : ''}`} style={{ width: isGatePaletteOpen ? '6rem' : 0, padding: isGatePaletteOpen ? '1.5rem 0' : 0, transform: isGatePaletteOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
          <div className="w-24 flex flex-col items-center gap-4 overflow-y-auto custom-scrollbar h-full pb-6">
            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 whitespace-nowrap">Palette</div>
            {PALETTE.map((gate) => (
                <div key={gate.id} draggable={!isLocked} onDragStart={(e) => handleDragStart(e, gate)} onClick={() => handleGateClick(gate)} className={`w-12 h-12 md:w-14 md:h-14 ${gate.color} flex items-center justify-center rounded-lg cursor-pointer shadow-lg font-bold text-white select-none hover:scale-110 hover:shadow-xl hover:ring-2 ring-white/20 transition-all z-20 active:scale-95 shrink-0`}>
                {gate.id === 'CX' ? '⊕' : gate.id}
                </div>
            ))}
          </div>
        </aside>

        <main ref={boardRef} className={`flex-1 overflow-hidden relative bg-slate-950 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'} ${isLocked ? 'cursor-not-allowed' : ''}`} onWheel={handleWheel} onMouseDown={startPan} onMouseMove={doPan} onMouseUp={endPan} onMouseLeave={endPan}>
          <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)', backgroundSize: `${30 * zoom}px ${30 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px`, transition: isPanning ? 'none' : 'background-size 0.2s, background-position 0.2s' }} />
          <div className={`absolute top-0 left-0 w-full h-full flex items-center justify-center origin-center ${isPanning ? 'duration-0' : 'transition-transform duration-200 ease-out'}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
             <div className="relative p-12 min-w-max">
                 <div className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none z-0 pl-16 pr-8 pt-12">
                    <div className="flex flex-col gap-12">
                       {Array.from({length: numQubits}, (_, q) => (
                         <div key={q} className="relative w-full h-12 flex items-center">
                           <div className="w-full h-0.5 bg-slate-700/50 shadow-sm"></div>
                           <div className="absolute -left-12 text-slate-500 font-mono text-sm font-bold flex items-center justify-center w-8 h-8 rounded bg-slate-900 border border-slate-700">q{q}</div>
                         </div>
                       ))}
                    </div>
                 </div>
                 <div className="flex gap-0 relative z-10">
                    {grid.map((step, stepIdx) => {
                       const controllingGates = step.filter(g => g?.control !== undefined);
                       return (
                      <div key={stepIdx} className="gate-cell flex flex-col gap-12 relative w-16 md:w-20 h-full">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-800 -z-10 opacity-30 border-dashed border-l border-slate-700/30"></div>
                        {controllingGates.map((g) => {
                            if (!g || g.control === undefined) return null;
                            const controlMin = Math.min(g.target, g.control);
                            const controlMax = Math.max(g.target, g.control);
                            const connectorColor = PALETTE.find(p => p.id === g.type)?.color || 'bg-sky-500';
                            return (
                               <div key={`${g.id}-line`} className={`absolute left-1/2 -translate-x-1/2 w-1 ${connectorColor} z-0 rounded-full opacity-80 shadow-sm`} style={{ top: `${(controlMin * 6 + 1.5)}rem`, height: `${(controlMax - controlMin) * 6}rem` }}></div>
                            );
                        })}
                        {step.map((cell, wireIdx) => {
                           const isOver = dragOverCell?.step === stepIdx && dragOverCell?.wire === wireIdx;
                           const gateColor = cell ? PALETTE.find(p => p.id === cell.type)?.color || 'bg-slate-700' : '';
                           const isControlSource = !cell && step.some(g => g?.control === wireIdx);
                           const connectorColor = isControlSource ? (PALETTE.find(p => p.id === step.find(g => g?.control === wireIdx)?.type)?.color || 'bg-sky-500') : '';
                           return (
                             <div key={`${stepIdx}-${wireIdx}`} onDrop={(e) => handleDrop(e, stepIdx, wireIdx)} onDragOver={(e) => handleDragOver(e, stepIdx, wireIdx)} onDragLeave={() => setDragOverCell(null)} onClick={(e) => handleCellClick(e, stepIdx, wireIdx)} className={`w-12 h-12 mx-auto flex items-center justify-center rounded transition-all duration-200 ${isLocked ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'} ${isOver && !isLocked ? 'bg-slate-700/50 ring-2 ring-blue-500 scale-110' : ''} ${!cell && !isControlSource && !isLocked ? 'hover:bg-slate-800/50 hover:ring-1 hover:ring-slate-700' : ''}`}>
                               {cell && <div className={`w-full h-full ${gateColor} flex items-center justify-center rounded shadow-lg font-bold text-white z-20 relative pointer-events-none ring-1 ring-black/20`}>{getGateSymbol(cell.type)}</div>}
                               {isControlSource && <div className={`w-4 h-4 rounded-full ${connectorColor} shadow-lg z-20 relative transform scale-110 pointer-events-none ring-2 ring-slate-950`}></div>}
                               {!cell && !isControlSource && isOver && !isLocked && <div className="w-3 h-3 rounded-full bg-blue-400/50 animate-pulse pointer-events-none"></div>}
                             </div>
                           );
                        })}
                      </div>
                      );
                    })}
                 </div>
              </div>
          </div>
          
          {/* Enhanced Bottom HUD View Controls */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-3 z-50">
             <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-xl p-1.5 flex flex-col shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)]">
                <button onClick={() => setZoom(z => Math.min(z + 0.2, 3.0))} className="p-2.5 hover:bg-slate-800 text-slate-300 rounded-lg transition-all" title="Zoom In"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg></button>
                <div className="h-px bg-slate-800 mx-2"></div>
                <button onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))} className="p-2.5 hover:bg-slate-800 text-slate-300 rounded-lg transition-all" title="Zoom Out"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg></button>
                <div className="h-px bg-slate-800 mx-2"></div>
                <button onClick={() => fitToCircuit()} className="p-2.5 hover:bg-slate-800 text-emerald-400 rounded-lg transition-all" title="Fit to Circuit"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
                 <div className="h-px bg-slate-800 mx-2"></div>
                <button onClick={resetView} className="p-2.5 hover:bg-slate-800 text-cyan-400 rounded-lg font-black text-[9px] transition-all" title="Reset View">1:1</button>
             </div>
             <div className="bg-slate-900/90 backdrop-blur-xl px-3 py-1.5 rounded-lg text-[10px] text-slate-400 font-black font-mono text-center border border-slate-700 shadow-lg">{Math.round(zoom * 100)}%</div>
          </div>
          
          {/* Quick Clear Floating Button */}
          {!isLocked && (
              <button 
                onClick={clearCircuit}
                className="absolute bottom-6 right-6 px-5 py-2.5 bg-slate-900/90 backdrop-blur-xl border border-rose-500/30 text-rose-400 text-[10px] font-black uppercase tracking-widest rounded-xl shadow-xl hover:bg-rose-500/10 transition-all z-50 flex items-center gap-2 group"
              >
                  <svg className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Clear System
              </button>
          )}
        </main>

        <aside className={`bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 shadow-2xl z-30 absolute right-0 top-0 bottom-0 h-full md:relative transition-[width] ease-in-out ${isResizing ? 'duration-0' : 'duration-300'}`} style={{ width: isSidebarOpen ? sidebarWidth : 0 }}>
           <div className="absolute left-0 top-0 bottom-0 w-1.5 -ml-1 cursor-col-resize hover:bg-blue-500/50 z-50 transition-colors" onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }} />
           <div className="w-full h-full overflow-hidden flex flex-col">
               <div className="flex border-b border-slate-800 bg-slate-900">
                  {['visuals', 'code', 'tutor', 'hardware', 'solver'].map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800/50' : 'text-slate-500'}`}>{tab === 'visuals' ? 'Output' : tab === 'code' ? 'Code' : tab === 'tutor' ? 'AI Tutor' : tab === 'solver' ? 'Solver' : 'Hardware'}</button>
                  ))}
               </div>
               <div className="flex-1 overflow-y-auto custom-scrollbar p-0 bg-slate-900/50">
                  {activeTab === 'visuals' ? (
                     <div className="space-y-6 p-4">
                        <div className="space-y-4 group">
                           <div className="flex justify-between items-center pr-2">
                             <h3 className="text-xs uppercase text-slate-500 font-bold tracking-widest pl-1">Qubits</h3>
                             <button onClick={() => setIsFullScreenBloch(true)} className="text-slate-600 hover:text-cyan-400 p-1 rounded-full hover:bg-slate-800 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
                           </div>
                           <div className="grid grid-cols-2 gap-2 cursor-pointer relative" onClick={() => setIsFullScreenBloch(true)}>
                              {Array.from({length: numQubits}, (_, q) => (
                                <div key={q} className="bg-slate-950/50 border border-slate-800 rounded-lg p-2 flex flex-col items-center shadow-sm hover:border-cyan-500/30 transition-colors">
                                   <BlochSphere state={getReducedState(q)} size={120} />
                                   <span className="text-xs text-slate-400 font-mono mt-2 font-bold">q{q}</span>
                                </div>
                              ))}
                           </div>
                        </div>
                        <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                           {['statevector', 'qsphere', 'phasor', 'measure', 'entanglement', 'matrix', 'tunneling'].map(m => (
                              <button key={m} onClick={() => setVizMode(m as any)} className={`flex-1 py-1 px-2 text-[10px] uppercase font-bold rounded transition-colors whitespace-nowrap ${vizMode === m ? 'bg-slate-800 text-cyan-400 shadow ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}>{m === 'entanglement' ? 'Entangle' : m === 'qsphere' ? 'Q-Sphere' : m === 'matrix' ? 'Matrix' : m}</button>
                           ))}
                        </div>
                        <div className={`relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden ${vizMode === 'tunneling' ? 'h-[500px]' : 'min-h-[300px]'} flex items-center justify-center shadow-inner group`}>
                           <button onClick={() => setIsFullScreenViz(true)} className="absolute top-2 right-2 p-1.5 bg-slate-900/80 text-slate-400 hover:text-white rounded border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Full Screen"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg></button>
                           {vizMode === 'statevector' && <StatevectorVisualizer amplitudes={amplitudes} />}
                           {vizMode === 'qsphere' && <QSphere amplitudes={amplitudes} />}
                           {vizMode === 'phasor' && <PolarPlotVisualizer amplitudes={amplitudes} />}
                           {vizMode === 'measure' && <MeasurementLab amplitudes={amplitudes} />}
                           {vizMode === 'entanglement' && <EntanglementVisualizer amplitudes={amplitudes} />}
                           {vizMode === 'matrix' && <UnitaryMatrixVisualizer gates={flattenedCircuit} numQubits={numQubits} />}
                           {vizMode === 'tunneling' && <QuantumTunnelingVisualizer />}
                        </div>
                     </div>
                  ) : activeTab === 'code' ? (
                     <div className="h-full flex flex-col"><CodeViewer gates={flattenedCircuit} numQubits={numQubits} /></div>
                  ) : activeTab === 'tutor' ? (
                     <div className="h-full flex flex-col"><ChatInterface currentGates={flattenedCircuit} onApplyCircuit={handleLoadGates} numQubits={numQubits} /></div>
                  ) : activeTab === 'solver' ? (
                     <div className="h-full flex flex-col"><QuantumSolver onLoadGates={handleLoadGates} /></div>
                  ) : (
                    <div className="h-full flex flex-col"><HardwareBridge amplitudes={amplitudes} numQubits={numQubits} onCircuitControl={handleHardwareControl} /></div>
                  )}
               </div>
           </div>
        </aside>

        {activePopup && (
           <GateSelector x={activePopup.x} y={activePopup.y} palette={PALETTE} onSelect={handlePopupSelect} onClose={() => setActivePopup(null)} />
        )}

        {isFullScreenBloch && (
            <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
                <div className="p-6 flex justify-between items-center border-b border-slate-800/50 bg-slate-900/50">
                   <div className="flex items-center gap-4"><h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Hilbert Space</h2></div>
                   <button onClick={() => setIsFullScreenBloch(false)} className="p-3 bg-slate-900 rounded-full hover:bg-slate-800 border border-slate-700 text-slate-300 transition-all">Close</button>
                </div>
                <div className="flex-1 overflow-auto p-8 lg:p-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 items-center justify-items-center">
                   {Array.from({length: numQubits}, (_, q) => (
                      <div key={q} className="flex flex-col items-center gap-6 animate-in zoom-in-50 duration-500" style={{ animationDelay: `${q * 100}ms` }}>
                          <div className="text-2xl font-bold text-slate-300 font-mono">Qubit {q}</div>
                          <div className="bg-slate-900/30 rounded-full p-4 border border-slate-800/50 shadow-2xl"><BlochSphere state={getReducedState(q)} size={350} /></div>
                      </div>
                   ))}
                </div>
            </div>
        )}

        {isFullScreenViz && (
            <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                     <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest">{vizMode === 'entanglement' ? 'Entanglement Graph' : vizMode === 'qsphere' ? 'Q-Sphere Superposition' : vizMode === 'matrix' ? 'Unitary Matrix' : vizMode}</h2>
                     <button onClick={() => setIsFullScreenViz(false)} className="p-2 bg-slate-800 rounded-full hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="flex-1 p-8 overflow-hidden flex items-center justify-center">
                     <div className="w-full h-full max-w-5xl bg-slate-900/50 rounded-xl border border-slate-800 p-6 shadow-2xl relative">
                          {vizMode === 'statevector' && <StatevectorVisualizer amplitudes={amplitudes} />}
                          {vizMode === 'qsphere' && <QSphere amplitudes={amplitudes} />}
                          {vizMode === 'phasor' && <PolarPlotVisualizer amplitudes={amplitudes} />}
                          {vizMode === 'measure' && <MeasurementLab amplitudes={amplitudes} />}
                          {vizMode === 'entanglement' && <EntanglementVisualizer amplitudes={amplitudes} />}
                          {vizMode === 'matrix' && <UnitaryMatrixVisualizer gates={flattenedCircuit} numQubits={numQubits} />}
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
