import type { Block } from "blockly";
import type { Operation } from "@qublocks/ast-schema";
import { GATE_BLOCK_SPECS, MEASURE_BLOCK_TYPE } from "./blocks.js";

const SPEC_BY_BLOCK_TYPE = new Map(GATE_BLOCK_SPECS.map((spec) => [spec.blockType, spec]));

/**
 * Translates a single Blockly block into its corresponding AST Operation.
 * Pure with respect to the block's current field values — doesn't touch
 * the workspace or connections (that's workspaceToProgram's job).
 */
export function blockToOperation(block: Block): Operation {
  const spec = SPEC_BY_BLOCK_TYPE.get(block.type);
  if (spec) {
    const qubits = spec.qubitFields.map((field) => requireNumberField(block, field));
    const params = spec.paramFields?.map((field) => requireNumberField(block, field));
    return {
      kind: "gate",
      gate: spec.gate,
      qubits,
      ...(params && params.length > 0 ? { params } : {}),
    };
  }

  if (block.type === MEASURE_BLOCK_TYPE) {
    return {
      kind: "measure",
      qubit: requireNumberField(block, "QUBIT"),
      classicalBit: requireNumberField(block, "CBIT"),
    };
  }

  throw new Error(`blockToOperation: unrecognized block type "${block.type}"`);
}

function requireNumberField(block: Block, fieldName: string): number {
  const value = block.getFieldValue(fieldName);
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`block "${block.type}" field "${fieldName}" is not a number: ${String(value)}`);
  }
  return num;
}
