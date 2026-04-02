import { Graph, GraphState } from "./types";

export async function executeGraph(
  graph: Graph,
  initialState: GraphState,
  onStep?: (data: any) => void
) {
  const state = initialState;

  async function runNode(nodeId: string): Promise<void> {
    const node = graph.nodes[nodeId];

    // track attempts
    state.meta.attempts[nodeId] =
      (state.meta.attempts[nodeId] || 0) + 1;

    onStep?.({
      step: `${nodeId}_start`,
      attempt: state.meta.attempts[nodeId],
    });

    const output = await node.run(state, onStep);

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
      await runNode(edge.to);
    }
  }

  await runNode("planner");

  return state.data;
}