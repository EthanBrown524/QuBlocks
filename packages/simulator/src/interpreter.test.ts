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
    // Subroutine body references its qubit params by name ({ var: "a" },
    // { var: "b" }); each call site resolves i (the loop variable) into a
    // fresh, non-overlapping pair of global qubits via coefficient/offset.
    const program: QuantumProgram = {
      qubitCount: 6,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "bellPair",
          qubitParams: ["a", "b"],
          body: [
            { kind: "gate", gate: "H", qubits: [{ var: "a" }] },
            { kind: "gate", gate: "CNOT", qubits: [{ var: "a" }, { var: "b" }] },
          ],
        },
      ],
      body: [
        {
          kind: "loop",
          range: [0, 3],
          loopVar: "i",
          body: [
            {
              kind: "call",
              subroutine: "bellPair",
              qubitArgs: [
                { var: "i", coefficient: 2 },
                { var: "i", coefficient: 2, offset: 1 },
              ],
            },
          ],
        },
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

  it("range: [0, 1] runs the loop body exactly once, end-exclusive", () => {
    // RX(pi/2) distinguishes run counts by more than parity (unlike X,
    // where two applications cancel back to |0>): 0 runs -> P(1)=0,
    // 1 run -> P(1)=0.5, 2 runs -> P(1)=1. So this pins down "exactly
    // once", not just "an odd number of times".
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        {
          kind: "loop",
          range: [0, 1],
          loopVar: "i",
          body: [{ kind: "gate", gate: "RX", qubits: [{ var: "i" }], params: [Math.PI / 2] }],
        },
      ],
    };
    const { amplitudes } = run(program);
    const probs = probabilities(amplitudes);
    expect(probs[1]).toBeCloseTo(0.5, 10);
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

  it("throws a clear error for an unbound loop/subroutine variable", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "X", qubits: [{ var: "notBound" }] }],
    };
    expect(() => run(program)).toThrow(/unbound variable/i);
    expect(() => run(program)).toThrow(/notBound/);
  });

  it("throws a clear error for a qubit index >= qubitCount, instead of corrupting state-vector math", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "X", qubits: [2] }],
    };
    expect(() => run(program)).toThrow(/qubit index 2 is out of range/);
  });

  it("throws a clear error for a negative qubit index", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "X", qubits: [-1] }],
    };
    expect(() => run(program)).toThrow(/qubit index -1 is out of range/);
  });

  it("throws a clear error for a classical bit index >= classicalBitCount", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 1,
      parameters: [],
      subroutines: [],
      body: [{ kind: "measure", qubit: 0, classicalBit: 1 }],
    };
    expect(() => run(program)).toThrow(/classical bit index 1 is out of range/);
  });

  it("throws a clear error for a negative classical bit index from a conditional", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 1,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "conditional", classicalBit: -1, equals: 0, body: [] },
      ],
    };
    expect(() => run(program)).toThrow(/classical bit index -1 is out of range/);
  });

  it("out-of-range index resolved via a loop variable is still caught", () => {
    // range: [0, 3) with coefficient 1 on a 2-qubit register walks off the
    // end on the third iteration (i=2) — must throw, not silently wrap.
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        {
          kind: "loop",
          range: [0, 3],
          loopVar: "i",
          body: [{ kind: "gate", gate: "X", qubits: [{ var: "i" }] }],
        },
      ],
    };
    expect(() => run(program)).toThrow(/qubit index 2 is out of range/);
  });
});
