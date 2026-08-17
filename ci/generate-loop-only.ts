/**
 * Emits the OpenQASM 3 source and simulator statevector for a loop-only
 * preset: a fixed qubit (not indexed by the loop variable — see the note
 * in cross_validate.py on why) has RX(pi/3) applied inside a
 * `range: [0, 3)` loop, i.e. exactly 3 times.
 *
 * This exists specifically to execution-validate the end-exclusive ->
 * OpenQASM-inclusive range translation ([start, end) -> [start:end-1])
 * against a real toolchain: RX(pi/3) applied exactly 3 times drives
 * P(measure 1) to exactly 1.0 (n*theta/2 = pi/2), while 2 or 4
 * applications (the off-by-one failure modes) both land at 0.75 instead —
 * so this is a real discriminating test, not just "does it run".
 *
 * Run via `npx tsx ci/generate-loop-only.ts`.
 */
import type { QuantumProgram } from "@qublocks/ast-schema";
import { compileToOpenQasm3 } from "@qublocks/compiler-openqasm";
import { run } from "@qublocks/simulator";

const program: QuantumProgram = {
  qubitCount: 1,
  classicalBitCount: 0,
  parameters: [],
  subroutines: [],
  body: [
    {
      kind: "loop",
      range: [0, 3],
      loopVar: "i",
      body: [{ kind: "gate", gate: "RX", qubits: [0], params: [Math.PI / 3] }],
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
