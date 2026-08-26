import { describe, it, expect, vi, beforeEach } from "vitest";

const { addMock, workerProcessors, engineRunMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  workerProcessors: {} as Record<string, (job: any) => Promise<unknown>>,
  engineRunMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("ioredis", () => {
  class Redis {
    on() {}
    quit() {
      return Promise.resolve("OK");
    }
    ping() {
      return Promise.resolve("PONG");
    }
  }
  return { default: Redis };
});

vi.mock("bullmq", () => {
  class Queue {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add = (name: string, data: unknown, opts?: unknown) => {
      addMock(this.name, name, data, opts);
      return Promise.resolve({ id: "job-1" });
    };
    removeRepeatable = vi.fn();
    removeRepeatableByKey = vi.fn();
    getRepeatableJobs = () => Promise.resolve([]);
  }
  class Worker {
    constructor(name: string, processor: (job: any) => Promise<unknown>, _opts?: unknown) {
      workerProcessors[name] = processor;
    }
    on() {}
    close() {
      return Promise.resolve();
    }
  }
  return { Queue, Worker };
});

vi.mock("../src/engine/instance", () => ({
  getEngine: () => ({ run: engineRunMock }),
}));

import { enqueueExecution } from "../src/queues/execution.queue";
import { enqueueContinuation } from "../src/queues/continuation.queue";
import { registerExecutionWorker } from "../src/workers/execution.worker";
import { registerContinuationWorker } from "../src/workers/continuation.worker";

beforeEach(() => {
  addMock.mockClear();
  engineRunMock.mockClear();
});

describe("queue wiring", () => {
  it("enqueues workflow executions onto the workflow-execution queue", async () => {
    await enqueueExecution("exec_abc123");
    expect(addMock).toHaveBeenCalledWith(
      "workflow-execution",
      "execute",
      { executionId: "exec_abc123" },
      expect.objectContaining({ jobId: "execute-exec_abc123" })
    );
  });

  it("enqueues continuation jobs with a delay for retries and delays", async () => {
    await enqueueContinuation({ executionId: "exec_abc123", nodeId: "n1", kind: "retry" }, 500);
    const call = addMock.mock.calls.find(([queue]) => queue === "node-continuation");
    expect(call).toBeDefined();
    expect(call[1]).toBe("retry");
    expect(call[2]).toMatchObject({ executionId: "exec_abc123", nodeId: "n1", kind: "retry" });
    expect(call[3]).toMatchObject({ delay: 500 });
  });

  it("the execution worker drives the engine for execute jobs", async () => {
    registerExecutionWorker();
    const processor = workerProcessors["workflow-execution"];
    expect(processor).toBeDefined();

    await processor({ id: "job-1", name: "execute", data: { executionId: "exec_xyz" } });

    expect(engineRunMock).toHaveBeenCalledWith("exec_xyz");
  });

  it("the continuation worker resumes the engine at the right node", async () => {
    registerContinuationWorker();
    const processor = workerProcessors["node-continuation"];
    expect(processor).toBeDefined();

    await processor({ id: "job-2", name: "retry", data: { executionId: "exec_xyz", nodeId: "n7", kind: "retry" } });

    expect(engineRunMock).toHaveBeenCalledWith("exec_xyz", "n7");
  });
});
