/**
 * Emits, for the loop+subroutine Bell-pair-factory preset program:
 *   - the OpenQASM 3 source produced by @qublocks/compiler-openqasm
 *   - the final statevector produced by @qublocks/simulator
 * as JSON on stdout, so a Python cross-validation script can execute the
 * OpenQASM through a real toolchain (qiskit.qasm3 + Aer) and diff the
 * result against the TypeScript simulator's output for the same AST.
 *
 * Run via `npx tsx ci/generate-bell-pair-factory.ts` so workspace package
 * specifiers resolve against source (not requiring a prior `npm run build`).
 */
import type { QuantumProgram } from "@qublocks/ast-schema";
import { compileToOpenQasm3 } from "@qublocks/compiler-openqasm";
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

const qasm = compileToOpenQasm3(program);
const { amplitudes } = run(program);

process.stdout.write(
  JSON.stringify({
    qasm,
    qubitCount: program.qubitCount,
    amplitudes: amplitudes.map((c) => [c.re, c.im]),
  })
);
