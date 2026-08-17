import * as Blockly from "blockly";
import type { Block } from "blockly";
import { beforeAll, describe, expect, it } from "vitest";
import { defineBlocks } from "./blocks.js";
import { workspaceToProgram } from "./workspaceToProgram.js";

beforeAll(() => {
  defineBlocks();
});

/** Builds a headless (no SVG/DOM) workspace — Blockly's core model layer runs fine in Node. */
function newWorkspace(): Blockly.Workspace {
  return new Blockly.Workspace();
}

function connectChain(workspace: Blockly.Workspace, ...blocks: Block[]): void {
  for (let i = 0; i < blocks.length - 1; i++) {
    blocks[i].nextConnection!.connect(blocks[i + 1].previousConnection!);
  }
}

describe("workspaceToProgram", () => {
  it("translates an empty workspace to a program with an empty body", () => {
    const workspace = newWorkspace();
    const program = workspaceToProgram(workspace, 2, 0);
    expect(program).toEqual({
      qubitCount: 2,
      classicalBitCount: 0,
      parameters: [],
      subroutines: [],
      body: [],
    });
  });

  it("translates a single H block", () => {
    const workspace = newWorkspace();
    const h = workspace.newBlock("gate_h");
    h.setFieldValue("1", "QUBIT");
    const program = workspaceToProgram(workspace, 2, 0);
    expect(program.body).toEqual([{ kind: "gate", gate: "H", qubits: [1] }]);
  });

  it("translates a Bell-state chain (H then CNOT) in canvas order", () => {
    const workspace = newWorkspace();
    const h = workspace.newBlock("gate_h");
    h.setFieldValue("0", "QUBIT");
    const cnot = workspace.newBlock("gate_cnot");
    cnot.setFieldValue("0", "CONTROL");
    cnot.setFieldValue("1", "TARGET");
    connectChain(workspace, h, cnot);

    const program = workspaceToProgram(workspace, 2, 0);
    expect(program.body).toEqual([
      { kind: "gate", gate: "H", qubits: [0] },
      { kind: "gate", gate: "CNOT", qubits: [0, 1] },
    ]);
  });

  it("includes the angle parameter for rotation gates", () => {
    const workspace = newWorkspace();
    const rx = workspace.newBlock("gate_rx");
    rx.setFieldValue("2", "QUBIT");
    rx.setFieldValue("1.5707963267948966", "THETA");
    const program = workspaceToProgram(workspace, 3, 0);
    expect(program.body).toEqual([
      { kind: "gate", gate: "RX", qubits: [2], params: [1.5707963267948966] },
    ]);
  });

  it("omits params entirely for non-parameterized gates (not an empty array)", () => {
    const workspace = newWorkspace();
    const x = workspace.newBlock("gate_x");
    x.setFieldValue("0", "QUBIT");
    const program = workspaceToProgram(workspace, 1, 0);
    expect(program.body[0]).not.toHaveProperty("params");
  });

  it("translates every two- and three-qubit gate with the correct qubit order", () => {
    const workspace = newWorkspace();
    const cz = workspace.newBlock("gate_cz");
    cz.setFieldValue("0", "QUBIT0");
    cz.setFieldValue("1", "QUBIT1");
    const swap = workspace.newBlock("gate_swap");
    swap.setFieldValue("2", "QUBIT0");
    swap.setFieldValue("3", "QUBIT1");
    const ccx = workspace.newBlock("gate_ccx");
    ccx.setFieldValue("0", "CONTROL0");
    ccx.setFieldValue("1", "CONTROL1");
    ccx.setFieldValue("2", "TARGET");
    connectChain(workspace, cz, swap, ccx);

    const program = workspaceToProgram(workspace, 4, 0);
    expect(program.body).toEqual([
      { kind: "gate", gate: "CZ", qubits: [0, 1] },
      { kind: "gate", gate: "SWAP", qubits: [2, 3] },
      { kind: "gate", gate: "CCX", qubits: [0, 1, 2] },
    ]);
  });

  it("translates a measure block", () => {
    const workspace = newWorkspace();
    const measure = workspace.newBlock("measure");
    measure.setFieldValue("0", "QUBIT");
    measure.setFieldValue("1", "CBIT");
    const program = workspaceToProgram(workspace, 2, 2);
    expect(program.body).toEqual([{ kind: "measure", qubit: 0, classicalBit: 1 }]);
  });

  it("reproduces the teleportation preset end to end from a block chain", () => {
    const workspace = newWorkspace();
    const blockSpecs: Array<[string, Record<string, string>]> = [
      ["gate_h", { QUBIT: "0" }],
      ["gate_h", { QUBIT: "1" }],
      ["gate_cnot", { CONTROL: "1", TARGET: "2" }],
      ["gate_cnot", { CONTROL: "0", TARGET: "1" }],
      ["gate_h", { QUBIT: "0" }],
      ["measure", { QUBIT: "0", CBIT: "0" }],
      ["measure", { QUBIT: "1", CBIT: "1" }],
    ];
    const blocks = blockSpecs.map(([type, fields]) => {
      const block = workspace.newBlock(type);
      for (const [field, value] of Object.entries(fields)) block.setFieldValue(value, field);
      return block;
    });
    connectChain(workspace, ...blocks);

    const program = workspaceToProgram(workspace, 3, 2);
    expect(program.body).toEqual([
      { kind: "gate", gate: "H", qubits: [0] },
      { kind: "gate", gate: "H", qubits: [1] },
      { kind: "gate", gate: "CNOT", qubits: [1, 2] },
      { kind: "gate", gate: "CNOT", qubits: [0, 1] },
      { kind: "gate", gate: "H", qubits: [0] },
      { kind: "measure", qubit: 0, classicalBit: 0 },
      { kind: "measure", qubit: 1, classicalBit: 1 },
    ]);
  });

  it("concatenates multiple disconnected top-level chains in position order", () => {
    const workspace = newWorkspace();
    const first = workspace.newBlock("gate_x");
    first.setFieldValue("0", "QUBIT");
    const second = workspace.newBlock("gate_y");
    second.setFieldValue("1", "QUBIT");
    // Deliberately not connected — two separate top-level blocks.
    const program = workspaceToProgram(workspace, 2, 0);
    expect(program.body).toEqual([
      { kind: "gate", gate: "X", qubits: [0] },
      { kind: "gate", gate: "Y", qubits: [1] },
    ]);
  });

  it("throws a clear error for an unrecognized block type", () => {
    const workspace = newWorkspace();
    Blockly.common.defineBlocksWithJsonArray([
      { type: "not_a_qublocks_block", message0: "mystery", previousStatement: null, nextStatement: null },
    ]);
    workspace.newBlock("not_a_qublocks_block");
    expect(() => workspaceToProgram(workspace, 1, 0)).toThrow(/unrecognized block type/);
  });
});
