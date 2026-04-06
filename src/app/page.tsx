"use client";

import { useState } from "react";
import {
	Container,
	TextField,
	Button,
	Typography,
	Paper,
	Box,
	Stack,
} from "@mui/material";
import { copyToClipboard, exportToPDF } from "@/lib/utils/export";
import AgentGraph from "@/components/AgentGraph";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useGraphState } from "@/hooks/useGraphState";
import { ReactFlowProvider } from "reactflow";
import type { SessionClientState } from "@/lib/orchestrator/sessionControl";
import type { CitationEntry, ResearchSourceGroup, SearchHit } from "@/lib/tools/realWebSearch";
import {
	isResearchPlanPayload,
	type ResearchPlanItem,
} from "@/lib/researchPlan";

type RunResult = {
	critic?: string;
	writer?: string;
	citationCatalog?: CitationEntry[];
	researchSources?: ResearchSourceGroup[];
};

type LogEvent = {
	step?: string;
	data?: RunResult;
	nodeId?: string;
	content?: string;
	progress?: number;
	attempt?: number;
	sessionId?: string;
	autoProceed?: boolean;
	pausedAt?: string | null;
	waiting?: boolean;
	researchPlan?: ResearchPlanItem[];
	dirtyResearchIds?: string[];
	[key: string]: unknown;
};

type ControlResponse = SessionClientState;

function buildAnchorTag(url: string, label: string) {
	return `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>`;
}

function buildFinalCitationsMarkdown(
	researchSources: ResearchSourceGroup[],
	existingCatalog?: CitationEntry[]
) {
	if (existingCatalog && existingCatalog.length > 0) {
		const entries = existingCatalog.map((citation) => {
			const lines = [
				`### [${citation.id}] ${buildAnchorTag(citation.url, citation.title)}`,
				`- URL: ${buildAnchorTag(citation.url, citation.url)}`,
				`- Used in: ${citation.tasks.join("; ")}`,
				"- Propagated to: Synthesizer, Writer, Critic",
			];

			if (citation.snippet) {
				lines.push(`- Search context: ${citation.snippet}`);
			}

			return lines.join("\n");
		});

		return `## Citations\n\n${entries.join("\n\n")}`;
	}

	const sourceUsage = new Map<
		string,
		{
			title: string;
			url: string;
			snippet: string;
			tasks: string[];
		}
	>();

	researchSources
		.slice()
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId))
		.forEach((group) => {
			group.sources.forEach((source: SearchHit) => {
				const existing = sourceUsage.get(source.url);

				if (existing) {
					if (!existing.tasks.includes(group.task)) {
						existing.tasks.push(group.task);
					}
					return;
				}

				sourceUsage.set(source.url, {
					title: source.title,
					url: source.url,
					snippet: source.snippet,
					tasks: [group.task],
				});
			});
		});

	if (sourceUsage.size === 0) {
		return "## Citations\n\nNo external sources were successfully collected for this run.";
	}

	const entries = Array.from(sourceUsage.values()).map((source, index) => {
		const lines = [
			`### [${index + 1}] ${buildAnchorTag(source.url, source.title)}`,
			`- URL: ${buildAnchorTag(source.url, source.url)}`,
			`- Used in: ${source.tasks.join("; ")}`,
			"- Propagated to: Synthesizer, Writer, Critic",
		];

		if (source.snippet) {
			lines.push(`- Search context: ${source.snippet}`);
		}

		return lines.join("\n");
	});

	return `## Citations\n\n${entries.join("\n\n")}`;
}

