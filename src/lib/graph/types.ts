export type NodeId = string;

export type GraphNode = {
	id: NodeId;
	run: (input: any) => Promise<any>;
};

export type Edge = {
	from: NodeId;
	to: NodeId;
};

export type Graph = {
	nodes: Record<NodeId, GraphNode>;
	edges: Edge[];
};