import { Graph } from "./types";

export async function executeGraph(
  graph: Graph,
  initialInput: any,
  onStep?: (data: any) => void
) {
  const results: Record<string, any> = {};
  const visited = new Set<string>();

  async function runNode(nodeId: string, input: any) {
    if (visited.has(nodeId)) return results[nodeId];

    const node = graph.nodes[nodeId];

    onStep?.({ step: `${nodeId}_start` });

    const output = await node.run(input);

    results[nodeId] = output;
    visited.add(nodeId);

    onStep?.({ step: `${nodeId}_done`, data: output });

    // find next nodes
    const nextEdges = graph.edges.filter((e) => e.from === nodeId);

    await Promise.all(
      nextEdges.map((edge) =>
        runNode(edge.to, {
          ...results,
          previous: output,
        })
      )
    );

    return output;
  }

  // start from root node
  await runNode("planner", initialInput);

  return results;
}