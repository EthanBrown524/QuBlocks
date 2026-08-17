import type { QuantumProgram } from "@qublocks/ast-schema";
import { describe, expect, it } from "vitest";
import { probabilities } from "./stateVector.js";
import { run } from "./interpreter.js";

describe("interpreter", () => {
  it("runs a Bell state program", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "gate", gate: "CNOT", qubits: [0, 1] },
      ],
    };
    const { amplitudes } = run(program);
    const probs = probabilities(amplitudes);
    expect(probs[0]).toBeCloseTo(0.5, 10);
    expect(probs[3]).toBeCloseTo(0.5, 10);
  });

  it("runs a GHZ state program", () => {
    const program: QuantumProgram = {
      qubitCount: 3,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "gate", gate: "CNOT", qubits: [0, 1] },
        { kind: "gate", gate: "CNOT", qubits: [1, 2] },
      ],
    };
    const { amplitudes } = run(program);
    const probs = probabilities(amplitudes);
    expect(probs[0]).toBeCloseTo(0.5, 10); // |000>
    expect(probs[7]).toBeCloseTo(0.5, 10); // |111>
  });

  it("prepares several independent Bell pairs via a subroutine called in a loop", () => {
    // Subroutine references its qubit params positionally (0, 1); each call
    // maps those to a fresh pair of global qubits.
    const program: QuantumProgram = {
      qubitCount: 6,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "bellPair",
          qubitParams: ["a", "b"],
          body: [
            { kind: "gate", gate: "H", qubits: [0] },
            { kind: "gate", gate: "CNOT", qubits: [0, 1] },
          ],
        },
      ],
      body: [
        { kind: "call", subroutine: "bellPair", qubitArgs: [0, 1] },
        { kind: "call", subroutine: "bellPair", qubitArgs: [2, 3] },
        { kind: "call", subroutine: "bellPair", qubitArgs: [4, 5] },
      ],
    };
    const { amplitudes } = run(program);
    const probs = probabilities(amplitudes);

    // Every basis state with nonzero probability must have each pair
    // (0,1), (2,3), (4,5) agreeing internally.
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] < 1e-9) continue;
      const bit = (b: number) => (i >> b) & 1;
      expect(bit(0)).toBe(bit(1));
      expect(bit(2)).toBe(bit(3));
      expect(bit(4)).toBe(bit(5));
    }
    const total = probs.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("measurement collapses state and records the classical bit", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 1,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "X", qubits: [0] },
        { kind: "measure", qubit: 0, classicalBit: 0 },
      ],
    };
    const { classicalBits, amplitudes } = run(program, () => 0.5);
    expect(classicalBits[0]).toBe(1);
    expect(probabilities(amplitudes)[1]).toBeCloseTo(1, 10);
  });

  it("conditional only runs its body when the classical bit matches", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 1,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "X", qubits: [0] },
        { kind: "measure", qubit: 0, classicalBit: 0 },
        {
          kind: "conditional",
          classicalBit: 0,
          equals: 1,
          body: [{ kind: "gate", gate: "X", qubits: [1] }],
        },
      ],
    };
    const { amplitudes } = run(program, () => 0.5);
    const probs = probabilities(amplitudes);
    expect(probs[3]).toBeCloseTo(1, 10); // |11>
  });
});
