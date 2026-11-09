import type { CloudDiagramInput } from "../types.js";
import { compileArchitecture, type CompiledArchitecture } from "./architecture.js";

export function compileCloud(input: CloudDiagramInput): CompiledArchitecture {
  return compileArchitecture(input, "create_cloud_architecture");
}
