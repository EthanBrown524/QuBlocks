/**
 * Canonical, serializable program representation for QuBlocks.
 * The block editor, simulator, and every compiler backend all consume
 * this AST — nothing talks to the editor directly.
 */

/** MVP gate set. */
export type GateName =
  | "H"
  | "X"
  | "Y"
  | "Z"
  | "S"
  | "T"
  | "RX"
  | "RY"
  | "RZ"
  | "CNOT"
  | "CZ"
  | "SWAP"
  | "CCX";

export interface GateOp {
  kind: "gate";
  gate: GateName;
  qubits: number[];
  params?: number[];
}

export interface LoopOp {
  kind: "loop";
  /** Inclusive-exclusive iteration range, [start, end). */
  range: [number, number];
  body: Operation[];
}

export interface CallOp {
  kind: "call";
  subroutine: string;
  qubitArgs: number[];
}

export interface MeasureOp {
  kind: "measure";
  qubit: number;
  classicalBit: number;
}

export interface ConditionalOp {
  kind: "conditional";
  classicalBit: number;
  equals: 0 | 1;
  body: Operation[];
}

export type Operation =
  | GateOp
  | LoopOp
  | CallOp
  | MeasureOp
  | ConditionalOp;

export interface Subroutine {
  name: string;
  /** Formal qubit parameter names, referenced positionally by CallOp.qubitArgs. */
  qubitParams: string[];
  body: Operation[];
}

export interface ProgramParameter {
  name: string;
  defaultValue: number;
}

export interface QuantumProgram {
  qubitCount: number;
  classicalBitCount: number;
  parameters: ProgramParameter[];
  subroutines: Subroutine[];
  body: Operation[];
}

/** Number of qubit operands each gate expects, for validation. */
export const GATE_ARITY: Record<GateName, number> = {
  H: 1,
  X: 1,
  Y: 1,
  Z: 1,
  S: 1,
  T: 1,
  RX: 1,
  RY: 1,
  RZ: 1,
  CNOT: 2,
  CZ: 2,
  SWAP: 2,
  CCX: 3,
};

/** Gates that take a single angle parameter (radians). */
export const PARAMETERIZED_GATES: ReadonlySet<GateName> = new Set([
  "RX",
  "RY",
  "RZ",
]);
