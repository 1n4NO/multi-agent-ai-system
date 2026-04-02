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

	const runAgents = async () => {
		setLogs([]);

		const res = await fetch("/api/agent", {
			method: "POST",
			body: JSON.stringify({ goal }),
		});

		const reader = res.body?.getReader();
		const decoder = new TextDecoder();

		while (true) {
			const { done, value } = await reader!.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split("\n\n");

			lines.forEach((line) => {
				if (line.startsWith("data: ")) {
					const parsed = JSON.parse(line.replace("data: ", ""));

					setLogs((prev) => [...prev, parsed]);

					const step = parsed.step;

					// 🔥 Node lifecycle updates
if (step === "NODE_PROGRESS") {
								if (parsed.nodeId) {
									dispatch({
										type: "NODE_PROGRESS",
										nodeId: parsed.nodeId,
										progress: parsed.progress ?? 0,
									});
								}
								return;
							}

							if (step?.includes("_start")) {
						const nodeId = step.replace("_start", "");
						dispatch({
							type: "NODE_START",
							nodeId,
							attempt: parsed.attempt,
						});
					}

					if (step?.includes("_done")) {
						const nodeId = step.replace("_done", "");
						dispatch({ type: "NODE_DONE", nodeId });

						// ✅ capture planner output
						if (nodeId === "planner") {
							const parsePlannerOutput = (text: string) => {
								return text
									.split(/\n\d+\.\s/) // split by numbered points
									.map((item) => item.trim())
									.filter(Boolean);
							};

							if (step === "planner_done") {
								const raw = parsed.data;

								const tasks = parsePlannerOutput(raw);

								dispatch({
									type: "PLANNER_DONE",
									data: {
										researchers: tasks.map((task: string) => ({
											topic: task,
										})),
									},
								});
							}
						}
					}

					if (step === "error") {
						dispatch({ type: "NODE_FAIL", nodeId: "unknown" });
					}
				}
			});
		}
	};

	const finalResult = logs.find((log) => log.step === "complete")?.data;

	return (
		<Container maxWidth="md" style={{ marginTop: 40, paddingTop: 40 }}>
			<Typography
				variant="h4"
				style={{ position: "absolute", top: 20, left: 40, zIndex: 1 }}
			>
				Multi-Agent AI System
			</Typography>

			<Paper style={{ padding: 20, marginBottom: 20 }}>
				<TextField
					fullWidth
					label="Enter your goal"
					value={goal}
					onChange={(e) => setGoal(e.target.value)}
				/>

				<Box mt={2}>
					<Button variant="contained" onClick={runAgents}>
						Run Agents
					</Button>
				</Box>
			</Paper>

			{/* 🔥 Graph */}
			<ReactFlowProvider>
				<AgentGraph graphState={state} />
			</ReactFlowProvider>

			{/* Logs Panel */}
			<Paper
				style={{
					padding: 20,
					marginTop: 20,
					maxHeight: 300,
					overflow: "auto",
				}}
			>
				{logs.map((log, i) => (
					<div key={i} style={{ marginBottom: 20 }}>
						{log.data && typeof log.data === "string" ? (
							<MarkdownRenderer content={log.data} />
						) : (
							<pre>{JSON.stringify(log, null, 2)}</pre>
						)}
					</div>
				))}
			</Paper>

			{finalResult && (
				<Stack direction="row" spacing={2} mt={2} justifyContent={"flex-end"}>
					<Button
						variant="outlined"
						onClick={() => copyToClipboard(finalResult.final)}
					>
						Copy
					</Button>

					<Button
						variant="contained"
						onClick={() =>
							exportToPDF("AI Final Output", finalResult.final)
						}
					>
						Export PDF
					</Button>
				</Stack>
			)}
		</Container>
	);
}