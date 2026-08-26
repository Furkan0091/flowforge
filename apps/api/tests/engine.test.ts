import { describe, it, expect, beforeAll } from "vitest";
import { registerBuiltinNodes, registerTestNodes } from "../src/nodes/registry";
import { createHarness, node, edge } from "./helpers/inMemoryRepository";

beforeAll(() => {
  registerBuiltinNodes();
  registerTestNodes();
});

describe("WorkflowEngine", () => {
  it("executes a simple linear workflow and persists logs", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual", { description: "test" }),
        node("set", "set_variable", "Set Name", { variable: "name", value: "{{manual.name}}" }),
        node("log", "log", "Log", { message: "Hello {{variables.name}}", level: "info" }),
      ],
      edges: [edge("start", "set"), edge("set", "log")],
    }, { manual: { name: "Ada" } });

    await run();

    expect(repo.execution.status).toBe("completed");
    expect(repo.execution.finishedAt).not.toBeNull();
    expect(repo.nodeStates.get("start")!.status).toBe("success");
    expect(repo.nodeStates.get("set")!.status).toBe("success");
    expect(repo.nodeStates.get("set")!.output).toMatchObject({ variable: "name", value: "Ada" });
    expect(repo.nodeStates.get("log")!.status).toBe("success");
    expect(repo.logs.some((l) => l.message.includes("Hello Ada"))).toBe(true);
    expect(repo.logs.length).toBeGreaterThan(3);
  });

  it("resolves node outputs by type and label aliases", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("tx", "transform", "Build", { mode: "mapping", output: { email: "{{manual.email}}" } }),
        node("log", "log", "Log", { message: "Got {{tx.data.email}} / {{build.data.email}}" }),
      ],
      edges: [edge("start", "tx"), edge("tx", "log")],
    }, { manual: { email: "john@example.com" } });

    await run();

    expect(repo.nodeStates.get("tx")!.output).toMatchObject({ data: { email: "john@example.com" } });
    const logNode = repo.logs.find((l) => l.message.includes("Got "));
    expect(logNode?.message).toContain("Got john@example.com / john@example.com");
  });

  it("routes the condition TRUE branch and skips the FALSE branch", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("cond", "condition", "Check", { variable: "manual.email", operator: "contains", value: "@gmail.com" }),
        node("yes", "log", "Accept", { message: "accepted", level: "info" }),
        node("no", "log", "Reject", { message: "rejected", level: "warn" }),
      ],
      edges: [edge("start", "cond"), edge("cond", "yes", "true"), edge("cond", "no", "false")],
    }, { manual: { email: "john@gmail.com" } });

    await run();

    expect(repo.execution.status).toBe("completed");
    expect(repo.nodeStates.get("cond")!.output).toMatchObject({ result: true });
    expect(repo.nodeStates.get("yes")!.status).toBe("success");
    expect(repo.nodeStates.get("no")!.status).toBe("skipped");
  });

  it("routes a switch node to the matching case branch", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("sw", "switch", "Route", {
          variable: "manual.company",
          cases: [
            { id: "case_google", label: "Google", value: "Google" },
            { id: "case_acme", label: "Acme", value: "Acme" },
          ],
        }),
        node("google", "log", "Google Branch", { message: "google path" }),
        node("acme", "log", "Acme Branch", { message: "acme path" }),
        node("other", "log", "Default", { message: "default path" }),
      ],
      edges: [
        edge("start", "sw"),
        edge("sw", "google", "case_google"),
        edge("sw", "acme", "case_acme"),
        edge("sw", "other", "default"),
      ],
    }, { manual: { company: "Acme" } });

    await run();

    expect(repo.execution.status).toBe("completed");
    expect(repo.nodeStates.get("sw")!.output).toMatchObject({ matched: "case_acme" });
    expect(repo.nodeStates.get("acme")!.status).toBe("success");
    expect(repo.nodeStates.get("google")!.status).toBe("skipped");
    expect(repo.nodeStates.get("other")!.status).toBe("skipped");
  });

  it("routes a switch node to the default branch when no case matches", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("sw", "switch", "Route", {
          variable: "manual.company",
          cases: [{ id: "case_acme", label: "Acme", value: "Acme" }],
        }),
        node("acme", "log", "Acme Branch", { message: "acme path" }),
        node("other", "log", "Default", { message: "default path" }),
      ],
      edges: [edge("start", "sw"), edge("sw", "acme", "case_acme"), edge("sw", "other", "default")],
    }, { manual: { company: "Unknown Corp" } });

    await run();

    expect(repo.execution.status).toBe("completed");
    expect(repo.nodeStates.get("sw")!.output).toMatchObject({ matched: "default" });
    expect(repo.nodeStates.get("other")!.status).toBe("success");
    expect(repo.nodeStates.get("acme")!.status).toBe("skipped");
  });

  it("executes independent branches in parallel and joins downstream", async () => {
    const { repo, run, resumeAll, continuations } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("a", "test_flaky", "Branch A", { failures: 1, key: "a", retries: 2, retryDelayMs: 5 }),
        node("b", "test_flaky", "Branch B", { failures: 1, key: "b", retries: 2, retryDelayMs: 5 }),
        node("done", "log", "Done", { message: "both branches finished" }),
      ],
      edges: [edge("start", "a"), edge("start", "b"), edge("a", "done"), edge("b", "done")],
    });

    await run();

    // Both branches failed on the first attempt → two retry continuations in flight.
    expect(repo.execution.status).toBe("retrying");
    expect(continuations.length).toBe(2);

    await resumeAll();

    expect(repo.execution.status).toBe("completed");
    expect(repo.nodeStates.get("a")!.status).toBe("success");
    expect(repo.nodeStates.get("b")!.status).toBe("success");
    expect(repo.nodeStates.get("done")!.status).toBe("success");
    expect(repo.nodeStates.get("done")!.output).toMatchObject({ message: "both branches finished" });
  });

  it("runs both branches concurrently even when one fails permanently", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("good", "log", "Good", { message: "ok" }),
        node("bad", "test_fail", "Bad", { retries: 0, message: "boom", retryable: false }),
      ],
      edges: [edge("start", "good"), edge("start", "bad")],
    });

    await run();

    expect(repo.nodeStates.get("good")!.status).toBe("success");
    expect(repo.nodeStates.get("bad")!.status).toBe("failed");
    expect(repo.execution.status).toBe("failed");
  });

  it("routes the condition FALSE branch and skips the TRUE branch", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("cond", "condition", "Check", { variable: "manual.email", operator: "contains", value: "@gmail.com" }),
        node("yes", "log", "Accept", { message: "accepted" }),
        node("no", "log", "Reject", { message: "rejected" }),
      ],
      edges: [edge("start", "cond"), edge("cond", "yes", "true"), edge("cond", "no", "false")],
    }, { manual: { email: "john@outlook.com" } });

    await run();

    expect(repo.nodeStates.get("cond")!.output).toMatchObject({ result: false });
    expect(repo.nodeStates.get("yes")!.status).toBe("skipped");
    expect(repo.nodeStates.get("no")!.status).toBe("success");
  });

  it("marks the execution failed when a node fails permanently and skips downstream nodes", async () => {
    const { repo, run } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("fail", "test_fail", "Boom", { retries: 0, message: "permanent failure", retryable: true }),
        node("after", "log", "After", { message: "never runs" }),
      ],
      edges: [edge("start", "fail"), edge("fail", "after")],
    });

    await run();

    expect(repo.execution.status).toBe("failed");
    expect(repo.nodeStates.get("fail")!.status).toBe("failed");
    expect(repo.nodeStates.get("fail")!.attempts).toBe(1);
    expect(repo.nodeStates.get("fail")!.error).toMatchObject({ message: "permanent failure" });
    expect(repo.nodeStates.get("after")!.status).toBe("skipped");
    expect(repo.execution.error).toBeTruthy();
  });

  it("does not retry failures marked non-retryable even when retries are configured", async () => {
    const { repo, run, continuations } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("fail", "test_fail", "Boom", { retries: 3, message: "not transient", retryable: false }),
      ],
      edges: [edge("start", "fail")],
    });

    await run();

    expect(repo.execution.status).toBe("failed");
    expect(continuations.length).toBe(0);
    expect(repo.nodeStates.get("fail")!.attempts).toBe(1);
  });

  it("retries a failing node with backoff and resumes to completion", async () => {
    const { repo, run, resumeAll, continuations } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("flaky", "test_flaky", "Flaky", { failures: 2, key: "x", retries: 3, retryDelayMs: 100 }),
        node("done", "log", "Done", { message: "finished" }),
      ],
      edges: [edge("start", "flaky"), edge("flaky", "done")],
    });

    await run();

    // First failure: execution goes into retrying and a continuation job is scheduled.
    expect(repo.execution.status).toBe("retrying");
    expect(continuations.length).toBe(1);
    expect(continuations[0].kind).toBe("retry");
    expect(continuations[0].delay).toBe(100); // 100 * 2^0

    await resumeAll();

    expect(repo.execution.status).toBe("completed");
    expect(repo.nodeStates.get("flaky")!.status).toBe("success");
    expect(repo.nodeStates.get("flaky")!.attempts).toBe(2); // failed twice before succeeding
    expect(repo.nodeStates.get("done")!.status).toBe("success");
  });

  it("gives up after the configured retry limit", async () => {
    const { repo, run, resumeAll } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("flaky", "test_flaky", "Flaky", { failures: 10, key: "y", retries: 1, retryDelayMs: 10 }),
      ],
      edges: [edge("start", "flaky")],
    });

    await run();
    await resumeAll();

    expect(repo.execution.status).toBe("failed");
    expect(repo.nodeStates.get("flaky")!.status).toBe("failed");
    expect(repo.nodeStates.get("flaky")!.attempts).toBe(2); // initial + 1 retry
  });

  it("implements delay nodes as delayed continuation jobs instead of blocking", async () => {
    const { repo, run, resumeAll, continuations } = createHarness({
      nodes: [
        node("start", "manual", "Manual"),
        node("wait", "delay", "Wait", { durationMs: 500 }),
        node("done", "log", "Done", { message: "after delay" }),
      ],
      edges: [edge("start", "wait"), edge("wait", "done")],
    });

    await run();

    // The run pauses at the delay node and schedules a delayed continuation.
    expect(repo.execution.status).toBe("running");
    expect(continuations.length).toBe(1);
    expect(continuations[0].kind).toBe("delay");
    expect(continuations[0].delay).toBe(500);
    expect(repo.nodeStates.get("done")).toBeUndefined();

    await resumeAll();

    expect(repo.execution.status).toBe("completed");
    expect(repo.nodeStates.get("wait")!.status).toBe("success");
    expect(repo.nodeStates.get("done")!.status).toBe("success");
  });

  it("fails fast on unknown node types", async () => {
    const { repo, run } = createHarness({
      nodes: [node("start", "manual", "Manual"), node("weird", "does_not_exist", "Weird")],
      edges: [edge("start", "weird")],
    });

    await run();

    expect(repo.execution.status).toBe("failed");
    expect(repo.execution.error).toMatchObject({ code: "UNKNOWN_NODE_TYPE" });
  });

  it("fails when the workflow has no entry point (cyclic graph, no trigger node)", async () => {
    const { repo, run } = createHarness({
      nodes: [node("a", "log", "A", {}), node("b", "log", "B", {})],
      edges: [edge("a", "b"), edge("b", "a")],
    });

    await run();

    expect(repo.execution.status).toBe("failed");
    expect(repo.execution.error).toMatchObject({ code: "WORKFLOW_NO_ENTRY" });
  });
});
