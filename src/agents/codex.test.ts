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
