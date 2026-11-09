import type { MicroserviceDiagramInput } from "../types.js";
import { compileArchitecture } from "./architecture.js";

export function compileMicroservice(input: MicroserviceDiagramInput): {
  engine: "d2";
  source: string;
  layout: "tala" | "elk" | "dagre";
} {
  return compileArchitecture(input, "create_microservice_architecture", {
    defaultLegend: [
      { label: "Service", role: "compute" },
      { label: "Gateway", role: "gateway" },
      { label: "Queue / bus", role: "queue" },
      { label: "Database", role: "data" },
      { label: "Sync call", kind: "sync" },
      { label: "Async event", kind: "async" },
    ],
  });
}
