import { GateType } from '../types';

export interface SimpleGate {
  t: GateType;
  w: number; // target wire
  c?: number; // control wire
  s: number; // step index
}

export interface CircuitExample {
  name: string;
  gates: SimpleGate[];
}

export const CIRCUIT_EXAMPLES: CircuitExample[] = [
  {
    name: "1. Bell State (|Φ⁺>)",
    gates: [
      { t: 'H', w: 0, s: 0 },
      { t: 'CX', w: 1, c: 0, s: 1 }
    ]
  },
  {
    name: "2. Bell State (|Φ⁻>)",
    gates: [
      { t: 'X', w: 0, s: 0 },
      { t: 'H', w: 0, s: 1 },
      { t: 'CX', w: 1, c: 0, s: 2 }
    ]
  },
  {
    name: "3. Bell State (|Ψ⁺>)",
    gates: [
      { t: 'X', w: 1, s: 0 },
      { t: 'H', w: 0, s: 1 },
      { t: 'CX', w: 1, c: 0, s: 2 }
    ]
  },
  {
    name: "4. Bell State (|Ψ⁻>)",
    gates: [
      { t: 'X', w: 1, s: 0 },
      { t: 'H', w: 0, s: 1 },
      { t: 'Z', w: 0, s: 2 },
      { t: 'CX', w: 1, c: 0, s: 3 }
    ]
  },
  {
    name: "5. GHZ State (3-Qubit)",
    gates: [
      { t: 'H', w: 0, s: 0 },
      { t: 'CX', w: 1, c: 0, s: 1 },
      { t: 'CX', w: 2, c: 1, s: 2 }
    ]
  },
  {
    name: "6. GHZ State (4-Qubit)",
    gates: [
      { t: 'H', w: 0, s: 0 },
      { t: 'CX', w: 1, c: 0, s: 1 },
      { t: 'CX', w: 2, c: 1, s: 2 },
      { t: 'CX', w: 3, c: 2, s: 3 }
    ]
  },
  {
    name: "7. Superposition (All)",
    gates: [
      { t: 'H', w: 0, s: 0 },
      { t: 'H', w: 1, s: 0 },
      { t: 'H', w: 2, s: 0 },
      { t: 'H', w: 3, s: 0 }
    ]
  },
  {
    name: "8. Swap Gate (q0-q1)",
    gates: [
      { t: 'CX', w: 1, c: 0, s: 0 },
      { t: 'CX', w: 0, c: 1, s: 1 },
      { t: 'CX', w: 1, c: 0, s: 2 }
    ]
  },
  {
    name: "9. QFT (2-Qubit)",
    gates: [
      { t: 'H', w: 0, s: 0 },
      { t: 'CS', w: 0, c: 1, s: 1 },
      { t: 'H', w: 1, s: 2 },
      // Swap q0, q1
      { t: 'CX', w: 1, c: 0, s: 3 },
      { t: 'CX', w: 0, c: 1, s: 4 },
      { t: 'CX', w: 1, c: 0, s: 5 }
    ]
  },
  {
    name: "10. Phase Kickback",
    gates: [
      { t: 'H', w: 0, s: 0 },
      { t: 'X', w: 1, s: 0 },
      { t: 'H', w: 1, s: 1 },
      { t: 'CX', w: 1, c: 0, s: 2 }
    ]
  },
  {
    name: "11. Grover's Search (2-Qubit |11>)",
    gates: [
      { t: 'H', w: 0, s: 0 }, { t: 'H', w: 1, s: 0 },
      { t: 'CZ', w: 1, c: 0, s: 1 }, // Oracle for |11>
      { t: 'H', w: 0, s: 2 }, { t: 'H', w: 1, s: 2 },
      { t: 'X', w: 0, s: 3 }, { t: 'X', w: 1, s: 3 },
      { t: 'CZ', w: 1, c: 0, s: 4 }, // H Z H = X Z X
      { t: 'X', w: 0, s: 5 }, { t: 'X', w: 1, s: 5 },
      { t: 'H', w: 0, s: 6 }, { t: 'H', w: 1, s: 6 }
    ]
  },
  {
    name: "12. Deutsch (Balanced)",
    gates: [
      { t: 'X', w: 1, s: 0 },
      { t: 'H', w: 0, s: 1 }, { t: 'H', w: 1, s: 1 },
      { t: 'CX', w: 1, c: 0, s: 2 }, // Balanced Oracle
      { t: 'H', w: 0, s: 3 }
    ]
  },
  {
    name: "13. Deutsch (Constant)",
    gates: [
      { t: 'X', w: 1, s: 0 },
      { t: 'H', w: 0, s: 1 }, { t: 'H', w: 1, s: 1 },
      // Constant Oracle (Identity or X on q1, here Identity)
      { t: 'H', w: 0, s: 3 }
    ]
  },
  {
    name: "14. Teleportation Prep",
    gates: [
      { t: 'H', w: 1, s: 0 },
      { t: 'CX', w: 2, c: 1, s: 1 }, // Entangle 1 & 2
      { t: 'X', w: 0, s: 0 }, // Prep message on 0
      { t: 'CX', w: 1, c: 0, s: 2 },
      { t: 'H', w: 0, s: 3 }
    ]
  },
  {
    name: "15. Bernstein-Vazirani (s=11)",
    gates: [
      { t: 'X', w: 2, s: 0 }, // Ancilla
      { t: 'H', w: 0, s: 1 }, { t: 'H', w: 1, s: 1 }, { t: 'H', w: 2, s: 1 },
      { t: 'CX', w: 2, c: 0, s: 2 }, 
      { t: 'CX', w: 2, c: 1, s: 3 },
      { t: 'H', w: 0, s: 4 }, { t: 'H', w: 1, s: 4 }
    ]
  },
  {
    name: "16. Graph State (Linear)",
    gates: [
      { t: 'H', w: 0, s: 0 }, { t: 'H', w: 1, s: 0 }, { t: 'H', w: 2, s: 0 }, { t: 'H', w: 3, s: 0 },
      { t: 'CZ', w: 1, c: 0, s: 1 },
      { t: 'CZ', w: 2, c: 1, s: 2 },
      { t: 'CZ', w: 3, c: 2, s: 3 }
    ]
  },
  {
    name: "17. Graph State (Ring)",
    gates: [
      { t: 'H', w: 0, s: 0 }, { t: 'H', w: 1, s: 0 }, { t: 'H', w: 2, s: 0 }, { t: 'H', w: 3, s: 0 },
      { t: 'CZ', w: 1, c: 0, s: 1 },
      { t: 'CZ', w: 2, c: 1, s: 2 },
      { t: 'CZ', w: 3, c: 2, s: 3 },
      { t: 'CZ', w: 0, c: 3, s: 4 }
    ]
  },
  {
    name: "18. Repetition Code (Encode)",
    gates: [
      { t: 'CX', w: 1, c: 0, s: 0 },
      { t: 'CX', w: 2, c: 0, s: 1 },
      { t: 'X', w: 1, s: 3 } // Simulate Error
    ]
  },
  {
    name: "19. T-Depth Test",
    gates: [
      { t: 'H', w: 0, s: 0 }, { t: 'H', w: 1, s: 0 }, { t: 'H', w: 2, s: 0 }, { t: 'H', w: 3, s: 0 },
      { t: 'T', w: 0, s: 1 }, { t: 'T', w: 1, s: 1 }, { t: 'T', w: 2, s: 1 }, { t: 'T', w: 3, s: 1 },
      { t: 'H', w: 0, s: 2 }, { t: 'H', w: 1, s: 2 }, { t: 'H', w: 2, s: 2 }, { t: 'H', w: 3, s: 2 }
    ]
  },
  {
    name: "20. Entanglement Swapping",
    gates: [
      { t: 'H', w: 0, s: 0 }, { t: 'CX', w: 1, c: 0, s: 1 }, // Bell 0-1
      { t: 'H', w: 2, s: 0 }, { t: 'CX', w: 3, c: 2, s: 1 }, // Bell 2-3
      { t: 'CX', w: 2, c: 1, s: 2 }, // Bell Measure 1-2
      { t: 'H', w: 1, s: 3 }
    ]
  }
];
