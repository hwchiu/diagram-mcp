/**
 * Tool name → { schema, compile } for every structured diagram kind that goes
 * through our own engine. Used by tests and dev scripts; server.ts registers
 * the same pairs with descriptions.
 */
import { authzSchema, componentSchema, ganttSchema, timelineSchema, dataflowSchema, decisionKindSchema, dependencyGraphSchema, deploymentSchema, erdSchema, flowchartKindSchema, knowledgeGraphSchema, lineageSchema, networkSchema, sequenceSchema, stateMachineSchema, swimlaneSchema, systemContextSchema, workflowSchema } from "../../tools/kindSchemas.js";
import { compileComponent, compileDataflow, compileDeployment, compileNetwork, compileSystemContext } from "./grid-kinds.js";
import { compileSwimlane } from "./swimlane.js";
import type { CompiledArchitecture } from "../architecture.js";
import { compileAuthz, compileGantt, compileSequence, compileTimeline } from "./scene-kinds.js";
import { compileDecisionKind, compileDependencyGraph, compileErd, compileFlowchartKind, compileKnowledgeGraph, compileLineage, compileStateMachine, compileWorkflow } from "./graph-kinds.js";

export interface KindView {
  source: string;
  drawio?: string;
  qa: import("../../types.js").QaIssue[];
  width: number;
  height: number;
  info?: { key: string };
}
export interface KindCompiler {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: { parse: (x: unknown) => any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compile: (x: any) => { views: KindView[] };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arch = (f: (x: any) => any) => (x: any) => {
  const r = f(x);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { views: r.views.map((v: any) => ({ ...v, width: v.arch.width, height: v.arch.height })) };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RAW: Record<string, (x: any) => CompiledArchitecture> = {
  create_system_context: compileSystemContext,
  create_component_diagram: compileComponent,
  create_deployment_topology: compileDeployment,
  create_network_topology: compileNetwork,
  create_dataflow_trust_boundary: compileDataflow,
  create_swimlane: compileSwimlane,
  create_data_lineage: compileLineage,
  create_workflow_dag: compileWorkflow,
  create_dependency_graph: compileDependencyGraph,
  create_knowledge_graph: compileKnowledgeGraph,
  create_flowchart: compileFlowchartKind,
  create_decision_diagram: compileDecisionKind,
  create_state_machine: compileStateMachine,
  create_er_diagram: compileErd,
  create_sequence_diagram: compileSequence,
  create_authorization_matrix: compileAuthz,
  create_gantt: compileGantt,
  create_timeline: compileTimeline,
};
/** Tool name → compiler returning the full CompiledArchitecture (server path). */
export const KIND_RAW = RAW;

export const KIND_COMPILERS: Record<string, KindCompiler> = {
  create_system_context: { schema: systemContextSchema, compile: arch(compileSystemContext) },
  create_component_diagram: { schema: componentSchema, compile: arch(compileComponent) },
  create_deployment_topology: { schema: deploymentSchema, compile: arch(compileDeployment) },
  create_network_topology: { schema: networkSchema, compile: arch(compileNetwork) },
  create_dataflow_trust_boundary: { schema: dataflowSchema, compile: arch(compileDataflow) },
  create_swimlane: { schema: swimlaneSchema, compile: arch(compileSwimlane) },
  create_data_lineage: { schema: lineageSchema, compile: arch(compileLineage) },
  create_workflow_dag: { schema: workflowSchema, compile: arch(compileWorkflow) },
  create_dependency_graph: { schema: dependencyGraphSchema, compile: arch(compileDependencyGraph) },
  create_knowledge_graph: { schema: knowledgeGraphSchema, compile: arch(compileKnowledgeGraph) },
  create_flowchart: { schema: flowchartKindSchema, compile: arch(compileFlowchartKind) },
  create_decision_diagram: { schema: decisionKindSchema, compile: arch(compileDecisionKind) },
  create_state_machine: { schema: stateMachineSchema, compile: arch(compileStateMachine) },
  create_er_diagram: { schema: erdSchema, compile: arch(compileErd) },
  create_sequence_diagram: { schema: sequenceSchema, compile: arch(compileSequence) },
  create_authorization_matrix: { schema: authzSchema, compile: arch(compileAuthz) },
  create_gantt: { schema: ganttSchema, compile: arch(compileGantt) },
  create_timeline: { schema: timelineSchema, compile: arch(compileTimeline) },
};
