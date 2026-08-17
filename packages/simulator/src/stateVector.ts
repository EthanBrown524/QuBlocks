import type { GateName } from "@qublocks/ast-schema";
import { GATE_ARITY } from "@qublocks/ast-schema";
import { cAbs2, cAdd, cMul, complex, type Complex } from "./complex.js";
import { CONTROLLED_GATES, singleQubitMatrix, type Matrix2 } from "./gates.js";

/** Dense state vector, index encodes qubit values with qubit 0 as the LSB. */
export type StateVector = Complex[];

export function createZeroState(qubitCount: number): StateVector {
  const size = 1 << qubitCount;
  const amps = new Array<Complex>(size).fill(complex(0));
  amps[0] = complex(1);
  return amps;
}

export function probabilities(amps: StateVector): number[] {
  return amps.map(cAbs2);
}

/** Applies a 2x2 unitary to `target`, in place. */
export function applySingleQubit(
  amps: StateVector,
  target: number,
  m: Matrix2
): void {
  const mask = 1 << target;
  for (let i = 0; i < amps.length; i++) {
    if ((i & mask) !== 0) continue; // process each (0,1) pair once, at the i-with-bit-0 index
    const j = i | mask;
    const a0 = amps[i];
    const a1 = amps[j];
    amps[i] = cAdd(cMul(m[0], a0), cMul(m[1], a1));
    amps[j] = cAdd(cMul(m[2], a0), cMul(m[3], a1));
  }
}

/** Applies a 2x2 unitary to `target` only for basis states where every control bit is 1. */
export function applyControlledUnitary(
  amps: StateVector,
  controls: number[],
  target: number,
  m: Matrix2
): void {
  const targetMask = 1 << target;
  const controlMask = controls.reduce((acc, c) => acc | (1 << c), 0);
  for (let i = 0; i < amps.length; i++) {
    if ((i & targetMask) !== 0) continue;
    if ((i & controlMask) !== controlMask) continue;
    const j = i | targetMask;
    const a0 = amps[i];
    const a1 = amps[j];
    amps[i] = cAdd(cMul(m[0], a0), cMul(m[1], a1));
    amps[j] = cAdd(cMul(m[2], a0), cMul(m[3], a1));
  }
}

export function applySwap(amps: StateVector, a: number, b: number): void {
  const maskA = 1 << a;
  const maskB = 1 << b;
  for (let i = 0; i < amps.length; i++) {
    const bitA = (i & maskA) !== 0;
    const bitB = (i & maskB) !== 0;
    if (bitA === bitB) continue;
    // bitA=1,bitB=0 defines the canonical pair; skip the mirror to avoid double-swapping
    if (!bitA) continue;
    const j = (i & ~maskA & ~maskB) | maskB;
    const tmp = amps[i];
    amps[i] = amps[j];
    amps[j] = tmp;
  }
}

const IDENTITY: Matrix2 = [complex(1), complex(0), complex(0), complex(1)];

export function applyGate(
  amps: StateVector,
  gate: GateName,
  qubits: number[],
  params?: number[]
): void {
  const arity = GATE_ARITY[gate];
  if (qubits.length !== arity) {
    throw new Error(`${gate} expects ${arity} qubit(s), got ${qubits.length}`);
  }

  if (!CONTROLLED_GATES.has(gate)) {
    applySingleQubit(amps, qubits[0], singleQubitMatrix(gate, params));
    return;
  }

  switch (gate) {
    case "CNOT":
      applyControlledUnitary(amps, [qubits[0]], qubits[1], singleQubitMatrix("X"));
      return;
    case "CZ":
      applyControlledUnitary(amps, [qubits[0]], qubits[1], singleQubitMatrix("Z"));
      return;
    case "SWAP":
      applySwap(amps, qubits[0], qubits[1]);
      return;
    case "CCX":
      applyControlledUnitary(
        amps,
        [qubits[0], qubits[1]],
        qubits[2],
        singleQubitMatrix("X")
      );
      return;
    default:
      // exhaustiveness guard
      applySingleQubit(amps, qubits[0], IDENTITY);
  }
}
