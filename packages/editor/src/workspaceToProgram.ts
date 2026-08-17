import type { Block, Workspace } from "blockly";
import type { Operation, QuantumProgram } from "@qublocks/ast-schema";
import { blockToOperation } from "./blockToOperation.js";

/**
 * Translates a Blockly workspace's block chain(s) into a QuantumProgram
 * AST. This first pass covers gates and measurement only — no loops or
 * subroutines in the editor yet (see the project README's phased build
 * order) — so every block is a simple statement in a linear chain, and
 * multiple disconnected top-level chains are concatenated in the order
 * Blockly reports them (workspace.getTopBlocks(true), position order).
 */
export function workspaceToProgram(
  workspace: Workspace,
  qubitCount: number,
  classicalBitCount: number
): QuantumProgram {
  const body = workspace
    .getTopBlocks(true)
    .flatMap((topBlock) => {
      const ops: Operation[] = [];
      let block: Block | null = topBlock;
      while (block) {
        ops.push(blockToOperation(block));
        block = block.getNextBlock();
      }
      return ops;
    });

  return {
    qubitCount,
    classicalBitCount,
    parameters: [],
    subroutines: [],
    body,
  };
}
