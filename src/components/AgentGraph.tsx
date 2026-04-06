"use client";

import ReactFlow, {
	Background,
	Controls,
	type Edge,
	type Node,
	type ReactFlowInstance,
	useNodesState,
	useEdgesState,
} from "reactflow";
import { useEffect, useRef, useState } from "react";
import "reactflow/dist/style.css";
import { useMemo } from "react";
import dagre from "dagre";
import isEqual from "lodash/isEqual";
import {
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Button,
	TextField,
	FormControl,
	InputLabel,
	MenuItem,
	Select,
	type SelectChangeEvent,
} from "@mui/material";
import type { GraphUIState } from "@/hooks/useGraphState";
import type { SessionClientState } from "@/lib/orchestrator/sessionControl";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import {
	createResearchPlanId,
	getResearchNodeId,
	type ResearchMode,
	type ResearchPlanItem,
} from "@/lib/researchPlan";

type Props = {
	graphState: GraphUIState;
	controlState: SessionClientState | null;
	onContinue?: () => Promise<void>;
	onRerunResearch?: () => Promise<void>;
	onToggleAuto?: (autoProceed: boolean) => Promise<void>;
	onResearchPlanChange?: (researchPlan: ResearchPlanItem[]) => Promise<void>;
};

const nodeWidth = 150;
const nodeHeight = 50;
const EMPTY_STREAMING_CONTENT: Record<string, string> = {};
const EMPTY_RESEARCH_ITEMS: ResearchPlanItem[] = [];
const EMPTY_DIRTY_RESEARCH_IDS: string[] = [];
const BASE_NODES: Node[] = [
	{ id: "planner", data: { label: "Planner" }, position: { x: 0, y: 0 } },
	{ id: "research_router", data: { label: "Research Router" }, position: { x: 0, y: 0 } },
	{ id: "researchers", data: { label: "Researchers" }, position: { x: 0, y: 0 } },
	{ id: "synthesizer", data: { label: "Synthesizer" }, position: { x: 0, y: 0 } },
	{ id: "writer", data: { label: "Writer" }, position: { x: 0, y: 0 } },
	{ id: "critic", data: { label: "Critic" }, position: { x: 0, y: 0 } },
];

type ResearchModalState =
	| {
		mode: "closed";
	  }
	| {
		mode: "add";
		item: ResearchPlanItem;
	  }
	| {
		mode: "edit";
		item: ResearchPlanItem;
	  }
	| {
		mode: "remove";
		item: ResearchPlanItem;
	  };

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
	const g = new dagre.graphlib.Graph();
	g.setDefaultEdgeLabel(() => ({}));

	// Top-down layout
	g.setGraph({ rankdir: "TB" });

	nodes.forEach((node) => {
		g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
	});

	edges.forEach((edge) => {
		g.setEdge(edge.source, edge.target);
	});

	dagre.layout(g);

	const layoutedNodes = nodes.map((node) => {
		const nodeWithPosition = g.node(node.id);

		return {
			...node,
			position: {
				x: nodeWithPosition.x - nodeWidth / 2,
				y: nodeWithPosition.y - nodeHeight / 2,
			},
		};
	});

	return { nodes: layoutedNodes, edges };
}

function formatCheckpointLabel(nodeId: string | null) {
	if (!nodeId) {
		return "No pending checkpoint";
	}

	switch (nodeId) {
		case "research_router":
			return "Research Router";
		case "researchers":
			return "Researchers";
		case "synthesizer":
			return "Synthesizer";
		case "writer":
			return "Writer";
		case "critic":
			return "Critic";
		default:
			return formatNodeLabel(nodeId);
	}
}

