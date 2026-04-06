import { plannerAgent } from "@/lib/agents/planner";
import { routeResearchTask } from "@/lib/agents/researchRouter";
import { researcherAgent } from "@/lib/agents/researcher";
import { synthesizerAgent } from "@/lib/agents/synthesizer";
import { writerAgent } from "@/lib/agents/writer";
import { criticAgent } from "@/lib/agents/critic";
import { ExecutionContext, Graph, GraphState, StepCallback } from "@/lib/graph/types";
import { parsePlanToTasks } from "@/lib/utils/parsePlan";
import {
	createResearchPlanPayload,
	getResearchNodeId,
	type ResearchPlanItem,
} from "@/lib/researchPlan";
import {
	buildCitationCatalog,
	formatCitationCatalogForAgent,
	formatCitationBlock,
	formatWebResearchForAgent,
	realWebSearch,
	type CitationEntry,
	type ResearchSourceGroup,
} from "@/lib/tools/realWebSearch";
import { abortableDelay, isAbortError, throwIfAborted } from "@/lib/utils/abort";

type ResearchExecutionResult = {
	researchId: string;
	nodeId: string;
	task: string;
	output: string;
	sources: ResearchSourceGroup["sources"];
};

function readResearchPlanFromState(state: GraphState) {
	if (
		state.data.researchPlan &&
		typeof state.data.researchPlan === "object" &&
		Array.isArray((state.data.researchPlan as { researchers?: unknown }).researchers)
	) {
		return (state.data.researchPlan as { researchers: ResearchPlanItem[] }).researchers ?? [];
	}

	return [];
}

function readResearchResultMap(state: GraphState) {
	if (
		state.data.researchResultMap &&
		typeof state.data.researchResultMap === "object" &&
		!Array.isArray(state.data.researchResultMap)
	) {
		return {
			...(state.data.researchResultMap as Record<string, ResearchExecutionResult>),
		};
	}

	return {} as Record<string, ResearchExecutionResult>;
}

function syncResearchStateFromResults(
	state: GraphState,
	researchPlan: ResearchPlanItem[],
	resultMap: Record<string, ResearchExecutionResult>
) {
	const activeResearchIds = new Set(researchPlan.map((item) => item.id));
	const nextResultMap = Object.fromEntries(
		Object.entries(resultMap).filter(([researchId]) => activeResearchIds.has(researchId))
	);
	const orderedResults = researchPlan
		.map((item) => nextResultMap[item.id])
		.filter((result): result is ResearchExecutionResult => Boolean(result));
	const researchSources: ResearchSourceGroup[] = orderedResults.map((result) => ({
		nodeId: result.nodeId,
		task: result.task,
		sources: result.sources,
	}));
	const citationCatalog = buildCitationCatalog(researchSources);

	state.data.researchPlan = { researchers: researchPlan };
	state.data.researchResultMap = nextResultMap;
	state.data.researchers = orderedResults.map((result) => result.output);
	state.data.researchSources = researchSources;
	state.data.citationCatalog = citationCatalog;
}

async function runResearchPlanItems(
	researchPlan: ResearchPlanItem[],
	state: GraphState,
	onStep?: StepCallback,
	context?: ExecutionContext,
	targetResearchIds?: string[]
) {
	const existingResultMap = readResearchResultMap(state);
	const targetIds = targetResearchIds ? new Set(targetResearchIds) : null;
	const itemsToRun = targetIds
		? researchPlan.filter((item) => targetIds.has(item.id))
		: researchPlan;
	const researchPromises = itemsToRun.map(async (planItem) => {
		const nodeId = getResearchNodeId(planItem.id);
		throwIfAborted(context?.signal);
		onStep?.({ step: `${nodeId}_start`, attempt: 1 });
		let groundedResearch = "No web findings were available.";
		let consultedSources: ResearchSourceGroup["sources"] = [];
		let searchErrorMessage: string | undefined;

		onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 10 });

		if (planItem.mode === "web") {
			try {
				const webResearch = await realWebSearch(planItem.prompt, context?.signal);
				consultedSources = webResearch.results;
				groundedResearch = formatWebResearchForAgent(webResearch);
			} catch (error) {
				if (isAbortError(error)) {
					throw error;
				}
				const message = error instanceof Error ? error.message : "Unknown search error";
				searchErrorMessage = message;
				groundedResearch = `Web search failed for this task: ${message}`;
			}
		} else {
			groundedResearch =
				"This task was routed to LLM-only research. Use internal reasoning and do not assume external facts beyond general knowledge.";
		}
		onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 55 });

		const result = await researcherAgent(
			planItem.prompt,
			groundedResearch,
			context?.signal
		);
		const citationBlock = formatCitationBlock(
			planItem.prompt,
			consultedSources,
			searchErrorMessage
		);
		const finalResearchOutput = `Mode: ${planItem.mode.toUpperCase()}\n\n${citationBlock}\n\n${result}`;

		await streamText(finalResearchOutput, nodeId, onStep, context?.signal);
		onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 80 });
		onStep?.({ step: `${nodeId}_done`, data: finalResearchOutput });
		onStep?.({ step: "NODE_PROGRESS", nodeId, progress: 100 });

		return {
			researchId: planItem.id,
			nodeId,
			task: planItem.prompt,
			output: finalResearchOutput,
			sources: consultedSources,
		} satisfies ResearchExecutionResult;
	});

	const results = await Promise.all(researchPromises);
	const nextResultMap = { ...existingResultMap };
	results.forEach((result) => {
		nextResultMap[result.researchId] = result;
	});
	syncResearchStateFromResults(state, researchPlan, nextResultMap);

	return results;
}

