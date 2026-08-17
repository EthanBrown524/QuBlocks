import { describe, expect, it } from "vitest";
import { cAbs2 } from "./complex.js";
import { applyGate, createZeroState, probabilities } from "./stateVector.js";

describe("stateVector", () => {
  it("starts every qubit in |0>", () => {
    const amps = createZeroState(2);
    expect(probabilities(amps)).toEqual([1, 0, 0, 0]);
  });

  it("produces a Bell state from H + CNOT", () => {
    const amps = createZeroState(2);
    applyGate(amps, "H", [0]);
    applyGate(amps, "CNOT", [0, 1]);

    const probs = probabilities(amps);
    expect(probs[0]).toBeCloseTo(0.5, 10); // |00>
    expect(probs[1]).toBeCloseTo(0, 10); // |01>
    expect(probs[2]).toBeCloseTo(0, 10); // |10>
    expect(probs[3]).toBeCloseTo(0.5, 10); // |11>
  });

  it("X flips |0> to |1>", () => {
    const amps = createZeroState(1);
    applyGate(amps, "X", [0]);
    expect(cAbs2(amps[1])).toBeCloseTo(1, 10);
  });

  it("SWAP exchanges qubit states", () => {
    const amps = createZeroState(2);
    applyGate(amps, "X", [0]); // |01> in little-endian index 1
    applyGate(amps, "SWAP", [0, 1]);
    const probs = probabilities(amps);
    expect(probs[2]).toBeCloseTo(1, 10); // qubit 1 now set -> index 2
  });

  it("CCX (Toffoli) flips target only when both controls are 1", () => {
    const amps = createZeroState(3);
    applyGate(amps, "X", [0]);
    applyGate(amps, "X", [1]);
    applyGate(amps, "CCX", [0, 1, 2]);
    const probs = probabilities(amps);
    expect(probs[7]).toBeCloseTo(1, 10); // |111>
  });
});
