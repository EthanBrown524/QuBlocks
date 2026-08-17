import type { QuantumProgram } from "@qublocks/ast-schema";
import { describe, expect, it } from "vitest";
import { compileToQiskit } from "./index.js";

describe("compileToQiskit — golden tests against the preset programs", () => {
  it("compiles the Bell state program", () => {
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

    expect(compileToQiskit(program)).toBe(
      `from qiskit import QuantumCircuit

qc = QuantumCircuit(2)

qc.h(0)
qc.cx(0, 1)
`
    );
  });

  it("compiles the GHZ state program", () => {
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

    expect(compileToQiskit(program)).toBe(
      `from qiskit import QuantumCircuit

qc = QuantumCircuit(3)

qc.h(0)
qc.cx(0, 1)
qc.cx(1, 2)
`
    );
  });

  it("compiles a quantum teleportation program", () => {
    const program: QuantumProgram = {
      qubitCount: 3,
      classicalBitCount: 2,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "gate", gate: "H", qubits: [1] },
        { kind: "gate", gate: "CNOT", qubits: [1, 2] },
        { kind: "gate", gate: "CNOT", qubits: [0, 1] },
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "measure", qubit: 0, classicalBit: 0 },
        { kind: "measure", qubit: 1, classicalBit: 1 },
        {
          kind: "conditional",
          classicalBit: 1,
          equals: 1,
          body: [{ kind: "gate", gate: "X", qubits: [2] }],
        },
        {
          kind: "conditional",
          classicalBit: 0,
          equals: 1,
          body: [{ kind: "gate", gate: "Z", qubits: [2] }],
        },
      ],
    };

    expect(compileToQiskit(program)).toBe(
      `from qiskit import QuantumCircuit

qc = QuantumCircuit(3, 2)

qc.h(0)
qc.h(1)
qc.cx(1, 2)
qc.cx(0, 1)
qc.h(0)
qc.measure(0, 0)
qc.measure(1, 1)
with qc.if_test((qc.clbits[1], 1)):
    qc.x(2)
with qc.if_test((qc.clbits[0], 1)):
    qc.z(2)
`
    );
  });

  it("compiles a Deutsch-Jozsa program (balanced oracle f(x) = x)", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 1,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "X", qubits: [1] },
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "gate", gate: "H", qubits: [1] },
        { kind: "gate", gate: "CNOT", qubits: [0, 1] },
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "measure", qubit: 0, classicalBit: 0 },
      ],
    };

    expect(compileToQiskit(program)).toBe(
      `from qiskit import QuantumCircuit

qc = QuantumCircuit(2, 1)

qc.x(1)
qc.h(0)
qc.h(1)
qc.cx(0, 1)
qc.h(0)
qc.measure(0, 0)
`
    );
  });

  it("compiles the loop + subroutine Bell-pair-factory program", () => {
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

    expect(compileToQiskit(program)).toBe(
      `from qiskit import QuantumCircuit

def bellPair(qc, a, b):
    qc.h(a)
    qc.cx(a, b)

qc = QuantumCircuit(6)

for i in range(0, 3):
    bellPair(qc, 2*i, 2*i + 1)
`
    );
  });
});

describe("compileToQiskit — gate set and edge cases", () => {
  it("emits every MVP gate with the correct QuantumCircuit method, angle-first for rotation gates", () => {
    const program: QuantumProgram = {
      qubitCount: 3,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "gate", gate: "X", qubits: [0] },
        { kind: "gate", gate: "Y", qubits: [0] },
        { kind: "gate", gate: "Z", qubits: [0] },
        { kind: "gate", gate: "S", qubits: [0] },
        { kind: "gate", gate: "T", qubits: [0] },
        { kind: "gate", gate: "RX", qubits: [0], params: [1.5] },
        { kind: "gate", gate: "RY", qubits: [0], params: [1.5] },
        { kind: "gate", gate: "RZ", qubits: [0], params: [1.5] },
        { kind: "gate", gate: "CNOT", qubits: [0, 1] },
        { kind: "gate", gate: "CZ", qubits: [0, 1] },
        { kind: "gate", gate: "SWAP", qubits: [0, 1] },
        { kind: "gate", gate: "CCX", qubits: [0, 1, 2] },
      ],
    };

    const out = compileToQiskit(program);
    expect(out).toContain("qc.h(0)");
    expect(out).toContain("qc.x(0)");
    expect(out).toContain("qc.y(0)");
    expect(out).toContain("qc.z(0)");
    expect(out).toContain("qc.s(0)");
    expect(out).toContain("qc.t(0)");
    expect(out).toContain("qc.rx(1.5, 0)");
    expect(out).toContain("qc.ry(1.5, 0)");
    expect(out).toContain("qc.rz(1.5, 0)");
    expect(out).toContain("qc.cx(0, 1)");
    expect(out).toContain("qc.cz(0, 1)");
    expect(out).toContain("qc.swap(0, 1)");
    expect(out).toContain("qc.ccx(0, 1, 2)");
  });

  it("uses the single-argument QuantumCircuit(n) constructor when classicalBitCount is 0", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "H", qubits: [0] }],
    };
    expect(compileToQiskit(program)).toContain("QuantumCircuit(1)\n");
  });

  it("inserts `pass` for a loop body that would otherwise be empty", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "loop", range: [0, 3], loopVar: "i", body: [] }],
    };
    expect(compileToQiskit(program)).toContain("for i in range(0, 3):\n    pass\n");
  });

  it("range: [2, 2] compiles to Python's naturally-empty range(2, 2) with no special-casing", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "loop", range: [2, 2], loopVar: "i", body: [{ kind: "gate", gate: "X", qubits: [0] }] },
      ],
    };
    expect(compileToQiskit(program)).toContain("for i in range(2, 2):\n    qc.x(0)\n");
  });

  it("allows a coefficient/offset on a subroutine's qubit parameter, unlike the OpenQASM backend", () => {
    // Subroutine parameters are plain Python integers here (function args),
    // not a qubit-typed language construct, so arithmetic on them is fine.
    const program: QuantumProgram = {
      qubitCount: 4,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "shifted",
          qubitParams: ["a"],
          body: [{ kind: "gate", gate: "X", qubits: [{ var: "a", offset: 1 }] }],
        },
      ],
      body: [{ kind: "call", subroutine: "shifted", qubitArgs: [0] }],
    };
    expect(compileToQiskit(program)).toContain("qc.x(a + 1)");
  });

  it("rejects a degenerate CNOT (control === target) before emitting any code", () => {
    // Unvalidated, this would compile to qc.cx(0, 0), which Qiskit itself
    // hard-errors on at circuit-construction time if actually executed.
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "CNOT", qubits: [0, 0] }],
    };
    expect(() => compileToQiskit(program)).toThrow(/same qubit.*more than once/);
  });
});
