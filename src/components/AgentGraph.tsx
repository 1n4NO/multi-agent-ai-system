"use client";

import ReactFlow, { Background, Controls, Node, Edge, useNodesState, useEdgesState } from "reactflow";
import { useEffect, useState, useRef } from "react";
import "reactflow/dist/style.css";
import { useMemo } from "react";
import dagre from "dagre";
import isEqual from "lodash/isEqual";

type Props = {
	graphState: any;
};

const nodeWidth = 150;
const nodeHeight = 50;

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

export default function AgentGraph({ graphState }: Props) {
	const { activeNode, activeNodes, completedNodes, failedNodes, researcherProgress } = graphState;
	const [rfInstance, setRfInstance] = useState<any>(null);
	const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
	const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
	const [visibleResearchCount, setVisibleResearchCount] = useState(0);
	const [thoughts, setThoughts] = useState<
		Record<string, { text: string; timestamp: number }>
		>({});
	const thoughtIdCounter = useRef(0);


	const isResearchNode = (id: string) => id.startsWith("research_");

	const getNodeStatus = (id: string) => {
		if (failedNodes?.has(id)) return "failed";
		if (completedNodes?.has(id)) return "completed";
		if (activeNodes?.has(id)) return "active";
		if (activeNode === id) return "active";
		return "idle";
	};

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

	// Static nodes
	const baseNodes: Node[] = [
		{ id: "planner", data: { label: "Planner" }, position: { x: 0, y: 0 } },
		{ id: "synthesizer", data: { label: "Synthesizer" }, position: { x: 0, y: 0 } },
		{ id: "writer", data: { label: "Writer" }, position: { x: 0, y: 0 } },
		{ id: "critic", data: { label: "Critic" }, position: { x: 0, y: 0 } },
	];

	// Dynamic researcher nodes
	const researchItems = graphState?.plannerOutput?.researchers || [];

	const dynamicResearchNodes: Node[] = researchItems
		.slice(0, visibleResearchCount)
		.map((topic: string, index: number) => {
			const progress = graphState?.researcherProgress?.[`research_${index}`] ?? 0;
			return {
				id: `research_${index}`,
				data: {
					label: `Researcher ${index + 1}`,
					topic,
					progress,
				},
				position: { x: 0, y: 0 },
			};
		});

	const nodes = [...baseNodes, ...dynamicResearchNodes];

	const edges: Edge[] = [
		{ id: "e1", source: "synthesizer", target: "writer" },
		{ id: "e2", source: "writer", target: "critic" },
	];

	researchItems.slice(0, visibleResearchCount).forEach((_: any, index: number) => {
		edges.push({
			id: `er_${index}`,
			source: "planner",
			target: `research_${index}`,
		});

		edges.push({
			id: `er2_${index}`,
			source: `research_${index}`,
			target: "synthesizer",
		});
	});

	useEffect(() => {
		if (!researchItems || researchItems.length === 0) {
			setVisibleResearchCount(0);
			return;
		}

		// Reset when new plan arrives
		setVisibleResearchCount(0);

		let index = 0;

		const interval = setInterval(() => {
			index++;

			setVisibleResearchCount((prev) => {
				if (prev >= researchItems.length) {
					clearInterval(interval);
					return prev;
				}
				return prev + 1;
			});
		}, 350); // 🔥 speed control (adjust later)

		return () => clearInterval(interval);
	}, [researchItems]);

	// Apply layout
	const layouted = useMemo(() => getLayoutedElements(nodes, edges), [nodes, edges]);

	// Apply styles
	const styledNodes = useMemo(() => {
		return layouted.nodes.map((node) => {
			const status = getNodeStatus(node.id);
			const progress = node.data?.progress ?? (isResearchNode(node.id) ? (researcherProgress?.[node.id] ?? 0) : undefined);

			return {
				...node,
				style: {
					...getNodeStyle(status, progress),
					borderRadius: 10,
					padding: 10,
				},
			};
		});
	}, [layouted.nodes, activeNode, activeNodes, completedNodes, failedNodes, researcherProgress]);

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
	}, [rfInstance, styledNodes, layouted.edges]);

	useEffect(() => {
	if (!activeNodes && !activeNode) return;

	const now = Date.now();

	setThoughts((prev) => {
		const updated = { ...prev };

		activeNodes?.forEach((nodeId: string) => {
			updated[nodeId] = {
				text: `🧠 ${nodeId} is thinking...`,
				timestamp: now,
			};
		});

		if (activeNode) {
			updated[activeNode] = {
				text: `⚡ ${activeNode} started`,
				timestamp: now,
			};
		}

		return updated;
	});
}, [activeNodes, activeNode]);

	useEffect(() => {
	if (!completedNodes && !failedNodes) return;

	const now = Date.now();

	setThoughts((prev) => {
		const updated = { ...prev };

		completedNodes?.forEach((id: string) => {
			updated[id] = {
				text: `✅ ${id} completed`,
				timestamp: now,
			};
		});

		failedNodes?.forEach((id: string) => {
			updated[id] = {
				text: `❌ ${id} failed`,
				timestamp: now,
			};
		});

		return updated;
	});
}, [completedNodes, failedNodes]);

	return (
	<div style={{ display: "flex", flex: 1, minHeight: 500 }}>
		{/* 🔥 GRAPH PANEL */}
		<div style={{ flex: 2, minWidth: 0 }}>
			<ReactFlow
				nodes={rfNodes}
				edges={rfEdges}
				onInit={setRfInstance}
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
				<h3 style={{ marginTop: 0 }}>Researchers</h3>

				{researchItems.length === 0 ? (
					<p>No researchers yet</p>
				) : (
					<ul style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
						{researchItems
							.slice(0, visibleResearchCount)
							.map((topic: string, index: number) => {
								const progress =
									graphState?.researcherProgress?.[`research_${index}`] ?? 0;

								return (
									<li
										key={index}
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
										<div style={{ fontSize: 12, color: "#555" }}>
											{topic}
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
				<h3 style={{ marginTop: 0 }}>Agent Thoughts</h3>

				{Object.keys(thoughts).length === 0 ? (
					<p style={{ fontSize: 12, color: "#666" }}>
						Waiting for agents...
					</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						{Object.entries(thoughts)
							.sort((a, b) => b[1].timestamp - a[1].timestamp)
							.map(([key, t]) => (
							<div
								key={key}
								style={{
									fontSize: 12,
									padding: "6px 8px",
									borderRadius: 6,
									background: "#fff",
									border: "1px solid #ddd",
								}}
							>
								{t.text}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	</div>
);
}