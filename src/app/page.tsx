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

export default function Home() {
	const [goal, setGoal] = useState("");
	const [logs, setLogs] = useState<any[]>([]);
	const { state, dispatch } = useGraphState();
	const [isRunning, setIsRunning] = useState(false);
	const [controller, setController] = useState<AbortController | null>(null);

	const runAgents = async () => {
		// 🔴 If already running → CANCEL
		if (isRunning && controller) {
			controller.abort();

			// reset everything
			setIsRunning(false);
			setLogs([]);
			dispatch({ type: "RESET" });

			return;
		}

		// 🟢 START NEW RUN
		const abortController = new AbortController();
		setController(abortController);
		setIsRunning(true);
		setLogs([]);

		try {
			const res = await fetch("/api/agent", {
				method: "POST",
				body: JSON.stringify({ goal }),
				signal: abortController.signal, // 🔥 important
			});

			const reader = res.body?.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader!.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split("\n\n");

				const newLogs: any[] = [];
				const actions: any[] = [];

				lines.forEach((line) => {
					if (line.startsWith("data: ")) {
						const parsed = JSON.parse(line.replace("data: ", ""));

						newLogs.push(parsed);

						const step = parsed.step;

						// 🔥 STREAM
						if (step === "stream") {
							actions.push({
								type: "NODE_STREAM",
								nodeId: parsed.nodeId,
								content: parsed.content,
							});
							return;
						}

						// 🔥 PROGRESS
						if (step === "NODE_PROGRESS") {
							actions.push({
								type: "NODE_PROGRESS",
								nodeId: parsed.nodeId,
								progress: parsed.progress ?? 0,
							});
							return;
						}

						// 🔥 START
						if (step?.includes("_start")) {
							actions.push({
								type: "NODE_START",
								nodeId: step.replace("_start", ""),
								attempt: parsed.attempt,
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
								const parsePlannerOutput = (text: string) =>
									text
										.split(/\n\d+\.\s/)
										.map((item) => item.trim())
										.filter(Boolean);

								const tasks = parsePlannerOutput(parsed.data);

								actions.push({
									type: "PLANNER_DONE",
									data: {
										researchers: tasks.map((t: string) => ({
											topic: t,
										})),
									},
								});
							}
						}

						if (step === "complete") {
							setIsRunning(false);
						}
					}
				});

				// ✅ APPLY ONCE
				if (newLogs.length > 0) {
					setLogs((prev) => [...prev, ...newLogs]);
				}

				// ✅ DISPATCH IN BATCH (important)
				if (actions.length > 0) {
					setTimeout(() => {
						actions.forEach((action) => dispatch(action));
					}, 0);
				}
			}
		} catch (err: any) {
			if (err.name === "AbortError") {
				console.log("Run cancelled");
			} else {
				console.error(err);
			}
		} finally {
			setIsRunning(false);
			setController(null);
		}
	};

	const finalResult = logs.find((log) => log.step === "complete")?.data;

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
					<AgentGraph graphState={state} />
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
				{finalResult && (
					<Stack direction="row" spacing={2} justifyContent="flex-end">
						<Button
							variant="outlined"
							disabled={!finalResult?.final}
							onClick={() => copyToClipboard(finalResult.final)}
						>
							Copy
						</Button>

						<Button
							variant="contained"
							disabled={!finalResult?.final}
							onClick={() => {
								if (!finalResult?.final) return;
								exportToPDF("AI Final Output", finalResult.final);
							}}
						>
							Export PDF
						</Button>
					</Stack>
				)}
			</Box>
		</Container>
	);
}