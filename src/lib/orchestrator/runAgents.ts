import { executeGraph } from "@/lib/graph/engine";
import { createGraph } from "@/lib/graph/nodes";
import { saveToMemory } from "@/lib/memory/store";
import { GraphState } from "@/lib/graph/types";

export async function runAgents(goal: string, onStep?: any) {
  const graph = createGraph(goal);

  // ✅ Properly initialize state
  const initialState: GraphState = {
    goal,
    data: {},
    meta: {
      attempts: {},
    },
  };

  const results = await executeGraph(graph, initialState, onStep);

  saveToMemory(goal, results);

  return results;
}