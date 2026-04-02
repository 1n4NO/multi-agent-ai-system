"use client";

import { useReducer } from "react";

type State = {
  activeNode: string | null;
  activeNodes: Set<string>;
  completedNodes: Set<string>;
  failedNodes: Set<string>;
  attempts: Record<string, number>;
  researcherProgress: Record<string, number>;
  lastEvent: any;

  // ✅ stores planner output (researchers list)
  plannerOutput: any;
};

type Action =
  | { type: "NODE_START"; nodeId: string; attempt?: number }
  | { type: "NODE_PROGRESS"; nodeId: string; progress: number }
  | { type: "NODE_DONE"; nodeId: string }
  | { type: "NODE_FAIL"; nodeId: string }
  | { type: "PLANNER_DONE"; data: any }
  | { type: "RESET" };

const initialState: State = {
  activeNode: null,
  activeNodes: new Set<string>(),
  completedNodes: new Set<string>(),
  failedNodes: new Set<string>(),
  attempts: {},
  researcherProgress: {},
  lastEvent: null,
  plannerOutput: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "NODE_START": {
      const activeNodes = new Set(state.activeNodes);
      activeNodes.add(action.nodeId);

      return {
        ...state,
        activeNode: action.nodeId,
        activeNodes,
        attempts: {
          ...state.attempts,
          [action.nodeId]: action.attempt ?? 1,
        },
        researcherProgress: {
          ...state.researcherProgress,
          [action.nodeId]: action.nodeId.startsWith("research_") ? 0 : state.researcherProgress[action.nodeId] || 0,
        },
        lastEvent: action,
      };
    }

    case "NODE_PROGRESS": {
      return {
        ...state,
        researcherProgress: {
          ...state.researcherProgress,
          [action.nodeId]: action.progress,
        },
        lastEvent: action,
      };
    }

    case "NODE_DONE": {
      const completed = new Set(state.completedNodes);
      completed.add(action.nodeId);

      const activeNodes = new Set(state.activeNodes);
      activeNodes.delete(action.nodeId);

      return {
        ...state,
        activeNode: activeNodes.size > 0 ? Array.from(activeNodes)[0] : null,
        activeNodes,
        completedNodes: completed,
        researcherProgress: {
          ...state.researcherProgress,
          [action.nodeId]: 100,
        },
        lastEvent: action,
      };
    }

    case "NODE_FAIL": {
      const failed = new Set(state.failedNodes);
      failed.add(action.nodeId);

      const activeNodes = new Set(state.activeNodes);
      activeNodes.delete(action.nodeId);

      return {
        ...state,
        activeNode: activeNodes.size > 0 ? Array.from(activeNodes)[0] : null,
        activeNodes,
        failedNodes: failed,
        lastEvent: action,
      };
    }

    case "PLANNER_DONE":
      return {
        ...state,
        plannerOutput: {
    	raw: action.data,
    	researchers: action?.data?.researchers.map((item: any) => item.topic),
  },
        lastEvent: action,
      };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

export function useGraphState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  return { state, dispatch };
}