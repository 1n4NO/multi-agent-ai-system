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
		{ id: string; text: string; timestamp: number }[]
	>([]);
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

		const newThoughts: { id: string; text: string; timestamp: number }[] = [];

		// Active nodes
		if (activeNodes) {
			activeNodes.forEach((nodeId: string) => {
				newThoughts.push({
					id: `${nodeId}-${now}-${thoughtIdCounter.current++}`,
					text: `🧠 ${nodeId} is thinking...`,
					timestamp: now,
				});
			});
		}

		// Single active node fallback
		if (activeNode) {
			newThoughts.push({
				id: `${activeNode}-${now}`,
				text: `⚡ ${activeNode} started`,
				timestamp: now,
			});
		}

		if (newThoughts.length > 0) {
			setThoughts((prev) => {
				// prevent spam duplicates
				const combined = [...prev, ...newThoughts];

				// keep last 50 only
				return combined.slice(-50);
			});
		}
	}, [activeNodes, activeNode]);

	useEffect(() => {
		if (!completedNodes && !failedNodes) return;

		const now = Date.now();
		const updates: any[] = [];

		completedNodes?.forEach((id: string) => {
			updates.push({
				id: `${id}-done-${now}-${thoughtIdCounter.current++}`,
				text: `✅ ${id} completed`,
				timestamp: now,
			});
		});

		failedNodes?.forEach((id: string) => {
			updates.push({
				id: `${id}-fail-${now}-${thoughtIdCounter.current++}`,
				text: `❌ ${id} failed`,
				timestamp: now,
			});
		});

		if (updates.length > 0) {
			setThoughts((prev) => [...prev, ...updates].slice(-50));
		}
	}, [completedNodes, failedNodes]);

	return (
		<div style={{ display: "flex", height: 600, gap: 16 }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<ReactFlow
					nodes={rfNodes}
					edges={rfEdges}
					onInit={setRfInstance}
				>
					<Background />
					<Controls />
				</ReactFlow>
			</div>

			<div
				style={{
					width: 320,
					display: "flex",
					flexDirection: "column",
					borderLeft: "1px solid #ddd",
					background: "#0f172a",
					color: "#e2e8f0",
					overflowY: "scroll",
				}}
			>
				{/* Researchers */}
				<div style={{ padding: 12, borderBottom: "1px solid #1e293b" }}>
					<h3 style={{ marginTop: 0 }}>Researchers</h3>

					{researchItems.length === 0 ? (
						<p>No researchers yet</p>
					) : (
						<ul style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
							{researchItems.slice(0, visibleResearchCount).map((topic: string, index: number) => {
								const progress = graphState?.researcherProgress?.[`research_${index}`] ?? 0;

								return (
									<li
										key={index}
										style={{
											marginBottom: 10,
											padding: 8,
											borderRadius: 8,
											background: "#111827",
											border: "1px solid #1f2937",
										}}
									>
										<div style={{ fontWeight: 700, fontSize: 13 }}>
											Researcher {index + 1}
										</div>
										<div style={{ fontSize: 11, opacity: 0.7 }}>{topic}</div>

										<div
											style={{
												height: 6,
												borderRadius: 999,
												background: "#1f2937",
												marginTop: 6,
											}}
										>
											<div
												style={{
													width: `${progress}%`,
													height: "100%",
													borderRadius: 999,
													background: "#3b82f6",
												}}
											/>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				{/* 🧠 Thought Stream */}
				<div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
					<h3 style={{ marginTop: 0 }}>Agent Thoughts</h3>

					{thoughts.length === 0 ? (
						<p style={{ fontSize: 12, opacity: 0.6 }}>
							Waiting for agents...
						</p>
					) : (
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							{thoughts.map((t) => (
								<div
									key={t.id}
									style={{
										fontSize: 12,
										padding: "6px 8px",
										borderRadius: 6,
										background: "#020617",
										border: "1px solid #1e293b",
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