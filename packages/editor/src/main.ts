import * as Blockly from "blockly";
import {
  checkProgramCompatibility,
  validateProgram,
  type CompileTarget,
  type QuantumProgram,
} from "@qublocks/ast-schema";
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
const validationWarningsEl = document.getElementById("validationWarnings") as HTMLElement;

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

function renderValidationWarnings(program: QuantumProgram): boolean {
  const issues = validateProgram(program);
  if (issues.length === 0) {
    validationWarningsEl.hidden = true;
    validationWarningsEl.innerHTML = "";
    return true;
  }
  const items = issues.map((issue) => `<li>[${issue.location}] ${issue.message}</li>`).join("");
  validationWarningsEl.innerHTML = `<strong>This program isn't physically valid — fix before it can run on any target:</strong><ul>${items}</ul>`;
  validationWarningsEl.hidden = false;
  return false;
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

  // Physical validity (e.g. a gate with duplicate qubit operands) is
  // independent of target, so it's surfaced once, up front, at the point
  // of construction — not as a per-target compile error. Both compile
  // functions also call assertValidProgram themselves (defense in depth,
  // since they're reachable from more than just this UI), so this check
  // is a UX improvement, not the only thing standing between an invalid
  // program and a compile error.
  if (!renderValidationWarnings(program)) {
    const message = "Fix the issue(s) above to see generated code.";
    openqasmCode.textContent = message;
    qiskitCode.textContent = message;
    openqasmCode.classList.remove("error");
    qiskitCode.classList.remove("error");
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
