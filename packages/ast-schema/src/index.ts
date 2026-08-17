/**
 * Canonical, serializable program representation for QuBlocks.
 * The block editor, simulator, and every compiler backend all consume
 * this AST — nothing talks to the editor directly.
 */

/**
 * A reference to a qubit or classical bit index that may depend on the
 * current binding context: either a literal index, or an expression over a
 * bound variable (a loop's `loopVar`, or a subroutine's `qubitParams` name)
 * of the form `variable * coefficient + offset`.
 */
export type QubitRef =
  | number
  | { var: string; coefficient?: number; offset?: number };

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
  qubits: QubitRef[];
  params?: number[];
}

export interface LoopOp {
  kind: "loop";
  /**
   * Iteration range as [start, end), end-exclusive — matching the same
   * convention as Python's `range()` and JS `Array.prototype.slice`. The
   * body runs `end - start` times (0 times if `end <= start`), with
   * `loopVar` bound to `start, start + 1, …, end - 1`. `range: [0, 1]`
   * therefore runs the body exactly once, with `loopVar` bound to `0`.
   *
   * This convention is load-bearing for every compiler backend (OpenQASM,
   * Qiskit, Cirq): each one must reproduce it exactly, whether by emitting
   * a native end-exclusive loop construct or by unrolling `[start, end)`
   * by hand.
   */
  range: [number, number];
  /** Bound to the current iteration index within `body`. */
  loopVar: string;
  body: Operation[];
}

export interface CallOp {
  kind: "call";
  subroutine: string;
  /** Resolved in the caller's binding context, then bound to the callee's qubitParams by position. */
  qubitArgs: QubitRef[];
}

export interface MeasureOp {
  kind: "measure";
  qubit: QubitRef;
  classicalBit: QubitRef;
}

export interface ConditionalOp {
  kind: "conditional";
  classicalBit: QubitRef;
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
  /** Formal qubit parameter names, referenced from `body` as `{ var: name }` and bound positionally from CallOp.qubitArgs. */
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

export { resolveQubitRef } from "./resolveQubitRef.js";
export {
  assertValidProgram,
  validateProgram,
  type ValidationIssue,
} from "./validate.js";
export {
  ALL_COMPILE_TARGETS,
  checkProgramCompatibility,
  describeConstruct,
  supportsConstruct,
  type CompatibilityIssue,
  type CompileTarget,
  type Construct,
} from "./compatibility.js";