export default function AgentGraph({
	graphState,
	controlState,
	onContinue,
	onRerunResearch,
	onToggleAuto,
	onResearchPlanChange,
}: Props) {
	const { activeNode, activeNodes, completedNodes, failedNodes, researcherProgress } = graphState;
	const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
	const [rfNodes, setRfNodes] = useNodesState([]);
	const [rfEdges, setRfEdges] = useEdgesState([]);
	const [visibleResearchCount, setVisibleResearchCount] = useState(0);
	const previousResearchIdsRef = useRef<string[]>([]);
	const streamingContent =
		graphState.streamingContent ?? EMPTY_STREAMING_CONTENT;
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [researchModal, setResearchModal] = useState<ResearchModalState>({
		mode: "closed",
	});
	const displayedSelectedNode =
		graphState.lastEvent?.type === "RESET" ? null : selectedNode;


	const isResearchNode = (id: string) => id.startsWith("research_");

	const getNodeStyle = (status: string, progress?: number) => {
		const baseStyle = (() => {
			switch (status) {
				case "active":
					return { background: "#2196f3", color: "white" };
				case "completed":
					return { background: "#4caf50", color: "white" };
				case "failed":
					return { background: "#f44336", color: "white" };
				default:
					return { background: "#eee", color: "black" };
			}
		})();

		if (typeof progress === "number" && progress >= 0 && progress < 100) {
			return {
				...baseStyle,
				background: `linear-gradient(to right, rgba(25,118,210,0.5) ${progress}%, ${baseStyle.background} ${progress}%)`,
			};
		}

		return baseStyle;
	};

	// Dynamic researcher nodes
	const researchItems =
		graphState?.plannerOutput?.researchers ?? EMPTY_RESEARCH_ITEMS;
	const dirtyResearchIds = controlState?.dirtyResearchIds ?? EMPTY_DIRTY_RESEARCH_IDS;
	const dirtyResearchIdSet = useMemo(
		() => new Set(dirtyResearchIds),
		[dirtyResearchIds]
	);
	const isPausedBeforeResearchers =
		controlState?.waiting === true && controlState.pausedAt === "researchers";
	const isPausedBeforeSynthesizer =
		controlState?.waiting === true && controlState.pausedAt === "synthesizer";
	const canManageResearchPlan = isPausedBeforeResearchers || isPausedBeforeSynthesizer;
	const mustRerunResearch = isPausedBeforeSynthesizer && dirtyResearchIds.length > 0;

	const openAddResearcher = () => {
		setResearchModal({
			mode: "add",
			item: {
				id: createResearchPlanId(),
				prompt: "",
				mode: "web",
			},
		});
	};

	const openEditResearcher = (item: ResearchPlanItem) => {
		setResearchModal({
			mode: "edit",
			item: { ...item },
		});
	};

	const openRemoveResearcher = (item: ResearchPlanItem) => {
		setResearchModal({
			mode: "remove",
			item: { ...item },
		});
	};

	const updateResearchModalItem = (
		patch: Partial<ResearchPlanItem>
	) => {
		setResearchModal((prev) => {
			if (prev.mode === "closed" || prev.mode === "remove") {
				return prev;
			}

			return {
				...prev,
				item: {
					...prev.item,
					...patch,
				},
			};
		});
	};

	const closeResearchModal = () => {
		setResearchModal({ mode: "closed" });
	};

	const submitResearchPlan = async (nextResearchPlan: ResearchPlanItem[]) => {
		await onResearchPlanChange?.(nextResearchPlan);
		closeResearchModal();
	};

	const dynamicResearchNodes = useMemo<Node[]>(() => {
		return researchItems
			.slice(0, visibleResearchCount)
			.map((item: ResearchPlanItem, index: number) => {
				const nodeId = getResearchNodeId(item.id);
				const progress = researcherProgress[nodeId] ?? 0;
				return {
					id: nodeId,
					data: {
						label: `Researcher ${index + 1}`,
						topic: item.prompt,
						mode: item.mode,
						progress,
						dirty: dirtyResearchIdSet.has(item.id),
					},
					position: { x: 0, y: 0 },
				};
			});
	}, [dirtyResearchIdSet, researchItems, visibleResearchCount, researcherProgress]);

	const researchItemIds = useMemo(
		() => researchItems.map((item) => item.id),
		[researchItems]
	);

	const showResearchersPlaceholder =
		researchItems.length === 0 || visibleResearchCount === 0;

	const nodes = useMemo<Node[]>(() => {
		if (showResearchersPlaceholder) {
			return [...BASE_NODES, ...dynamicResearchNodes];
		}

		return [
			...BASE_NODES.filter((node) => node.id !== "researchers"),
			...dynamicResearchNodes,
		];
	}, [dynamicResearchNodes, showResearchersPlaceholder]);

	const edges = useMemo<Edge[]>(() => {
		const nextEdges: Edge[] = [
			{ id: "e0", source: "planner", target: "research_router" },
			{ id: "e0a", source: "research_router", target: "researchers" },
			{ id: "e0b", source: "researchers", target: "synthesizer" },
			{ id: "e1", source: "synthesizer", target: "writer" },
			{ id: "e2", source: "writer", target: "critic" },
		];

		if (showResearchersPlaceholder) {
			return nextEdges;
		}

		return [
			...nextEdges.filter(
				(edge) =>
					edge.source !== "research_router" &&
					edge.target !== "researchers" &&
					edge.source !== "researchers"
			),
			...researchItems.slice(0, visibleResearchCount).flatMap((item) => [
				{
					id: `er_${item.id}`,
					source: "research_router",
					target: getResearchNodeId(item.id),
				},
				{
					id: `er2_${item.id}`,
					source: getResearchNodeId(item.id),
					target: "synthesizer",
				},
			]),
		];
	}, [researchItems, showResearchersPlaceholder, visibleResearchCount]);

	useEffect(() => {
		const previousIds = previousResearchIdsRef.current;
		const nextIds = researchItemIds;
		previousResearchIdsRef.current = nextIds;

		if (nextIds.length === 0) {
			const frame = requestAnimationFrame(() => {
				setVisibleResearchCount(0);
			});
			return () => cancelAnimationFrame(frame);
		}

		const idsUnchanged =
			previousIds.length === nextIds.length &&
			previousIds.every((id, index) => id === nextIds[index]);

		if (idsUnchanged) {
			const frame = requestAnimationFrame(() => {
				setVisibleResearchCount((prev) => Math.min(prev || nextIds.length, nextIds.length));
			});
			return () => cancelAnimationFrame(frame);
		}

		const allPreviousStillPresent = previousIds.every((id) => nextIds.includes(id));
		const onlyAppendedAtEnd =
			allPreviousStillPresent &&
			nextIds.length > previousIds.length &&
			previousIds.every((id, index) => id === nextIds[index]);

		if (onlyAppendedAtEnd) {
			const interval = setInterval(() => {
				setVisibleResearchCount((prev) => {
					if (prev >= nextIds.length) {
						clearInterval(interval);
						return prev;
					}
					return prev + 1;
				});
			}, 350);

			return () => clearInterval(interval);
		}

		const frame = requestAnimationFrame(() => {
			setVisibleResearchCount(nextIds.length);
		});
		return () => cancelAnimationFrame(frame);
	}, [researchItemIds]);

	// Apply layout
	const layouted = useMemo(() => getLayoutedElements(nodes, edges), [nodes, edges]);

	// Apply styles
	const styledNodes = useMemo(() => {
		return layouted.nodes.map((node) => {
			const status = (() => {
				if (failedNodes?.has(node.id)) return "failed";
				if (completedNodes?.has(node.id)) return "completed";
				if (activeNodes?.has(node.id)) return "active";
				if (activeNode === node.id) return "active";
				return "idle";
			})();

			const progress =
				node.data?.progress ??
				(isResearchNode(node.id)
					? researcherProgress?.[node.id] ?? 0
					: undefined);

			// 🔥 ADD THIS
			const isSelected = node.id === displayedSelectedNode;

			return {
				...node,
				style: {
					...getNodeStyle(status, progress),
					borderRadius: 10,
					padding: 10,
					border: isSelected ? "3px solid #1976d2" : "1px solid #ccc",
					boxShadow: isSelected ? "0 0 10px rgba(25,118,210,0.4)" : "none",
				},
			};
		});
	}, [
		layouted.nodes,
		activeNode,
		activeNodes,
		completedNodes,
		failedNodes,
		researcherProgress,
		displayedSelectedNode,
	]);

	useEffect(() => {
		if (!rfInstance) return;

		let nodesChanged = false;
		let edgesChanged = false;

		if (!isEqual(rfNodes, styledNodes)) {
			setRfNodes(styledNodes);
			nodesChanged = true;
		}

		if (!isEqual(rfEdges, layouted.edges)) {
			setRfEdges(layouted.edges);
			edgesChanged = true;
		}

		// 🔥 Only fit when something actually changed
		if (nodesChanged || edgesChanged) {
			// Delay ensures DOM + dagre layout is fully applied
			requestAnimationFrame(() => {
				setTimeout(() => {
					rfInstance.fitView({
						padding: 0.25,
						duration: 600,
					});
				}, 120); // 🔥 critical fix (was 0)
			});
		}
	}, [rfInstance, styledNodes, layouted.edges, rfNodes, rfEdges, setRfNodes, setRfEdges]);

	const thoughts = useMemo<Record<string, { text: string; timestamp: number }>>(() => {
		if (graphState.lastEvent?.type === "RESET") {
			return {};
		}

		const nextThoughts: Record<string, { text: string; timestamp: number }> = {};
		let order = 0;

		const addThought = (nodeId: string, text: string) => {
			order += 1;
			nextThoughts[nodeId] = {
				text,
				timestamp: order,
			};
		};

		activeNodes?.forEach((nodeId: string) => {
			addThought(nodeId, `🧠 ${formatNodeLabel(nodeId)} is thinking...`);
		});

		if (activeNode) {
			addThought(activeNode, `⚡ ${formatNodeLabel(activeNode)} started`);
		}

		completedNodes?.forEach((id: string) => {
			addThought(id, `✅ ${formatNodeLabel(id)} completed`);
		});

		failedNodes?.forEach((id: string) => {
			addThought(id, `❌ ${formatNodeLabel(id)} failed`);
		});

		Object.entries(streamingContent).forEach(([nodeId, content]) => {
			if (!content) return;

			addThought(nodeId, `🧠 ${formatNodeLabel(nodeId)}:\n${content}`);
		});

		return nextThoughts;
	}, [
		activeNode,
		activeNodes,
		completedNodes,
		failedNodes,
		graphState.lastEvent,
		streamingContent,
	]);

	return (
		<div style={{ display: "flex", flex: 1, minHeight: "calc(100vh - 200px)" }}>
			{/* 🔥 GRAPH PANEL */}
			<div style={{ flex: 2, minWidth: 0 }}>
				<ReactFlow
					nodes={rfNodes}
					edges={rfEdges}
					onInit={setRfInstance}
					onNodeClick={(_, node) => setSelectedNode(node.id)}
				>
					<Background />
					<Controls />
				</ReactFlow>
			</div>

			{/* 🔥 RIGHT SIDE PANELS */}
			<div
				style={{
					display: "flex",
					width: 500,
					borderLeft: "1px solid #ddd",
					color: "#333",
					fontFamily: "sans-serif",
				}}
			>
				{/* 🧪 Researchers Panel */}
				<div
					style={{
						flex: 1,
						padding: 12,
						overflowY: "auto",
						background: "#fafafa",
						borderRight: "1px solid #ddd",
						maxHeight: "calc(100vh - 200px)",
					}}
				>
					<h3 style={{ marginBottom: 20 }}>Researchers</h3>
					<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
						<Button
							variant="outlined"
							size="small"
							onClick={openAddResearcher}
							disabled={!canManageResearchPlan}
						>
							Add Researcher
						</Button>
						<div style={{ fontSize: 12, color: "#666", maxWidth: 140, textAlign: "right" }}>
							{isPausedBeforeResearchers
								? "You can edit prompts and routing before research starts."
								: isPausedBeforeSynthesizer
									? mustRerunResearch
										? "Rerun changed research before continuing to Synthesizer."
										: "You can still refine the research plan here."
									: "Editing unlocks while paused before Researchers or Synthesizer."}
						</div>
					</div>
					{mustRerunResearch ? (
						<div
							style={{
								marginBottom: 12,
								padding: 8,
								borderRadius: 8,
								background: "#fff3cd",
								border: "1px solid #f0d98a",
								fontSize: 12,
								color: "#6d5200",
							}}
						>
							Changed researchers need fresh outputs before synthesis can continue.
						</div>
					) : null}
					{isPausedBeforeSynthesizer ? (
						<Button
							variant="contained"
							size="small"
							onClick={() => {
								void onRerunResearch?.();
							}}
							disabled={!mustRerunResearch}
							sx={{ mb: 1.5 }}
						>
							Rerun Changed Research
						</Button>
					) : null}

					{researchItems.length === 0 ? (
						<p style={{ color: "#666" }}>No researchers yet</p>
					) : (
						<ul style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
							{researchItems.map((item: ResearchPlanItem, index: number) => {
									const progress =
										graphState?.researcherProgress?.[getResearchNodeId(item.id)] ?? 0;
									const isDirty = dirtyResearchIdSet.has(item.id);

									return (
										<li
											key={item.id}
											style={{
												marginBottom: 12,
												padding: 8,
												borderRadius: 8,
												background: "#fff",
												border: "1px solid #ddd",
											}}
										>
											<div style={{ fontWeight: 700 }}>
												Researcher {index + 1}
											</div>
											{isDirty ? (
												<div style={{ fontSize: 11, color: "#b26a00", marginTop: 2 }}>
													Needs rerun
												</div>
											) : null}
											<div style={{ fontSize: 12, color: "#555" }}>
												{item.prompt}
											</div>
											<div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
												Route: {item.mode.toUpperCase()}
											</div>
											<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
												<Button
													variant="text"
													size="small"
													onClick={() => openEditResearcher(item)}
													disabled={!canManageResearchPlan}
												>
													Edit
												</Button>
												<Button
													variant="text"
													size="small"
													color="error"
													onClick={() => openRemoveResearcher(item)}
													disabled={!canManageResearchPlan}
												>
													Remove
												</Button>
											</div>

											<div
												style={{
													height: 6,
													background: "#eee",
													marginTop: 6,
													borderRadius: 999,
												}}
											>
												<div
													style={{
														width: `${progress}%`,
														height: "100%",
														background: "#1976d2",
														borderRadius: 999,
													}}
												/>
											</div>
										</li>
									);
								})}
						</ul>
					)}
				</div>

				{/* 🧠 Thoughts Panel */}
				<div
					style={{
						flex: 1,
						padding: 12,
						overflowY: "auto",
						background: "#f5f5f5",
						maxHeight: "calc(100vh - 200px)",
					}}
				>
					<h3 style={{ marginBottom: 20 }}>
						Agent Thoughts
					</h3>
					<div
						style={{
							marginBottom: 16,
							padding: 10,
							background: "#fff",
							border: "1px solid #ddd",
							borderRadius: 8,
							display: "flex",
							flexDirection: "column",
							gap: 8,
						}}
					>
						<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<button
								onClick={() => {
									void onContinue?.();
								}}
								disabled={
									!controlState?.sessionId ||
									!controlState.waiting ||
									mustRerunResearch
								}
								style={{
									padding: "6px 10px",
									cursor:
										controlState?.sessionId &&
										controlState.waiting &&
										!mustRerunResearch
											? "pointer"
											: "not-allowed",
								}}
							>
								Continue
							</button>
						</div>
						<label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
							<input
								type="checkbox"
								checked={controlState?.autoProceed ?? false}
								disabled={!controlState?.sessionId}
								onChange={(event) => {
									void onToggleAuto?.(event.target.checked);
								}}
							/>
							Auto-run next stages
						</label>
						<div style={{ fontSize: 12, color: "#555" }}>
							{mustRerunResearch
								? "Changed research must be rerun before continuing."
								: controlState?.waiting
								? `Paused before ${formatCheckpointLabel(controlState.pausedAt)}`
								: controlState?.sessionId
									? controlState.autoProceed
										? "Running automatically"
										: "Manual approval mode"
									: "No active run control"}
						</div>
					</div>
					{displayedSelectedNode ? (
							<div>
								<h3 style={{ marginTop: 20, marginBottom: 10 }}>
									{formatNodeLabel(displayedSelectedNode)}
								</h3>

							<div
								style={{
									background: "#fff",
									border: "1px solid #ddd",
									borderRadius: 6,
									padding: 10,
								}}
							>
								<MarkdownRenderer
									content={
										streamingContent[displayedSelectedNode] ||
										"No reasoning yet..."
									}
								/>
							</div>

							<button
								onClick={() => setSelectedNode(null)}
								style={{
									marginTop: 10,
									fontSize: 12,
									padding: "4px 8px",
									cursor: "pointer",
								}}
							>
								← Back to Thoughts
							</button>
						</div>
					) : Object.keys(thoughts).length === 0 ? (
						<p style={{ color: "#666" }}>
							Waiting for agents...
						</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							{Object.entries(thoughts)
								.sort((a, b) => b[1].timestamp - a[1].timestamp)
								.map(([key, t]) => (
									<div
										key={key}
										onClick={() => setSelectedNode(key)}
										style={{
											fontSize: 12,
											padding: "6px 8px",
											borderRadius: 6,
											background: "#fff",
											border: "1px solid #ddd",
											cursor: "pointer",
											transition: "all 0.2s",
										}}
										onMouseEnter={(e) =>
											(e.currentTarget.style.background = "#f0f0f0")
										}
										onMouseLeave={(e) =>
											(e.currentTarget.style.background = "#fff")
										}
									>
										{t.text}
									</div>
								))}
						</div>
					)}
				</div>
			</div>
			<Dialog open={researchModal.mode !== "closed"} onClose={closeResearchModal} fullWidth maxWidth="sm">
				<DialogTitle>
					{researchModal.mode === "add"
						? "Add Researcher"
						: researchModal.mode === "edit"
							? "Edit Researcher"
							: "Remove Researcher"}
				</DialogTitle>
				<DialogContent>
					{researchModal.mode === "remove" ? (
						<div style={{ paddingTop: 8, color: "#444" }}>
							Remove this researcher task?
							<div style={{ marginTop: 12, fontSize: 14 }}>
								{researchModal.item.prompt}
							</div>
						</div>
					) : researchModal.mode === "closed" ? null : (
						<div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
							<TextField
								label="Research Prompt"
								value={researchModal.item.prompt}
								onChange={(event) => {
									updateResearchModalItem({ prompt: event.target.value });
								}}
								fullWidth
								multiline
								minRows={4}
							/>
							<FormControl fullWidth>
								<InputLabel id="research-mode-label">Routing Mode</InputLabel>
								<Select
									labelId="research-mode-label"
									label="Routing Mode"
									value={researchModal.item.mode}
									onChange={(event: SelectChangeEvent<ResearchMode>) => {
										updateResearchModalItem({
											mode: event.target.value as ResearchMode,
										});
									}}
								>
									<MenuItem value="web">Web Search</MenuItem>
									<MenuItem value="llm">LLM Only</MenuItem>
								</Select>
							</FormControl>
						</div>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={closeResearchModal}>Cancel</Button>
					{researchModal.mode === "remove" ? (
						<Button
							color="error"
							onClick={() => {
								void submitResearchPlan(
									researchItems.filter((item) => item.id !== researchModal.item.id)
								);
							}}
						>
							Remove
						</Button>
					) : researchModal.mode === "closed" ? null : (
						<Button
							onClick={() => {
								const trimmedPrompt = researchModal.item.prompt.trim();
								if (!trimmedPrompt) {
									return;
								}

								if (researchModal.mode === "add") {
									void submitResearchPlan([
										...researchItems,
										{
											...researchModal.item,
											prompt: trimmedPrompt,
										},
									]);
									return;
								}

								void submitResearchPlan(
									researchItems.map((item) =>
										item.id === researchModal.item.id
											? {
												...researchModal.item,
												prompt: trimmedPrompt,
											}
											: item
									)
								);
							}}
							disabled={!researchModal.item.prompt.trim()}
						>
							Save
						</Button>
					)}
				</DialogActions>
			</Dialog>
		</div>
	);
}

function formatNodeLabel(nodeId: string) {
	if (nodeId.startsWith("research_")) {
		return "Researcher";
	}

	if (nodeId === "research_router") {
		return "Research Router";
	}

	// Capitalize other nodes
	return nodeId.charAt(0).toUpperCase() + nodeId.slice(1);
}
