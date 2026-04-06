import { Graph, GraphState, StepCallback } from "./types";
import { RunSessionControl } from "@/lib/orchestrator/sessionControl";
import { throwIfAborted } from "@/lib/utils/abort";

const DEFAULT_MAX_NODE_EXECUTIONS = 25;
const DEFAULT_MAX_TOTAL_EXECUTIONS = 100;

export async function executeGraph(
  graph: Graph,
  initialState: GraphState,
  onStep?: StepCallback,
  signal?: AbortSignal,
  sessionControl?: RunSessionControl
) {
  const state = initialState;
  const pendingNodes: string[] = ["planner"];
  const executionCounts: Record<string, number> = {};
  let totalExecutions = 0;

  async function runNode(nodeId: string): Promise<string[]> {
    throwIfAborted(signal);
    const node = graph.nodes[nodeId];
    if (!node) {
      throw new Error(`Graph execution failed: missing node "${nodeId}".`);
    }

    totalExecutions += 1;
    if (totalExecutions > DEFAULT_MAX_TOTAL_EXECUTIONS) {
      throw new Error(
        `Graph execution exceeded the total safety limit of ${DEFAULT_MAX_TOTAL_EXECUTIONS} node runs.`
      );
    }

    // track attempts
    executionCounts[nodeId] = (executionCounts[nodeId] || 0) + 1;
    state.meta.attempts[nodeId] = executionCounts[nodeId];

    if (executionCounts[nodeId] > DEFAULT_MAX_NODE_EXECUTIONS) {
      throw new Error(
        `Graph execution exceeded the per-node safety limit for "${nodeId}" (${DEFAULT_MAX_NODE_EXECUTIONS} runs).`
      );
    }

    await sessionControl?.beforeNode(nodeId, onStep, signal);
    throwIfAborted(signal);

    onStep?.({
      step: `${nodeId}_start`,
      attempt: state.meta.attempts[nodeId],
    });

    const output = await node.run(state, onStep, {
      signal,
      beforeNode: sessionControl
        ? (nextNodeId, nextOnStep, nextSignal) =>
            sessionControl.beforeNode(nextNodeId, nextOnStep, nextSignal)
        : undefined,
      sessionControl,
    });
    throwIfAborted(signal);

    state.data[nodeId] = output;

    onStep?.({
      step: `${nodeId}_done`,
      data: output,
    });

    // find next edges with conditions
    const nextEdges = graph.edges.filter(
      (e) =>
        e.from === nodeId &&
        (!e.condition || e.condition(state))
    );

    for (const edge of nextEdges) {
      if (!graph.nodes[edge.to]) {
        throw new Error(
          `Graph execution failed: edge "${edge.from}" -> "${edge.to}" targets a missing node.`
        );
      }
    }

    return nextEdges.map((edge) => edge.to);
  }

  while (pendingNodes.length > 0) {
    throwIfAborted(signal);

    const nodeId = pendingNodes.pop();
    if (!nodeId) {
      continue;
    }

    const nextNodeIds = await runNode(nodeId);

    // Reverse to preserve the previous depth-first edge execution order.
    for (let index = nextNodeIds.length - 1; index >= 0; index -= 1) {
      pendingNodes.push(nextNodeIds[index]);
    }
  }

  throwIfAborted(signal);

  return state.data;
}
