import * as Blockly from "blockly";
import { checkProgramCompatibility, type CompileTarget, type QuantumProgram } from "@qublocks/ast-schema";
import { compileToOpenQasm3 } from "@qublocks/compiler-openqasm";
import { compileToQiskit } from "@qublocks/compiler-qiskit";
import { defineBlocks } from "./blocks.js";
import { TOOLBOX } from "./toolbox.js";
import { workspaceToProgram } from "./workspaceToProgram.js";

defineBlocks();

const workspace = Blockly.inject("blocklyDiv", { toolbox: TOOLBOX });

const qubitCountInput = document.getElementById("qubitCount") as HTMLInputElement;
const classicalBitCountInput = document.getElementById("classicalBitCount") as HTMLInputElement;
const openqasmCode = document.querySelector("#openqasmOutput code") as HTMLElement;
const qiskitCode = document.querySelector("#qiskitOutput code") as HTMLElement;

function renderTarget(
  codeEl: HTMLElement,
  program: QuantumProgram,
  target: CompileTarget,
  compile: (program: QuantumProgram) => string
): void {
  const issues = checkProgramCompatibility(program, target);
  if (issues.length > 0) {
    codeEl.textContent = "Not supported on this target:\n" + issues.map((i) => `- ${i.description}`).join("\n");
    codeEl.classList.add("error");
    return;
  }
  try {
    codeEl.textContent = compile(program);
    codeEl.classList.remove("error");
  } catch (err) {
    codeEl.textContent = `Compile error: ${(err as Error).message}`;
    codeEl.classList.add("error");
  }
}

function render(): void {
  const qubitCount = Number(qubitCountInput.value);
  const classicalBitCount = Number(classicalBitCountInput.value);

  let program: QuantumProgram;
  try {
    program = workspaceToProgram(workspace, qubitCount, classicalBitCount);
  } catch (err) {
    const message = `Error: ${(err as Error).message}`;
    openqasmCode.textContent = message;
    qiskitCode.textContent = message;
    return;
  }

  renderTarget(openqasmCode, program, "openqasm3", compileToOpenQasm3);
  renderTarget(qiskitCode, program, "qiskit", compileToQiskit);
}

workspace.addChangeListener(() => render());
qubitCountInput.addEventListener("input", render);
classicalBitCountInput.addEventListener("input", render);

render();

if (import.meta.env.DEV) {
  // Dev-only convenience for manual testing in the browser console;
  // tree-shaken out of production builds.
  (window as unknown as { qublocks: unknown }).qublocks = { Blockly, workspace, render };
}
