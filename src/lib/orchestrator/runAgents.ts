import { executeGraph } from "@/lib/graph/engine";
import { createGraph } from "@/lib/graph/nodes";
import { RunSessionControl } from "@/lib/orchestrator/sessionControl";
import { saveToMemory } from "@/lib/memory/store";
import { GraphState } from "@/lib/graph/types";
import { throwIfAborted } from "@/lib/utils/abort";

export async function runAgents(
	goal: string,
	onStep?: (event: Record<string, unknown>) => void,
	signal?: AbortSignal,
	sessionControl?: RunSessionControl
) {
	const graph = createGraph(goal);

	// ✅ Properly initialize state
	const initialState: GraphState = {
		goal,
		data: {},
		meta: {
			attempts: {},
		},
	};

	const results = await executeGraph(graph, initialState, (event) => {
		// Pass everything upstream (SSE layer will handle it)
		onStep?.(event);
	}, signal, sessionControl);

	throwIfAborted(signal);
	saveToMemory(goal, results);

	return results;
}
