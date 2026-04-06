import { plannerAgent } from "@/lib/agents/planner";
import { researcherAgent } from "@/lib/agents/researcher";
import { synthesizerAgent } from "@/lib/agents/synthesizer";
import { writerAgent } from "@/lib/agents/writer";
import { criticAgent } from "@/lib/agents/critic";
import { Graph, GraphState, StepCallback } from "@/lib/graph/types";
import { parsePlanToTasks } from "@/lib/utils/parsePlan";
import { formatWebResearchForAgent, realWebSearch } from "@/lib/tools/realWebSearch";

async function streamText(
	text: string,
	nodeId: string,
	onStep?: StepCallback
) {
	for (let i = 0; i < text.length; i += 5) {
		const chunk = text.slice(i, i + 5);

		onStep?.({
			step: "stream",
			nodeId,
			content: chunk,
		});

		await new Promise((r) => setTimeout(r, 10)); // speed control
	}
}

export function createGraph(goal: string): Graph {
	let tasks: string[] = [];

	return {
		nodes: {
			planner: {
				id: "planner",
				run: async (_state: GraphState, onStep?: StepCallback) => {
					const plan = await plannerAgent(goal);

					// 🔥 STREAM OUTPUT
					await streamText(plan, "planner", onStep);

					tasks = parsePlanToTasks(plan);

					return plan;
				},
			},

			researchers: {
				id: "researchers",
				run: async (_state: GraphState, onStep?: StepCallback) => {
					const researchPromises = tasks.map(async (task, index) => {
							const nodeId = `research_${index}`;
							onStep?.({ step: `${nodeId}_start`, attempt: 1 });
							let groundedResearch = "No web findings were available.";

							// simulate minor incremental progress for UX (25/60/90) while running
							onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 10 });

							try {
								const webResearch = await realWebSearch(task);
								groundedResearch = formatWebResearchForAgent(webResearch);
							} catch (error) {
								const message =
									error instanceof Error ? error.message : "Unknown search error";
								groundedResearch = `Web search failed for this task: ${message}`;
							}
							onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 55 });

							const result = await researcherAgent(task, groundedResearch);

						// 🔥 STREAM EACH RESEARCHER
						await streamText(result, nodeId, onStep);
						onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 80 });

						// final load for this researcher node
						onStep?.({ step: `${nodeId}_done`, data: result });
						onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 100 });

						return result;
					});

					const results = await Promise.all(researchPromises);
					return results;
				},
			},

			synthesizer: {
				id: "synthesizer",
				run: async (state: GraphState, onStep?: StepCallback) => {
					const researchOutputs = Array.isArray(state.data.researchers)
						? (state.data.researchers as string[])
						: [];
					const output = await synthesizerAgent(researchOutputs);

					await streamText(output, "synthesizer", onStep);

					return output;
				},
			},

			writer: {
				id: "writer",
				run: async (state: GraphState, onStep?: StepCallback) => {
					const output = await writerAgent(
						goal,
						typeof state.data.planner === "string" ? state.data.planner : "",
						typeof state.data.synthesizer === "string" ? state.data.synthesizer : ""
					);

					await streamText(output, "writer", onStep);

					return output;
				},
			},

			critic: {
				id: "critic",
				run: async (state: GraphState, onStep?: StepCallback) => {
					const output = await criticAgent(
						goal,
						typeof state.data.planner === "string" ? state.data.planner : "",
						typeof state.data.writer === "string" ? state.data.writer : ""
					);

					await streamText(output, "critic", onStep);

					return output;
				},
			},
		},

		edges: [
			{ from: "planner", to: "researchers" },
			{ from: "researchers", to: "synthesizer" },
			{ from: "synthesizer", to: "writer" },

			// 🔁 LOOP: writer → critic
			{ from: "writer", to: "critic" },

			// 🔥 CONDITIONAL LOOP BACK
				{
					from: "critic",
					to: "writer",
					condition: (state: GraphState) => {
						const output =
							typeof state.data.critic === "string" ? state.data.critic : "";
						const match = output.match(/(\d+)%/);
						const score = match ? parseInt(match[1]) : 100;

					return score < 80 &&
						(state.meta.attempts["writer"] || 0) < 3;
				},
			},
		],
	};
}
