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
	Box,
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
	Typography,
	Checkbox,
	FormControlLabel,
	type SelectChangeEvent,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import AddIcon from "@mui/icons-material/Add";
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
	const completedResearchCount = researchItems.filter((item) =>
		completedNodes?.has(getResearchNodeId(item.id))
	).length;
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
	const allResearchIdsCompleted =
		researchItems.length > 0 &&
		researchItems.every((item) => completedNodes?.has(getResearchNodeId(item.id)));

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
			addThought(nodeId, `✨ ${formatNodeLabel(nodeId)} is thinking...`);
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

			addThought(nodeId, `✨ ${formatNodeLabel(nodeId)}:\n${content}`);
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
						borderLeft: "1px solid var(--panel-border)",
						color: "var(--text-color)",
						fontFamily: "sans-serif",
					}}
				>
				{/* 🧪 Researchers Panel */}
				<div
					style={{
						flex: 1,
						padding: 12,
						overflowY: "auto",
						background: "var(--card-bg)",
						borderRight: "1px solid var(--panel-border)",
						maxHeight: "calc(100vh - 200px)",
					}}
				>
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
						<Typography
							variant="subtitle2"
							sx={{ fontWeight: 600, fontSize: { xs: "1rem", md: "1.05rem" }, letterSpacing: 0.15 }}
						>
							Researchers
						</Typography>
						<Box
							sx={{
								height: 6,
								borderRadius: 3,
								background: "#e2e8f0",
								overflow: "hidden",
							}}
						>
							<Box
								sx={{
									height: "100%",
									width: `${researchItems.length ? (completedResearchCount / researchItems.length) * 100 : 0}%`,
									background: "linear-gradient(90deg, #2563eb, #4f46e5)",
									transition: "width 0.3s ease",
								}}
							/>
						</Box>
						<Typography variant="caption" sx={{ color: "var(--text-color)" }}>
							{researchItems.length
								? `${completedResearchCount} / ${researchItems.length} complete`
								: "No researchers yet"}
						</Typography>
					</Box>
					<div style={{ marginBottom: 12, maxWidth: 240 }}>
						<Button
							variant="outlined"
							disableElevation
							onClick={openAddResearcher}
							disabled={!canManageResearchPlan}
							sx={{
								borderStyle: "dashed",
								borderColor: "rgba(15,23,42,0.3)",
								paddingY: 1.5,
								paddingX: 2.5,
								minWidth: 200,
								textTransform: "none",
								color: "rgba(15,23,42,0.9)",
								borderRadius: 2.5,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 6,
								background: "rgba(255,255,255,0.9)",
							}}
						>
							<AddIcon
								sx={{
									fontSize: 18,
									color: canManageResearchPlan
										? "rgba(15,23,42,0.8)"
										: "rgba(15,23,42,0.3)",
								}}
							/>
							<Typography
								sx={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}
							>
								Add Researcher
							</Typography>
						</Button>
						<Typography
							variant="caption"
							sx={{ color: "var(--text-color)", mt: 1, fontSize: 12 }}
						>
							{isPausedBeforeResearchers
								? "You can edit prompts and routing before research starts."
								: isPausedBeforeSynthesizer
									? mustRerunResearch
										? "Rerun changed research before continuing to Synthesizer."
										: "You can still refine the plan here."
									: "Editing unlocks while paused before Researchers or Synthesizer."}
						</Typography>
					</div>
					{mustRerunResearch ? (
						<div
							style={{
								marginBottom: 12,
								padding: 8,
								borderRadius: 8,
								background: "rgba(251, 191, 36, 0.12)",
								border: "1px solid rgba(251, 191, 36, 0.5)",
								fontSize: 12,
								color: "#92400e",
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
						<p style={{ color: "var(--foreground)" }}>No researchers yet</p>
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
											padding: 0,
											borderRadius: 8,
											background: "var(--card-bg)",
											display: "flex",
											overflow: "hidden",
											border: "1px solid rgba(15,23,42,0.08)",
											boxShadow: "0 6px 20px rgba(15,23,42,0.05)",
										}}
									>
										<div
											style={{
												width: 4,
												background: isDirty ? "#f97316" : "#1976d2",
											}}
										/>
										<div
											style={{
												flex: 1,
												padding: 14,
												display: "flex",
												flexDirection: "column",
												gap: 6,
											}}
										>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "center",
													gap: 8,
												}}
											>
													<div
														style={{
															fontSize: 12,
															color: "var(--text-color)",
															textTransform: "uppercase",
															letterSpacing: 0.4,
															padding: "2px 6px",
															borderRadius: 6,
															background: "rgba(148, 163, 184, 0.12)",
															display: "inline-flex",
															alignItems: "center",
															gap: 4,
														}}
													>
													<span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8" }} />
													Researcher {index + 1}
												</div>
												{isDirty && (
													<Typography
														variant="caption"
														sx={{ color: "#b45309", fontWeight: 600 }}
													>
														Needs rerun
													</Typography>
												)}
											</div>

											<Typography
												variant="body2"
												sx={{ fontSize: 14, fontWeight: 500, color: "var(--text-color)" }}
											>
												{item.prompt}
											</Typography>

											<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
												<span style={{ fontSize: 14 }}>🌐</span>
												<Typography
													variant="caption"
													sx={{ color: "var(--text-color)", textTransform: "uppercase", fontWeight: 600 }}
												>
													{item.mode === "web" ? "Web Research" : "LLM Only"}
												</Typography>
											</div>

											<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
												<Button
													variant="outlined"
													size="small"
													disabled={!canManageResearchPlan}
													onClick={() => openEditResearcher(item)}
													sx={{
														borderColor: "rgba(15,23,42,0.2)",
														color: "#0f172a",
														textTransform: "uppercase",
														borderRadius: 999,
														px: 3,
													}}
												>
													Edit
												</Button>
												<Button
													variant="outlined"
													size="small"
													disabled={!canManageResearchPlan}
													onClick={() => openRemoveResearcher(item)}
													sx={{
														borderColor: "rgba(244,63,94,0.5)",
														color: "#dc2626",
														textTransform: "uppercase",
														borderRadius: 999,
														px: 3,
														"&:hover": {
															borderColor: "#dc2626",
														},
													}}
												>
													Remove
												</Button>
											</div>

											<div
												style={{
													height: 6,
													background: "#e2e8f0",
													marginTop: 4,
													borderRadius: 999,
													overflow: "hidden",
												}}
											>
												<div
													style={{
														width: `${progress}%`,
														height: "100%",
														background: "#2563eb",
														borderRadius: 999,
													}}
												/>
											</div>
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
						background: "var(--card-bg)",
						borderLeft: "1px solid var(--panel-border)",
						maxHeight: "calc(100vh - 200px)",
					}}
				>
					<Typography
						variant="subtitle2"
						sx={{ fontWeight: 600, fontSize: { xs: "1rem", md: "1.05rem" }, letterSpacing: 0.15, mb: 2 }}
					>
						Agent Thoughts
					</Typography>
					<div
						style={{
							marginBottom: 16,
							padding: 10,
							background: "var(--card-bg)",
							border: "1px solid var(--panel-border)",
							borderRadius: 8,
							display: "flex",
							flexDirection: "column",
							gap: 8,
						}}
					>
						<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<Button
								variant="contained"
								color="primary"
								className="continue-button"
								startIcon={<PlayArrowIcon />}
								disabled={
									!controlState?.sessionId ||
									!controlState.waiting ||
									mustRerunResearch
								}
								sx={{
									borderRadius: 20,
									textTransform: "none",
									boxShadow: "0 12px 25px rgba(37,99,235,0.3)",
									py: 1,
									px: 3,
								}}
								onClick={() => {
									void onContinue?.();
								}}
							>
								Continue
							</Button>
						</div>
						<FormControlLabel
							control={
								<Checkbox
									size="small"
									checked={controlState?.autoProceed ?? false}
									disabled={!controlState?.sessionId}
									onChange={(event) => {
										void onToggleAuto?.(event.target.checked);
									}}
									sx={{
										color: "var(--text-color)",
										borderColor: "var(--text-color)",
										"& .MuiSvgIcon-root": {
											color: "var(--text-color)",
										},
										"&.Mui-checked": {
											color: "var(--text-color)",
											"& .MuiSvgIcon-root": {
												color: "var(--text-color)",
											},
										},
									}}
								/>
							}
							label={
								<Typography variant="caption" sx={{ color: "var(--text-color)", mt: 0.5 }}>
									Auto-run next stages
								</Typography>
							}
						/>
						<div style={{ fontSize: 12, color: "var(--text-color)", lineHeight: 1.5 }}>
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
						<Box
							sx={{
								mt: 1,
								px: 2,
								py: 1,
								borderRadius: 3,
								background: mustRerunResearch ? "rgba(251, 191, 36, 0.12)" : "rgba(16, 185, 129, 0.12)",
								border: mustRerunResearch ? "1px solid rgba(251, 191, 36, 0.5)" : "1px solid rgba(16, 185, 129, 0.5)",
								display: "flex",
								alignItems: "center",
								gap: 1,
							}}
						>
							<Box
								sx={{
									width: 8,
									height: 8,
									borderRadius: "50%",
									background: mustRerunResearch ? "#f97316" : "#34d399",
									animation: "pulseGlow 1.6s infinite",
								}}
							/>
							<CheckCircleIcon
								fontSize="small"
								sx={{ color: mustRerunResearch ? "#f97316" : "#059669" }}
							/>
							<Typography variant="caption" sx={{ color: mustRerunResearch ? "#92400e" : "#065f46" }}>
								{mustRerunResearch
									? "Research updates detected—rerun required before synthesis."
									: allResearchIdsCompleted
										? "Research stage synchronized. Ready for the synthesizer."
										: "Research still running. Stay paused until completion."}
							</Typography>
						</Box>
					</div>
					{displayedSelectedNode ? (
							<div>
							<Typography
								variant="subtitle2"
								sx={{ fontWeight: 600, fontSize: "1rem", letterSpacing: 0.15, marginTop: 2, marginBottom: 1 }}
							>
								{formatNodeLabel(displayedSelectedNode)}
							</Typography>

							<div
								style={{
									background: "var(--card-bg)",
									border: "1px solid var(--panel-border)",
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
						<p style={{ color: "var(--foreground)" }}>
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
									padding: "8px 10px",
									borderRadius: 8,
									background: "var(--card-bg)",
									border: "1px solid var(--panel-border)",
									cursor: "pointer",
									transition: "all 0.2s",
								}}
								onMouseEnter={(e) =>
									(e.currentTarget.style.background = "rgba(248, 250, 252, 1)")
								}
								onMouseLeave={(e) =>
									(e.currentTarget.style.background = "var(--card-bg)")
								}
							>
								<Typography
									variant="body2"
									sx={{ lineHeight: 1.5, fontSize: 12 }}
								>
									{t.text}
								</Typography>
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
