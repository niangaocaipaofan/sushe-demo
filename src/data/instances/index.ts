import { blackDressWorkflowInstance } from "./blackDress";
import { graySuitWorkflowInstance } from "./graySuit";
import { knitCardiganWorkflowInstance } from "./knitCardigan";
import type { ProductWorkflowInstance } from "../workflow/types";

export const productWorkflowInstances: ProductWorkflowInstance[] = [
  knitCardiganWorkflowInstance,
  blackDressWorkflowInstance,
  graySuitWorkflowInstance,
];
