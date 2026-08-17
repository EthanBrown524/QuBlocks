import type { QuantumProgram } from "@qublocks/ast-schema";
import { describe, expect, it } from "vitest";
import { compileToOpenQasm3 } from "./index.js";

describe("compileToOpenQasm3 — golden tests against the preset programs", () => {
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

    expect(compileToOpenQasm3(program)).toBe(
      `OPENQASM 3;
include "stdgates.inc";

qubit[2] q;

h q[0];
cx q[0], q[1];
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

    expect(compileToOpenQasm3(program)).toBe(
      `OPENQASM 3;
include "stdgates.inc";

qubit[3] q;

h q[0];
cx q[0], q[1];
cx q[1], q[2];
`
    );
  });

  it("compiles a quantum teleportation program", () => {
    // q0: state to teleport (arbitrary prep via H for a nontrivial state),
    // q1/q2: shared Bell pair. Classic teleportation protocol.
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

    expect(compileToOpenQasm3(program)).toBe(
      `OPENQASM 3;
include "stdgates.inc";

qubit[3] q;
bit[2] c;

h q[0];
h q[1];
cx q[1], q[2];
cx q[0], q[1];
h q[0];
c[0] = measure q[0];
c[1] = measure q[1];
if (c[1] == 1) {
  x q[2];
}
if (c[0] == 1) {
  z q[2];
}
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

    expect(compileToOpenQasm3(program)).toBe(
      `OPENQASM 3;
include "stdgates.inc";

qubit[2] q;
bit[1] c;

x q[1];
h q[0];
h q[1];
cx q[0], q[1];
h q[0];
c[0] = measure q[0];
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

    expect(compileToOpenQasm3(program)).toBe(
      `OPENQASM 3;
include "stdgates.inc";

qubit[6] q;

def bellPair(qubit a, qubit b) {
  h a;
  cx a, b;
}

for int i in [0:2] {
  bellPair(q[2*i], q[2*i + 1]);
}
`
    );
  });
});

describe("compileToOpenQasm3 — gate set and edge cases", () => {
  it("emits every MVP gate with the correct OpenQASM name", () => {
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

    const out = compileToOpenQasm3(program);
    expect(out).toContain("h q[0];");
    expect(out).toContain("x q[0];");
    expect(out).toContain("y q[0];");
    expect(out).toContain("z q[0];");
    expect(out).toContain("s q[0];");
    expect(out).toContain("t q[0];");
    expect(out).toContain("rx(1.5) q[0];");
    expect(out).toContain("ry(1.5) q[0];");
    expect(out).toContain("rz(1.5) q[0];");
    expect(out).toContain("cx q[0], q[1];");
    expect(out).toContain("cz q[0], q[1];");
    expect(out).toContain("swap q[0], q[1];");
    expect(out).toContain("ccx q[0], q[1], q[2];");
  });

  it("omits the classical bit declaration when classicalBitCount is 0", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "H", qubits: [0] }],
    };
    // "qubit[1]" legitimately contains the substring "bit[", so check for
    // the classical-bit declaration line specifically, not a bare substring.
    expect(compileToOpenQasm3(program)).not.toMatch(/^bit\[/m);
  });

  it("emits nothing for a loop whose end-exclusive range has zero iterations", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "H", qubits: [0] },
        { kind: "loop", range: [2, 2], loopVar: "i", body: [{ kind: "gate", gate: "X", qubits: [0] }] },
      ],
    };
    const out = compileToOpenQasm3(program);
    expect(out).not.toContain("for int");
    expect(out).not.toContain("x q[0];");
  });

  it("throws when a coefficient/offset is applied to a qubit-typed subroutine parameter", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "bad",
          qubitParams: ["a"],
          body: [{ kind: "gate", gate: "X", qubits: [{ var: "a", offset: 1 }] }],
        },
      ],
      body: [],
    };
    expect(() => compileToOpenQasm3(program)).toThrow(/coefficient\/offset/);
  });
});
