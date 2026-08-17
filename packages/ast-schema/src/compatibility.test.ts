import { describe, expect, it } from "vitest";
import type { QuantumProgram, QubitRef } from "./index.js";
import { checkProgramCompatibility, supportsConstruct } from "./compatibility.js";

describe("supportsConstruct", () => {
  it("reports subroutine-param-arithmetic as unsupported on openqasm3 and supported on qiskit", () => {
    expect(supportsConstruct("openqasm3", "subroutine-param-arithmetic")).toBe(false);
    expect(supportsConstruct("qiskit", "subroutine-param-arithmetic")).toBe(true);
  });
});

const bellPairFactory = (paramRef: (name: string) => QubitRef): QuantumProgram => ({
  qubitCount: 6,
  classicalBitCount: 0,
  parameters: [],
  subroutines: [
    {
      name: "bellPair",
      qubitParams: ["a", "b"],
      body: [
        { kind: "gate", gate: "H", qubits: [paramRef("a")] },
        { kind: "gate", gate: "CNOT", qubits: [paramRef("a"), { var: "b" }] },
      ],
    },
  ],
  body: [{ kind: "call", subroutine: "bellPair", qubitArgs: [0, 1] }],
});

describe("checkProgramCompatibility", () => {
  it("returns no issues for a program with no subroutine-param arithmetic, on either target", () => {
    const program = bellPairFactory((name) => ({ var: name })); // bare { var: "a" }, no coefficient/offset
    expect(checkProgramCompatibility(program, "openqasm3")).toEqual([]);
    expect(checkProgramCompatibility(program, "qiskit")).toEqual([]);
  });

  it("flags a program using coefficient/offset on a subroutine's own qubit param, only for openqasm3", () => {
    const program = bellPairFactory((name) => ({ var: name, offset: 1 }));

    const openqasmIssues = checkProgramCompatibility(program, "openqasm3");
    expect(openqasmIssues).toHaveLength(1);
    expect(openqasmIssues[0].construct).toBe("subroutine-param-arithmetic");
    expect(openqasmIssues[0].description).toMatch(/subroutine/i);

    expect(checkProgramCompatibility(program, "qiskit")).toEqual([]);
  });

  it("flags coefficient/offset on a param used as a CallOp argument (nested subroutine call), not just gate qubits", () => {
    const program: QuantumProgram = {
      qubitCount: 4,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [
        { name: "inner", qubitParams: ["x"], body: [{ kind: "gate", gate: "H", qubits: [{ var: "x" }] }] },
        {
          name: "outer",
          qubitParams: ["a"],
          body: [{ kind: "call", subroutine: "inner", qubitArgs: [{ var: "a", coefficient: 2 }] }],
        },
      ],
      body: [{ kind: "call", subroutine: "outer", qubitArgs: [0] }],
    };
    expect(checkProgramCompatibility(program, "openqasm3")).toHaveLength(1);
    expect(checkProgramCompatibility(program, "qiskit")).toEqual([]);
  });

  it("does NOT flag coefficient/offset on a loop variable used at the top level (not a subroutine param)", () => {
    // This is the ordinary, always-supported case (e.g. the Bell-pair-factory
    // preset's { var: "i", coefficient: 2 } call-site arguments) — only
    // arithmetic on a subroutine's OWN param, inside its own body, is restricted.
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
    expect(checkProgramCompatibility(program, "openqasm3")).toEqual([]);
    expect(checkProgramCompatibility(program, "qiskit")).toEqual([]);
  });

  it("does not flag a program with no subroutines at all", () => {
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
    expect(checkProgramCompatibility(program, "openqasm3")).toEqual([]);
    expect(checkProgramCompatibility(program, "qiskit")).toEqual([]);
  });
});
