
export type GateType = 'H' | 'X' | 'Z' | 'Y' | 'S' | 'T' | 'I' | 'CX' | 'CZ' | 'CY' | 'CS';

export interface Gate {
  id: string;
  type: GateType;
  target: number; // 0 or 1
  control?: number; // 0 or 1 (for controlled gates)
}

export interface Complex {
  r: number;
  i: number;
}

export interface QubitState {
  theta: number;
  phi: number;
  probabilityZero: number;
  probabilityOne: number;
}

export interface SystemState {
  amplitudes: Complex[]; // Length 4 for 2 qubits
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  circuitData?: {
    gates: Gate[];
    description: string;
  };
}

export interface CircuitStep {
  gates: (Gate | null)[];
}
