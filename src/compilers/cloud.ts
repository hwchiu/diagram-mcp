import type { CloudDiagramInput } from "../types.js";
import { compileArchitecture } from "./architecture.js";

export function compileCloud(input: CloudDiagramInput): {
  engine: "d2";
  source: string;
  layout: "tala" | "elk" | "dagre";
} {
  return compileArchitecture(input, "create_cloud_architecture", {
    defaultLegend: [
      { label: "Sync / request", kind: "sync" },
      { label: "Async / event", kind: "async" },
      { label: "Data path", kind: "data" },
    ],
  });
}
