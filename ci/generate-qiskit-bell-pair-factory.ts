/**
 * Emits, for the loop+subroutine Bell-pair-factory preset program:
 *   - the Qiskit (Python) source produced by @qublocks/compiler-qiskit
 *   - the final statevector produced by @qublocks/simulator
 * as JSON on stdout, so a Python cross-validation script can exec() the
 * generated Qiskit source directly through Aer and diff the result
 * against the TypeScript simulator's output for the same AST.
 *
 * Unlike the OpenQASM path, this exercises the compiler's native loop
 * AND subroutine emission together, in one program — the Qiskit Python
 * API has no equivalent to qiskit_qasm3_import's inability to parse `def`
 * or loop-variable-indexed qubits, since here loops and subroutines are
 * just real Python `for` statements and functions.
 *
 * Run via `npx tsx ci/generate-qiskit-bell-pair-factory.ts`.
 */
import type { QuantumProgram } from "@qublocks/ast-schema";
import { compileToQiskit } from "@qublocks/compiler-qiskit";
import { run } from "@qublocks/simulator";

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

const source = compileToQiskit(program);
const { amplitudes } = run(program);

process.stdout.write(
  JSON.stringify({
    source,
    qubitCount: program.qubitCount,
    amplitudes: amplitudes.map((c) => [c.re, c.im]),
  })
);
