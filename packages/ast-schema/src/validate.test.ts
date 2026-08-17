import { describe, expect, it } from "vitest";
import type { QuantumProgram } from "./index.js";
import { assertValidProgram, validateProgram } from "./validate.js";

describe("validateProgram", () => {
  it("returns no issues for a valid Bell-state program", () => {
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
    expect(validateProgram(program)).toEqual([]);
  });

  it("flags a CNOT whose control and target are the same literal qubit", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "CNOT", qubits: [0, 0] }],
    };
    const issues = validateProgram(program);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/same qubit.*more than once/);
    expect(issues[0].location).toBe("body[0]");
  });

  it("flags a CCX with two operands aliasing the same qubit", () => {
    const program: QuantumProgram = {
      qubitCount: 3,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "CCX", qubits: [0, 1, 1] }],
    };
    const issues = validateProgram(program);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("CCX");
  });

  it("flags all three operands the same as a single duplicate-pair issue set, not a crash", () => {
    const program: QuantumProgram = {
      qubitCount: 3,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "CCX", qubits: [0, 0, 0] }],
    };
    // Every operand after the first repeats an already-seen qubit, so two issues fire.
    expect(validateProgram(program)).toHaveLength(2);
  });

  it("does not flag a SWAP or CNOT with genuinely distinct qubits", () => {
    const program: QuantumProgram = {
      qubitCount: 3,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "CNOT", qubits: [0, 1] },
        { kind: "gate", gate: "SWAP", qubits: [1, 2] },
      ],
    };
    expect(validateProgram(program)).toEqual([]);
  });

  it("flags a qubit index >= qubitCount", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "H", qubits: [2] }],
    };
    const issues = validateProgram(program);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/qubit index 2 is out of range/);
  });

  it("flags a negative qubit index", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "H", qubits: [-1] }],
    };
    expect(validateProgram(program)[0].message).toMatch(/qubit index -1 is out of range/);
  });

  it("flags an out-of-range classical bit on a measure op", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 1,
      parameters: [],
      subroutines: [],
      body: [{ kind: "measure", qubit: 0, classicalBit: 1 }],
    };
    expect(validateProgram(program)[0].message).toMatch(/classical bit index 1 is out of range/);
  });

  it("flags an out-of-range classical bit on a conditional op", () => {
    const program: QuantumProgram = {
      qubitCount: 1,
      classicalBitCount: 1,
      parameters: [],
      subroutines: [],
      body: [{ kind: "conditional", classicalBit: 5, equals: 1, body: [] }],
    };
    expect(validateProgram(program)[0].message).toMatch(/classical bit index 5 is out of range/);
  });

  it("finds issues nested inside a loop body", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        {
          kind: "loop",
          range: [0, 2],
          loopVar: "i",
          body: [{ kind: "gate", gate: "CNOT", qubits: [1, 1] }],
        },
      ],
    };
    const issues = validateProgram(program);
    expect(issues).toHaveLength(1);
    expect(issues[0].location).toBe("body[0].body[0]");
  });

  it("finds issues nested inside a subroutine body", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "broken",
          qubitParams: [],
          body: [{ kind: "gate", gate: "CNOT", qubits: [0, 5] }],
        },
      ],
      body: [],
    };
    const issues = validateProgram(program);
    expect(issues).toHaveLength(1);
    expect(issues[0].location).toBe("subroutine(broken).body[0]");
  });

  it("flags two structurally identical variable refs on the same gate as duplicates", () => {
    // { var: "a" } used twice on the same gate is provably the same
    // index on every call, regardless of what "a" is bound to.
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "bad",
          qubitParams: ["a", "b"],
          body: [{ kind: "gate", gate: "CNOT", qubits: [{ var: "a" }, { var: "a" }] }],
        },
      ],
      body: [],
    };
    const issues = validateProgram(program);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/same qubit/);
  });

  it("does NOT flag two different variable refs on the same gate, even though they could alias at runtime", () => {
    const program: QuantumProgram = {
      qubitCount: 4,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "bellPair",
          qubitParams: ["a", "b"],
          body: [{ kind: "gate", gate: "CNOT", qubits: [{ var: "a" }, { var: "b" }] }],
        },
      ],
      body: [{ kind: "call", subroutine: "bellPair", qubitArgs: [0, 1] }],
    };
    expect(validateProgram(program)).toEqual([]);
  });

  it("does NOT statically bounds-check a variable qubit reference (that's the interpreter's job at runtime)", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        {
          name: "sub",
          qubitParams: ["a"],
          body: [{ kind: "gate", gate: "H", qubits: [{ var: "a", offset: 999 }] }],
        },
      ],
      body: [{ kind: "call", subroutine: "sub", qubitArgs: [0] }],
    };
    expect(validateProgram(program)).toEqual([]);
  });
});

describe("assertValidProgram", () => {
  it("does not throw for a valid program", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [{ kind: "gate", gate: "CNOT", qubits: [0, 1] }],
    };
    expect(() => assertValidProgram(program)).not.toThrow();
  });

  it("throws, listing every issue, for an invalid program", () => {
    const program: QuantumProgram = {
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [
        { kind: "gate", gate: "CNOT", qubits: [0, 0] },
        { kind: "gate", gate: "H", qubits: [5] },
      ],
    };
    expect(() => assertValidProgram(program)).toThrow(/same qubit/);
    expect(() => assertValidProgram(program)).toThrow(/qubit index 5 is out of range/);
  });
});
