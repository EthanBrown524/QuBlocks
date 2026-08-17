import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { adjoint2, singleQubitMatrix } from "./gates.js";
import {
  applyControlledUnitary,
  applyGate,
  applySingleQubit,
  createZeroState,
  probabilities,
  type StateVector,
} from "./stateVector.js";
import type { GateName } from "@qublocks/ast-schema";

const SINGLE_QUBIT_GATES: GateName[] = ["H", "X", "Y", "Z", "S", "T", "RX", "RY", "RZ"];
const TWO_QUBIT_GATES: GateName[] = ["CNOT", "CZ", "SWAP"];

function sumProbabilities(amps: StateVector): number {
  return probabilities(amps).reduce((a, b) => a + b, 0);
}

const randomGateOp = fc
  .record({
    gate: fc.constantFrom(...SINGLE_QUBIT_GATES, ...TWO_QUBIT_GATES),
    qubits: fc.tuple(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 })),
    theta: fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true }),
  })
  .filter((op) => op.qubits[0] !== op.qubits[1] || SINGLE_QUBIT_GATES.includes(op.gate));

describe("simulator properties", () => {
  it("probabilities always sum to 1, for any sequence of gates on a 3-qubit register", () => {
    fc.assert(
      fc.property(fc.array(randomGateOp, { minLength: 0, maxLength: 30 }), (ops) => {
        const amps = createZeroState(3);
        for (const op of ops) {
          const isTwoQubit = TWO_QUBIT_GATES.includes(op.gate);
          const qubits = isTwoQubit ? [op.qubits[0], op.qubits[1]] : [op.qubits[0]];
          applyGate(amps, op.gate, qubits, [op.theta]);
        }
        expect(sumProbabilities(amps)).toBeCloseTo(1, 6);
      })
    );
  });

  it("applying a single-qubit gate then its adjoint returns the original state", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SINGLE_QUBIT_GATES),
        fc.integer({ min: 0, max: 2 }),
        fc.double({ min: -Math.PI * 2, max: Math.PI * 2, noNaN: true }),
        (gate, target, theta) => {
          const amps = createZeroState(3);
          // start from a non-trivial state so the test isn't vacuous
          applySingleQubit(amps, 0, singleQubitMatrix("H"));
          applySingleQubit(amps, 1, singleQubitMatrix("H"));
          const before = amps.map((c) => ({ ...c }));

          const m = singleQubitMatrix(gate, [theta]);
          applySingleQubit(amps, target, m);
          applySingleQubit(amps, target, adjoint2(m));

          for (let i = 0; i < amps.length; i++) {
            expect(amps[i].re).toBeCloseTo(before[i].re, 6);
            expect(amps[i].im).toBeCloseTo(before[i].im, 6);
          }
        }
      )
    );
  });

  it("CNOT is its own inverse", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 }), fc.integer({ min: 0, max: 1 }), (c, t) => {
        fc.pre(c !== t);
        const amps = createZeroState(2);
        applySingleQubit(amps, 0, singleQubitMatrix("H"));
        const before = amps.map((x) => ({ ...x }));

        const X = singleQubitMatrix("X");
        applyControlledUnitary(amps, [c], t, X);
        applyControlledUnitary(amps, [c], t, X);

        for (let i = 0; i < amps.length; i++) {
          expect(amps[i].re).toBeCloseTo(before[i].re, 10);
          expect(amps[i].im).toBeCloseTo(before[i].im, 10);
        }
      })
    );
  });

  it("a Bell-state program always yields exactly 50/50 on 00/11", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const amps = createZeroState(2);
        applyGate(amps, "H", [0]);
        applyGate(amps, "CNOT", [0, 1]);
        const probs = probabilities(amps);
        expect(probs[0]).toBeCloseTo(0.5, 10);
        expect(probs[1]).toBeCloseTo(0, 10);
        expect(probs[2]).toBeCloseTo(0, 10);
        expect(probs[3]).toBeCloseTo(0.5, 10);
      })
    );
  });
});
