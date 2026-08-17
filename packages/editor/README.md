# @qublocks/editor

Blockly-based drag-and-drop block editor UI. Produces a `QuantumProgram`
AST (`@qublocks/ast-schema`) from the canvas; consumes nothing else —
the live simulator and compiler backends are downstream of the AST, not
wired directly to the editor.

Status: not yet implemented. Per the phased build order, starts with
gates and measurement only; loops and subroutines come later once the
AST-to-target translation decisions for those constructs are settled.
