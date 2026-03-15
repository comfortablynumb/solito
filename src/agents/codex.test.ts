import { CodexAgent } from "./codex";
import { ProcessSpawner, SpawnResult } from "../process/spawner";
import { createMockChild } from "../test/mock-child-process";

function createMockSpawner(result: SpawnResult): ProcessSpawner {
  const child = createMockChild();

  return {
    spawn: jest.fn().mockReturnValue({ child, result: Promise.resolve(result) }),
  };
}

describe("CodexAgent", () => {
  const mockResult: SpawnResult = { exitCode: 0, stdout: "done", stderr: "" };

  it("has correct name", () => {
    const spawner = createMockSpawner(mockResult);
    const agent = new CodexAgent(spawner);
    expect(agent.name).toBe("codex");
  });

  it("runs codex with --prompt flag and the prompt", async () => {
    const spawner = createMockSpawner(mockResult);
    const agent = new CodexAgent(spawner);

    const handle = agent.run("add tests");
    const result = await handle.result;

    expect(spawner.spawn).toHaveBeenCalledWith("codex", ["--prompt", "add tests"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("done");
  });

  it("returns iterationComplete and exitRequested as false", () => {
    const spawner = createMockSpawner(mockResult);
    const agent = new CodexAgent(spawner);

    const handle = agent.run("add tests");

    expect(handle.iterationComplete.value).toBe(false);
    expect(handle.exitRequested.value).toBe(false);
  });

  it("does not append passthrough when not provided", async () => {
    const spawner = createMockSpawner(mockResult);
    const agent = new CodexAgent(spawner);

    agent.run("add tests", {});
    await Promise.resolve();

    expect(spawner.spawn).toHaveBeenCalledWith("codex", ["--prompt", "add tests"]);
  });

  it("does not append passthrough when empty array", async () => {
    const spawner = createMockSpawner(mockResult);
    const agent = new CodexAgent(spawner);

    agent.run("add tests", { passthrough: [] });
    await Promise.resolve();

    expect(spawner.spawn).toHaveBeenCalledWith("codex", ["--prompt", "add tests"]);
  });

  it("isAvailable delegates to commandExists", async () => {
    const spawner = createMockSpawner(mockResult);
    const agent = new CodexAgent(spawner);

    // commandExists uses real execFile - it will return false since codex is not installed
    const result = await agent.isAvailable();

    expect(typeof result).toBe("boolean");
  });

  it("appends passthrough args after prompt", async () => {
    const spawner = createMockSpawner(mockResult);
    const agent = new CodexAgent(spawner);

    const handle = agent.run("add tests", { passthrough: ["--model", "o3"] });
    await handle.result;

    expect(spawner.spawn).toHaveBeenCalledWith("codex", [
      "--prompt", "add tests", "--model", "o3",
    ]);
  });
});
