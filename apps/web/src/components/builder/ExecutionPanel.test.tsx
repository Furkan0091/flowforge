import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutionPanel } from "./ExecutionPanel";
import type { ExecutionDetail, ExecutionListItem } from "../../lib/types";

const execution: ExecutionDetail = {
  id: "exec_1",
  workflowId: "wf_1",
  workflow: { id: "wf_1", name: "Test Flow", status: "enabled" },
  version: { version: 1, definition: { nodes: [], edges: [] } },
  triggerType: "manual",
  status: "completed",
  triggerData: null,
  error: null,
  startedAt: "2024-01-01T10:00:00Z",
  finishedAt: "2024-01-01T10:00:01Z",
  createdAt: "2024-01-01T10:00:00Z",
  durationMs: 1000,
  nodeCount: 2,
  nodes: [
    {
      nodeId: "n1",
      nodeType: "manual",
      label: "Manual Trigger",
      status: "success",
      attempts: 1,
      input: null,
      output: null,
      error: null,
      startedAt: "2024-01-01T10:00:00Z",
      finishedAt: "2024-01-01T10:00:00.100Z",
      durationMs: 100,
    },
    {
      nodeId: "n2",
      nodeType: "log",
      label: "Log Message",
      status: "success",
      attempts: 1,
      input: null,
      output: null,
      error: null,
      startedAt: "2024-01-01T10:00:00.100Z",
      finishedAt: "2024-01-01T10:00:00.300Z",
      durationMs: 200,
    },
  ],
  logs: [
    { id: "l1", level: "info", message: "Workflow execution started", nodeId: null, nodeType: null, metadata: null, createdAt: "2024-01-01T10:00:00Z" },
    { id: "l2", level: "info", message: "Workflow execution completed", nodeId: null, nodeType: null, metadata: null, createdAt: "2024-01-01T10:00:01Z" },
  ],
};

vi.mock("../../lib/api", () => {
  const historyItems: ExecutionListItem[] = [
    {
      id: "exec_9",
      workflowId: "wf_1",
      workflow: { id: "wf_1", name: "Test Flow", status: "enabled" },
      triggerType: "manual",
      status: "failed",
      triggerData: null,
      error: { message: "boom" },
      startedAt: "2024-01-01T09:00:00Z",
      finishedAt: "2024-01-01T09:00:00.500Z",
      createdAt: "2024-01-01T09:00:00Z",
      durationMs: 500,
      nodeCount: 2,
    },
  ];
  return {
    api: {
      executions: {
        list: vi.fn().mockResolvedValue({ total: 1, executions: historyItems }),
      },
    },
  };
});

import { api } from "../../lib/api";

function Panel({ execution: ex }: { execution: ExecutionDetail }) {
  const [view, setView] = useState<"timeline" | "logs" | "history">("timeline");
  return (
    <ExecutionPanel
      execution={ex}
      view={view}
      setView={setView}
      onClose={vi.fn()}
      onRerun={vi.fn()}
      workflowId="wf_1"
      onSelectExecution={vi.fn()}
    />
  );
}

describe("ExecutionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the execution summary and node timeline", () => {
    render(<Panel execution={execution} />);
    expect(screen.getByText(/exec_1/)).toBeInTheDocument();
    expect(screen.getByText("Manual Trigger")).toBeInTheDocument();
    expect(screen.getByText("Log Message")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("switches to the logs view", () => {
    render(<Panel execution={execution} />);
    fireEvent.click(screen.getByRole("button", { name: /logs/i }));
    expect(screen.getByText("Workflow execution started")).toBeInTheDocument();
    expect(screen.getByText("Workflow execution completed")).toBeInTheDocument();
  });

  it("loads and renders run history for the workflow", async () => {
    render(<Panel execution={execution} />);
    fireEvent.click(screen.getByRole("button", { name: /history/i }));

    expect(api.executions.list).toHaveBeenCalledWith({ workflowId: "wf_1", limit: 25 });
    expect(await screen.findByText("exec_9")).toBeInTheDocument();
  });

  it("shows an empty state when there are no logs", () => {
    render(<Panel execution={{ ...execution, nodes: [], logs: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: /logs/i }));
    expect(screen.getByText("No logs yet")).toBeInTheDocument();
  });
});
