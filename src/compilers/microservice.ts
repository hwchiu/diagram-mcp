import type { MicroserviceDiagramInput } from "../types.js";
import { compileArchitecture, type CompiledArchitecture } from "./architecture.js";

export function compileMicroservice(input: MicroserviceDiagramInput): CompiledArchitecture {
  return compileArchitecture(input, "create_microservice_architecture");
}
