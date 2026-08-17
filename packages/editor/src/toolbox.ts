import { GATE_BLOCK_SPECS, MEASURE_BLOCK_TYPE } from "./blocks.js";

export const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Gates",
      colour: "230",
      contents: GATE_BLOCK_SPECS.map((spec) => ({ kind: "block", type: spec.blockType })),
    },
    {
      kind: "category",
      name: "Measurement",
      colour: "20",
      contents: [{ kind: "block", type: MEASURE_BLOCK_TYPE }],
    },
  ],
};
