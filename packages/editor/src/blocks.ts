import * as Blockly from "blockly";
import type { GateName } from "@qublocks/ast-schema";

/**
 * The semantic mapping from a gate's block type to its AST GateName and
 * field layout — the single source of truth blockToOperation.ts reads
 * from. The visual JSON block definitions below (message text, colour,
 * etc.) are a separate, cosmetic concern.
 */
export interface GateBlockSpec {
  blockType: string;
  gate: GateName;
  /** Names of the block's qubit-index number fields, in AST GateOp.qubits order. */
  qubitFields: string[];
  /** Names of the block's angle-parameter number fields, in AST GateOp.params order. */
  paramFields?: string[];
}

export const GATE_BLOCK_SPECS: readonly GateBlockSpec[] = [
  { blockType: "gate_h", gate: "H", qubitFields: ["QUBIT"] },
  { blockType: "gate_x", gate: "X", qubitFields: ["QUBIT"] },
  { blockType: "gate_y", gate: "Y", qubitFields: ["QUBIT"] },
  { blockType: "gate_z", gate: "Z", qubitFields: ["QUBIT"] },
  { blockType: "gate_s", gate: "S", qubitFields: ["QUBIT"] },
  { blockType: "gate_t", gate: "T", qubitFields: ["QUBIT"] },
  { blockType: "gate_rx", gate: "RX", qubitFields: ["QUBIT"], paramFields: ["THETA"] },
  { blockType: "gate_ry", gate: "RY", qubitFields: ["QUBIT"], paramFields: ["THETA"] },
  { blockType: "gate_rz", gate: "RZ", qubitFields: ["QUBIT"], paramFields: ["THETA"] },
  { blockType: "gate_cnot", gate: "CNOT", qubitFields: ["CONTROL", "TARGET"] },
  { blockType: "gate_cz", gate: "CZ", qubitFields: ["QUBIT0", "QUBIT1"] },
  { blockType: "gate_swap", gate: "SWAP", qubitFields: ["QUBIT0", "QUBIT1"] },
  { blockType: "gate_ccx", gate: "CCX", qubitFields: ["CONTROL0", "CONTROL1", "TARGET"] },
];

export const MEASURE_BLOCK_TYPE = "measure";

const qubitNumberField = (name: string) => ({
  type: "field_number",
  name,
  value: 0,
  min: 0,
  precision: 1,
});

const angleNumberField = (name: string) => ({
  type: "field_number",
  name,
  value: 0,
});

const GATE_COLOUR = 230;
const MEASURE_COLOUR = 20;

const BLOCK_JSON = [
  { type: "gate_h", message0: "H  q %1", args0: [qubitNumberField("QUBIT")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Hadamard gate" },
  { type: "gate_x", message0: "X  q %1", args0: [qubitNumberField("QUBIT")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Pauli-X gate" },
  { type: "gate_y", message0: "Y  q %1", args0: [qubitNumberField("QUBIT")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Pauli-Y gate" },
  { type: "gate_z", message0: "Z  q %1", args0: [qubitNumberField("QUBIT")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Pauli-Z gate" },
  { type: "gate_s", message0: "S  q %1", args0: [qubitNumberField("QUBIT")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "S (phase) gate" },
  { type: "gate_t", message0: "T  q %1", args0: [qubitNumberField("QUBIT")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "T gate" },
  { type: "gate_rx", message0: "RX  q %1  θ %2", args0: [qubitNumberField("QUBIT"), angleNumberField("THETA")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Rotation about X (radians)" },
  { type: "gate_ry", message0: "RY  q %1  θ %2", args0: [qubitNumberField("QUBIT"), angleNumberField("THETA")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Rotation about Y (radians)" },
  { type: "gate_rz", message0: "RZ  q %1  θ %2", args0: [qubitNumberField("QUBIT"), angleNumberField("THETA")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Rotation about Z (radians)" },
  { type: "gate_cnot", message0: "CNOT  ctrl %1  target %2", args0: [qubitNumberField("CONTROL"), qubitNumberField("TARGET")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Controlled-X gate" },
  { type: "gate_cz", message0: "CZ  q %1  q %2", args0: [qubitNumberField("QUBIT0"), qubitNumberField("QUBIT1")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Controlled-Z gate" },
  { type: "gate_swap", message0: "SWAP  q %1  q %2", args0: [qubitNumberField("QUBIT0"), qubitNumberField("QUBIT1")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Swap gate" },
  { type: "gate_ccx", message0: "CCX  ctrl %1  ctrl %2  target %3", args0: [qubitNumberField("CONTROL0"), qubitNumberField("CONTROL1"), qubitNumberField("TARGET")], previousStatement: null, nextStatement: null, colour: GATE_COLOUR, tooltip: "Toffoli (doubly-controlled X) gate" },
  { type: MEASURE_BLOCK_TYPE, message0: "measure  q %1  →  c %2", args0: [qubitNumberField("QUBIT"), qubitNumberField("CBIT")], previousStatement: null, nextStatement: null, colour: MEASURE_COLOUR, tooltip: "Measure a qubit into a classical bit" },
];

let defined = false;

/** Registers every QuBlocks block type with Blockly. Idempotent. */
export function defineBlocks(): void {
  if (defined) return;
  Blockly.common.defineBlocksWithJsonArray(BLOCK_JSON);
  defined = true;
}