async function streamText(
	text: string,
	nodeId: string,
	onStep?: StepCallback,
	signal?: AbortSignal
) {
	for (let i = 0; i < text.length; i += 5) {
		throwIfAborted(signal);
		const chunk = text.slice(i, i + 5);

		onStep?.({
			step: "stream",
			nodeId,
			content: chunk,
		});

		await abortableDelay(10, signal);
	}
}

export function createGraph(goal: string): Graph {
	return {
		nodes: {
			planner: {
				id: "planner",
				run: async (_state: GraphState, onStep?: StepCallback, context?: ExecutionContext) => {
					const plan = await plannerAgent(goal, context?.signal);

					// 🔥 STREAM OUTPUT
					await streamText(plan, "planner", onStep, context?.signal);

					return plan;
				},
			},

			research_router: {
				id: "research_router",
				run: async (state: GraphState, onStep?: StepCallback, context?: ExecutionContext) => {
					const plannerOutput =
						typeof state.data.planner === "string" ? state.data.planner : "";
					const tasks = parsePlanToTasks(plannerOutput);
					const routedPlanItems: ResearchPlanItem[] = await Promise.all(
						tasks.map(async (task) => ({
							...createResearchPlanPayload([task]).researchers[0],
							mode: await routeResearchTask(task, context?.signal),
						}))
					);
					const researchPlan = { researchers: routedPlanItems };

					state.data.researchPlan = researchPlan;
					context?.sessionControl?.setResearchPlan(routedPlanItems);
					onStep?.({
						step: "research_plan",
						data: researchPlan,
					});

					return researchPlan;
				},
			},

			researchers: {
				id: "researchers",
				run: async (state: GraphState, onStep?: StepCallback, context?: ExecutionContext) => {
					const planFromSession = context?.sessionControl?.getResearchPlan() ?? [];
					const planFromState = readResearchPlanFromState(state);
					const researchPlan = planFromSession.length > 0 ? planFromSession : planFromState;
					context?.sessionControl?.registerResearchHandlers(
						(nextResearchPlan, dirtyResearchIds) => {
							syncResearchStateFromResults(
								state,
								nextResearchPlan,
								readResearchResultMap(state)
							);
							onStep?.({
								step: "research_plan",
								data: { researchers: nextResearchPlan },
							});
							onStep?.({
								step: "research_dirty_state",
								data: { dirtyResearchIds },
							});
						},
						async (dirtyResearchIds) => {
							await runResearchPlanItems(
								context?.sessionControl?.getResearchPlan() ?? readResearchPlanFromState(state),
								state,
								onStep,
								context,
								dirtyResearchIds
							);
							onStep?.({
								step: "research_dirty_state",
								data: { dirtyResearchIds: [] },
							});
						}
					);
					await runResearchPlanItems(researchPlan, state, onStep, context);
					context?.sessionControl?.markResearchClean(researchPlan.map((item) => item.id));

					return Array.isArray(state.data.researchers)
						? (state.data.researchers as string[])
						: [];
				},
			},

			synthesizer: {
				id: "synthesizer",
				run: async (state: GraphState, onStep?: StepCallback, context?: ExecutionContext) => {
					const researchOutputs = Array.isArray(state.data.researchers)
						? (state.data.researchers as string[])
						: [];
					const citationCatalog = Array.isArray(state.data.citationCatalog)
						? (state.data.citationCatalog as CitationEntry[])
						: [];
					const output = await synthesizerAgent(
						researchOutputs,
						formatCitationCatalogForAgent(citationCatalog),
						context?.signal
					);

					await streamText(output, "synthesizer", onStep, context?.signal);

					return output;
				},
			},

			writer: {
				id: "writer",
				run: async (state: GraphState, onStep?: StepCallback, context?: ExecutionContext) => {
					const citationCatalog = Array.isArray(state.data.citationCatalog)
						? (state.data.citationCatalog as CitationEntry[])
						: [];
					const previousDraft =
						typeof state.data.writer === "string" ? state.data.writer : "";
					const criticFeedback =
						typeof state.data.critic === "string" ? state.data.critic : "";
					const output = await writerAgent(
						goal,
						typeof state.data.planner === "string" ? state.data.planner : "",
						typeof state.data.synthesizer === "string" ? state.data.synthesizer : "",
						formatCitationCatalogForAgent(citationCatalog),
						previousDraft,
						criticFeedback,
						context?.signal
					);

					await streamText(output, "writer", onStep, context?.signal);

					return output;
				},
			},

			critic: {
				id: "critic",
				run: async (state: GraphState, onStep?: StepCallback, context?: ExecutionContext) => {
					const citationCatalog = Array.isArray(state.data.citationCatalog)
						? (state.data.citationCatalog as CitationEntry[])
						: [];
					const output = await criticAgent(
						goal,
						typeof state.data.planner === "string" ? state.data.planner : "",
						typeof state.data.writer === "string" ? state.data.writer : "",
						formatCitationCatalogForAgent(citationCatalog),
						context?.signal
					);

					await streamText(output, "critic", onStep, context?.signal);

					return output;
				},
			},
		},

		edges: [
			{ from: "planner", to: "research_router" },
			{ from: "research_router", to: "researchers" },
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
