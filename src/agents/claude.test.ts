import { ClaudeAgent, ClaudeAgentDeps } from "./claude";
import { SpawnResult } from "../process/spawner";
import { StreamingSpawnOptions } from "../process/streaming-spawner";
import { createMockChild } from "../test/mock-child-process";
import { createMockLogger } from "../test/mock-logger";

function createMockDeps(result: SpawnResult): ClaudeAgentDeps & {
  spawner: { spawn: jest.Mock };
  formatter: { format: jest.Mock };
} {
  const child = createMockChild();

  return {
    spawner: {
      spawn: jest.fn().mockReturnValue({
        child,
        result: Promise.resolve(result),
      }),
    },
    parser: {
      parseLine: jest.fn().mockReturnValue(null),
    },
    formatter: {
      format: jest.fn(),
    },
  };
}

describe("ClaudeAgent", () => {
  const mockResult: SpawnResult = { exitCode: 0, stdout: "", stderr: "" };

  it("has correct name", () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);
    expect(agent.name).toBe("claude");
  });

  it("spawns claude with stream-json, verbose, and include-partial-messages", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const handle = agent.run("fix the bug");
    await handle.result;

    const call = deps.spawner.spawn.mock.calls[0][0] as StreamingSpawnOptions;
    expect(call.command).toBe("claude");
    expect(call.args).not.toContain("-p");
    expect(call.args).toContain("--print");
    expect(call.args).toContain("--output-format");
    expect(call.args).toContain("--input-format");
    expect(call.args).toContain("stream-json");
    expect(call.args).toContain("--verbose");
    expect(call.args).toContain("--include-partial-messages");
    expect(call.args).toContain("--append-system-prompt");
    expect(call.stdinMode).toBe("pipe");
  });

  it("sends initial prompt via stdin as stream-json message", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const handle = agent.run("fix the bug");
    await handle.result;

    const child = deps.spawner.spawn.mock.results[0].value.child;
    const writeFn = child.stdin.write as jest.Mock;
    const written = writeFn.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe("user");
    expect(parsed.message).toEqual({ role: "user", content: "fix the bug" });
  });

  it("builds system prompt with loop max minutes from options", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const handle = agent.run("do stuff", { loopMaxMinutes: 10 });
    await handle.result;

    const call = deps.spawner.spawn.mock.calls[0][0] as StreamingSpawnOptions;
    const idx = call.args.indexOf("--append-system-prompt");
    const systemPrompt = call.args[idx + 1];
    expect(systemPrompt).toContain("10 minutes");
    expect(systemPrompt).toContain("do stuff");
  });

  it("includes user append_system_prompt in system prompt", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const handle = agent.run("do stuff", { appendSystemPrompt: "Be concise" });
    await handle.result;

    const call = deps.spawner.spawn.mock.calls[0][0] as StreamingSpawnOptions;
    const idx = call.args.indexOf("--append-system-prompt");
    const systemPrompt = call.args[idx + 1];
    expect(systemPrompt).toContain("Be concise");
    expect(systemPrompt).toContain("autonomous agent");
  });

  it("defaults loop max minutes to 10 when not specified", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const handle = agent.run("do stuff");
    await handle.result;

    const call = deps.spawner.spawn.mock.calls[0][0] as StreamingSpawnOptions;
    const idx = call.args.indexOf("--append-system-prompt");
    const systemPrompt = call.args[idx + 1];
    expect(systemPrompt).toContain("10 minutes");
  });

  it("includes progress file path in system prompt", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const handle = agent.run("do stuff", {
      progressFilePath: "/tmp/progress.md",
    });
    await handle.result;

    const call = deps.spawner.spawn.mock.calls[0][0] as StreamingSpawnOptions;
    const idx = call.args.indexOf("--append-system-prompt");
    const systemPrompt = call.args[idx + 1];
    expect(systemPrompt).toContain("/tmp/progress.md");
    expect(systemPrompt).toContain("progress summary");
  });

  it("appends passthrough args to command", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const handle = agent.run("do stuff", { passthrough: ["--max-turns", "5"] });
    await handle.result;

    const call = deps.spawner.spawn.mock.calls[0][0] as StreamingSpawnOptions;
    expect(call.args).toContain("--max-turns");
    expect(call.args).toContain("5");
  });

  it("parses and formats each stdout line", async () => {
    const mockMessage = { type: "stream_event", event: { type: "ping" } };
    const deps = createMockDeps(mockResult);
    (deps.parser.parseLine as jest.Mock).mockReturnValue(mockMessage);
    const child = createMockChild();

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      options.onLine('{"type":"stream_event","event":{"type":"ping"}}');
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    await handle.result;

    expect(deps.parser.parseLine).toHaveBeenCalledWith(
      '{"type":"stream_event","event":{"type":"ping"}}'
    );
    expect(deps.formatter.format).toHaveBeenCalledWith(mockMessage);
  });

  it("skips null parse results", async () => {
    const deps = createMockDeps(mockResult);
    (deps.parser.parseLine as jest.Mock).mockReturnValue(null);
    const child = createMockChild();

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      options.onLine("invalid json");
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    await handle.result;

    expect(deps.formatter.format).not.toHaveBeenCalled();
  });

  it("logs command when verbose", async () => {
    const deps = createMockDeps(mockResult);
    const logger = createMockLogger();
    const agent = new ClaudeAgent({ ...deps, verbose: true, logger });

    const handle = agent.run("do stuff");
    await handle.result;

    const logged = logger.info.mock.calls[0][0] as string;
    expect(logged).toMatch(/^> claude /);
    expect(logged).toContain("--output-format");
    expect(logged).toContain("--input-format");
  });

  it("logs raw event lines when verbose", async () => {
    const deps = createMockDeps(mockResult);
    const logger = createMockLogger();
    const child = createMockChild();
    const rawLine = '{"type":"stream_event","event":{"type":"ping"}}';

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      options.onLine(rawLine);
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent({ ...deps, verbose: true, logger });
    const handle = agent.run("do stuff");
    await handle.result;

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]);
    expect(allLogs).toContain(rawLine);
  });

  it("does not log command or raw lines when not verbose", async () => {
    const deps = createMockDeps(mockResult);
    const logger = createMockLogger();
    const child = createMockChild();

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      options.onLine('{"type":"ping"}');
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent({ ...deps, verbose: false, logger });
    const handle = agent.run("do stuff");
    await handle.result;

    expect(logger.info).not.toHaveBeenCalled();
  });
});