export default function Home() {
	const [goal, setGoal] = useState("");
	const [logs, setLogs] = useState<LogEvent[]>([]);
	const { state, dispatch } = useGraphState();
	const [isRunning, setIsRunning] = useState(false);
	const [controller, setController] = useState<AbortController | null>(null);
	const [controlState, setControlState] = useState<SessionClientState | null>(null);

	const sendControl = async (
		payload:
			| { action: "continue"; sessionId: string }
			| { action: "rerun_dirty_research"; sessionId: string }
			| { action: "set_auto"; sessionId: string; autoProceed: boolean }
			| {
				action: "set_research_plan";
				sessionId: string;
				researchPlan: ResearchPlanItem[];
			}
	) => {
		const res = await fetch("/api/agent/control", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			throw new Error("Failed to update run control state.");
		}

		const nextState = (await res.json()) as ControlResponse;
		setControlState(nextState);
		if (isResearchPlanPayload({ researchers: nextState.researchPlan })) {
			dispatch({
				type: "PLANNER_DONE",
				data: {
					researchers: nextState.researchPlan,
				},
			});
		}
	};

	const runAgents = async () => {
		// 🔴 If already running → CANCEL
		if (isRunning && controller) {
			controller.abort();

			// reset everything
			setIsRunning(false);
			setLogs([]);
			dispatch({ type: "RESET" });
			setControlState(null);

			return;
		}

		// 🟢 START NEW RUN
		const abortController = new AbortController();
		setController(abortController);
		setIsRunning(true);
		setLogs([]);
		setControlState(null);

		try {
			const res = await fetch("/api/agent", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ goal, autoProceed: false }),
				signal: abortController.signal, // 🔥 important
			});

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			if (!reader) {
				throw new Error("Streaming response body is unavailable.");
			}

			while (true) {
				const { done, value } = await reader.read();
				buffer += decoder.decode(value, { stream: !done });

				const events = buffer.split("\n\n");
				buffer = events.pop() ?? "";

				const newLogs: LogEvent[] = [];
				const actions: Array<Record<string, unknown>> = [];
				let nextControlState: SessionClientState | null = null;

				events.forEach((eventChunk) => {
					const dataLines = eventChunk
						.split("\n")
						.filter((line) => line.startsWith("data: "))
						.map((line) => line.slice(6));

					if (dataLines.length === 0) {
						return;
					}

					const parsed = JSON.parse(dataLines.join("\n")) as LogEvent;

					newLogs.push(parsed);

					const step = parsed.step;

					if (
						(step === "session" || step === "control_state") &&
						typeof parsed.sessionId === "string" &&
						typeof parsed.autoProceed === "boolean" &&
						typeof parsed.waiting === "boolean"
					) {
						nextControlState = {
							sessionId: parsed.sessionId,
							autoProceed: parsed.autoProceed,
							pausedAt:
								typeof parsed.pausedAt === "string" ? parsed.pausedAt : null,
							waiting: parsed.waiting,
							researchPlan:
								Array.isArray(parsed.researchPlan) &&
								isResearchPlanPayload({ researchers: parsed.researchPlan })
									? parsed.researchPlan
									: [],
							dirtyResearchIds:
								Array.isArray(parsed.dirtyResearchIds)
									? parsed.dirtyResearchIds.filter(
										(researchId): researchId is string => typeof researchId === "string"
									)
									: [],
						};
						if (nextControlState.researchPlan.length > 0) {
							actions.push({
								type: "PLANNER_DONE",
								data: {
									researchers: nextControlState.researchPlan,
								},
							});
						}
						return;
					}

					if (step === "research_plan" && isResearchPlanPayload(parsed.data)) {
						actions.push({
							type: "PLANNER_DONE",
							data: parsed.data,
						});
						return;
					}

					// 🔥 STREAM
					if (step === "stream" && parsed.nodeId && typeof parsed.content === "string") {
						actions.push({
							type: "NODE_STREAM",
							nodeId: parsed.nodeId,
							content: parsed.content,
						});
						return;
					}

					// 🔥 PROGRESS
					if (step === "NODE_PROGRESS" && parsed.nodeId) {
						actions.push({
							type: "NODE_PROGRESS",
							nodeId: parsed.nodeId,
							progress: typeof parsed.progress === "number" ? parsed.progress : 0,
						});
						return;
					}

					// 🔥 START
					if (step?.includes("_start")) {
						actions.push({
							type: "NODE_START",
							nodeId: step.replace("_start", ""),
							attempt: typeof parsed.attempt === "number" ? parsed.attempt : undefined,
						});
					}

					// 🔥 DONE
					if (step?.includes("_done")) {
						const nodeId = step.replace("_done", "");

						actions.push({
							type: "NODE_DONE",
							nodeId,
						});

						if (nodeId === "planner") {
							if (isResearchPlanPayload(parsed.data)) {
								actions.push({
									type: "PLANNER_DONE",
									data: parsed.data,
								});
							}
						}
					}

					if (step === "complete") {
						setIsRunning(false);
						setControlState(null);
					}

					if (step === "error") {
						setControlState(null);
					}
				});

				if (done) {
					break;
				}

				// ✅ APPLY ONCE
				if (newLogs.length > 0) {
					setLogs((prev) => [...prev, ...newLogs]);
				}

				if (nextControlState) {
					setControlState(nextControlState);
				}

				// ✅ DISPATCH IN BATCH (important)
				if (actions.length > 0) {
					const seen = new Set();

					for (const action of actions) {
						const key = JSON.stringify(action);

						if (!seen.has(key)) {
							dispatch(action);
							seen.add(key);
						}
					}
				}
			}
		} catch (err: unknown) {
			if (err instanceof Error && err.name === "AbortError") {
				console.log("Run cancelled");
			} else {
				console.error(err);
			}
		} finally {
			setIsRunning(false);
			setController(null);
		}
	};

	const finalLog = logs.find((log) => log.step === "complete");

	const finalContent =
		finalLog?.data?.critic ||
		finalLog?.data?.writer ||
		"";
	const finalCitations = buildFinalCitationsMarkdown(
		finalLog?.data?.researchSources ?? [],
		finalLog?.data?.citationCatalog
	);
	const finalReport = finalContent
		? `${finalContent}\n\n${finalCitations}`
		: "";


	return (
		<Container maxWidth={false} sx={{ mt: 4 }}>
			<Typography variant="h4" sx={{ mb: 2 }}>
				Multi-Agent AI System
			</Typography>

			<Paper sx={{ p: 1, mb: 2 }}>
				<Stack direction="row" spacing={2}>
					<TextField
						fullWidth
						label="Enter your goal"
						value={goal}
						onChange={(e) => setGoal(e.target.value)}
					/>
					<Button
						variant="contained"
						onClick={runAgents}
						sx={{ whiteSpace: "nowrap", px: 3 }}
						color={isRunning ? "error" : "primary"}
					>
						{isRunning ? "Cancel Run" : "Run Agents"}
					</Button>
				</Stack>
			</Paper>

			{/* 🔥 MAIN GRAPH AREA */}
			<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<ReactFlowProvider>
					<AgentGraph
						graphState={state}
						controlState={controlState}
						onContinue={
							controlState?.sessionId
								? async () => {
									await sendControl({
										action: "continue",
										sessionId: controlState.sessionId,
									});
								}
								: undefined
						}
						onRerunResearch={
							controlState?.sessionId
								? async () => {
									await sendControl({
										action: "rerun_dirty_research",
										sessionId: controlState.sessionId,
									});
								}
								: undefined
						}
						onToggleAuto={
							controlState?.sessionId
								? async (autoProceed: boolean) => {
									await sendControl({
										action: "set_auto",
										sessionId: controlState.sessionId,
										autoProceed,
									});
								}
								: undefined
						}
						onResearchPlanChange={
							controlState?.sessionId
								? async (researchPlan: ResearchPlanItem[]) => {
									await sendControl({
										action: "set_research_plan",
										sessionId: controlState.sessionId,
										researchPlan,
									});
								}
								: undefined
						}
					/>
				</ReactFlowProvider>

				{/* Logs */}
				{/* <Paper sx={{ p: 2, maxHeight: 300, overflow: "auto" }}>
					{logs.map((log, i) => (
						<div key={i} style={{ marginBottom: 20 }}>
							{log.data && typeof log.data === "string" ? (
								<MarkdownRenderer content={log.data} />
							) : (
								<pre>{JSON.stringify(log, null, 2)}</pre>
							)}
						</div>
					))}
				</Paper> */}

				{/* Actions */}
				<Stack direction="row" spacing={2} justifyContent="flex-end">
					<Button
						variant="outlined"
						disabled={!finalReport}
						onClick={() => copyToClipboard(finalReport)}
					>
						Copy
					</Button>

					<Button
						variant="contained"
						disabled={!finalLog?.data}
						onClick={async () => {
							await exportToPDF("AI Report", finalLog?.data);
						}}
					>
						Export PDF
					</Button>
				</Stack>

				{finalContent ? (
					<Paper sx={{ p: 3 }}>
						<Stack spacing={3}>
							<Box>
								<Typography variant="h5" sx={{ mb: 2 }}>
									Final Output
								</Typography>
								<MarkdownRenderer content={finalContent} />
							</Box>

							<Box>
								<MarkdownRenderer content={finalCitations} />
							</Box>
						</Stack>
					</Paper>
				) : null}
			</Box>
		</Container>
	);
}
