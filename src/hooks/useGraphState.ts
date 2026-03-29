"use client";

import { useReducer } from "react";

type State = {
  activeNode: string | null;
  completedNodes: Set<string>;
  failedNodes: Set<string>;
  attempts: Record<string, number>;
  lastEvent: any;

  // ✅ stores planner output (researchers list)
  plannerOutput: any;
};

type Action =
  | { type: "NODE_START"; nodeId: string; attempt?: number }
  | { type: "NODE_DONE"; nodeId: string }
  | { type: "NODE_FAIL"; nodeId: string }
  | { type: "PLANNER_DONE"; data: any }
  | { type: "RESET" };

const initialState: State = {
  activeNode: null,
  completedNodes: new Set<string>(),
  failedNodes: new Set<string>(),
  attempts: {},
  lastEvent: null,
  plannerOutput: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "NODE_START": {
      return {
        ...state,
        activeNode: action.nodeId,
        attempts: {
          ...state.attempts,
          [action.nodeId]: action.attempt ?? 1,
        },
        lastEvent: action,
      };
    }

    case "NODE_DONE": {
      const completed = new Set(state.completedNodes);
      completed.add(action.nodeId);

      return {
        ...state,
        activeNode: null,
        completedNodes: completed,
        lastEvent: action,
      };
    }

    case "NODE_FAIL": {
      const failed = new Set(state.failedNodes);
      failed.add(action.nodeId);

      return {
        ...state,
        activeNode: null,
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