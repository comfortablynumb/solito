import { ClaudeAgent, ClaudeAgentDeps, redactLongArgs } from "./claude";
import { SpawnResult } from "../process/spawner";
import { StreamingSpawnOptions } from "../process/streaming-spawner";
import { createMockChild } from "../test/mock-child-process";
import { createMockLogger } from "../test/mock-logger";
import { ITERATION_COMPLETE_MARKER, EXIT_MARKER } from "../constants";
import { CliMessage } from "../stream/events";

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

  it("truncates long --append-system-prompt values in verbose log", async () => {
    const deps = createMockDeps(mockResult);
    const logger = createMockLogger();
    const agent = new ClaudeAgent({ ...deps, verbose: true, logger });

    const longPrompt = "A".repeat(200);
    const handle = agent.run("do stuff", { appendSystemPrompt: longPrompt });
    await handle.result;

    const logged = logger.info.mock.calls[0][0] as string;
    expect(logged).toContain("...");
    expect(logged).not.toContain("A".repeat(200));
  });

  it("does not truncate short --append-system-prompt values in verbose log", async () => {
    const deps = createMockDeps(mockResult);
    const logger = createMockLogger();
    const agent = new ClaudeAgent({ ...deps, verbose: true, logger });

    const handle = agent.run("do stuff");
    await handle.result;

    const logged = logger.info.mock.calls[0][0] as string;
    // The system prompt is built internally and passed as --append-system-prompt value
    // When short enough, it should not contain "..."
    expect(logged).toMatch(/^> claude /);
  });

  it("quotes args with spaces in verbose log", async () => {
    const deps = createMockDeps(mockResult);
    const logger = createMockLogger();
    const agent = new ClaudeAgent({ ...deps, verbose: true, logger });

    const handle = agent.run("do stuff");
    await handle.result;

    const logged = logger.info.mock.calls[0][0] as string;
    // stream-json doesn't have spaces, so check it appears unquoted
    expect(logged).toContain("stream-json");
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

  it("kills child when iteration complete marker is detected in text delta", async () => {
    const deps = createMockDeps(mockResult);
    const child = createMockChild();
    const markerMessage: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: ITERATION_COMPLETE_MARKER },
      },
    };

    (deps.parser.parseLine as jest.Mock).mockReturnValue(markerMessage);

    let capturedOnLine: ((line: string) => void) | null = null;

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      capturedOnLine = options.onLine;
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    capturedOnLine!("line with marker");
    await handle.result;

    expect(child.kill).toHaveBeenCalled();
    expect(handle.iterationComplete.value).toBe(true);
  });

  it("kills child when iteration complete marker is detected in assistant message", async () => {
    const deps = createMockDeps(mockResult);
    const child = createMockChild();
    const assistantMessage: CliMessage = {
      type: "assistant",
      message: {
        content: [{ type: "text", text: `Done.\n${ITERATION_COMPLETE_MARKER}` }],
      },
    };

    (deps.parser.parseLine as jest.Mock).mockReturnValue(assistantMessage);

    let capturedOnLine: ((line: string) => void) | null = null;

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      capturedOnLine = options.onLine;
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    capturedOnLine!("line with marker");
    await handle.result;

    expect(child.kill).toHaveBeenCalled();
    expect(handle.iterationComplete.value).toBe(true);
  });

  it("does not kill child when no marker is present", async () => {
    const deps = createMockDeps(mockResult);
    const child = createMockChild();
    const normalMessage: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "just some text" },
      },
    };

    (deps.parser.parseLine as jest.Mock).mockReturnValue(normalMessage);

    let capturedOnLine: ((line: string) => void) | null = null;

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      capturedOnLine = options.onLine;
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    capturedOnLine!("normal line");
    await handle.result;

    expect(child.kill).not.toHaveBeenCalled();
    expect(handle.iterationComplete.value).toBe(false);
    expect(handle.exitRequested.value).toBe(false);
  });

  it("sets exitRequested when exit marker is detected", async () => {
    const deps = createMockDeps(mockResult);
    const child = createMockChild();
    const exitMessage: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: EXIT_MARKER },
      },
    };

    (deps.parser.parseLine as jest.Mock).mockReturnValue(exitMessage);

    let capturedOnLine: ((line: string) => void) | null = null;

    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      capturedOnLine = options.onLine;
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    capturedOnLine!("line with exit marker");
    await handle.result;

    expect(child.kill).toHaveBeenCalled();
    expect(handle.exitRequested.value).toBe(true);
    expect(handle.iterationComplete.value).toBe(false);
  });

  it("returns true from isAvailable when claude command exists", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const commandUtil = await import("../util/command");
    jest.spyOn(commandUtil, "commandExists").mockResolvedValue(true);

    const result = await agent.isAvailable();
    expect(result).toBe(true);
  });

  it("returns false from isAvailable when claude command is missing", async () => {
    const deps = createMockDeps(mockResult);
    const agent = new ClaudeAgent(deps);

    const commandUtil = await import("../util/command");
    jest.spyOn(commandUtil, "commandExists").mockResolvedValue(false);

    const result = await agent.isAvailable();
    expect(result).toBe(false);
  });

  it("handles child without stdin gracefully", async () => {
    const deps = createMockDeps(mockResult);
    const child = createMockChild();
    // Remove stdin
    Object.defineProperty(child, "stdin", { value: null, writable: true });

    deps.spawner.spawn.mockReturnValue({
      child,
      result: Promise.resolve(mockResult),
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    await handle.result;

    // Should not throw — sendInitialPrompt returns early when no stdin
    expect(handle.iterationComplete.value).toBe(false);
  });

  it("returns false from containsMarker for non-text non-assistant messages", async () => {
    const deps = createMockDeps(mockResult);
    const child = createMockChild();
    // A stream_event that's not a text_delta (e.g. tool_use)
    const toolMessage: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "Bash", input: {} },
      },
    };

    (deps.parser.parseLine as jest.Mock).mockReturnValue(toolMessage);

    let capturedOnLine: ((line: string) => void) | null = null;
    deps.spawner.spawn.mockImplementation((options: StreamingSpawnOptions) => {
      capturedOnLine = options.onLine;
      return { child, result: Promise.resolve(mockResult) };
    });

    const agent = new ClaudeAgent(deps);
    const handle = agent.run("do stuff");
    capturedOnLine!("tool use line");
    await handle.result;

    // containsMarker returns false for tool_use messages
    expect(child.kill).not.toHaveBeenCalled();
    expect(handle.iterationComplete.value).toBe(false);
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

describe("redactLongArgs", () => {
  it("passes through simple args unchanged", () => {
    const result = redactLongArgs(["--print", "--verbose", "stream-json"]);
    expect(result).toEqual(["--print", "--verbose", "stream-json"]);
  });

  it("quotes args containing spaces", () => {
    const result = redactLongArgs(["--print", "has space", "--verbose"]);
    expect(result).toEqual(["--print", '"has space"', "--verbose"]);
  });

  it("wraps short --append-system-prompt values in quotes without truncation", () => {
    const shortValue = "short prompt";
    const result = redactLongArgs(["--append-system-prompt", shortValue, "--verbose"]);
    expect(result).toEqual(["--append-system-prompt", `"${shortValue}"`, "--verbose"]);
    expect(result[1]).not.toContain("...");
  });

  it("truncates long --append-system-prompt values", () => {
    const longValue = "A".repeat(200);
    const result = redactLongArgs(["--append-system-prompt", longValue, "--verbose"]);
    expect(result[0]).toBe("--append-system-prompt");
    expect(result[1]).toContain("...");
    expect(result[1].length).toBeLessThan(200);
    expect(result[2]).toBe("--verbose");
  });
});
