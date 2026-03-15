import { executeRunCommand } from "./run-command";
import { Agent, AgentResult } from "../agents/agent";
import { createMockChild } from "../test/mock-child-process";
import { createMockAgent, createSequenceMockAgent } from "../test/mock-agent";
import { createMockLogger } from "../test/mock-logger";
import { createMockFileSystem } from "../test/mock-filesystem";
import { ICONS } from "../constants";

describe("executeRunCommand", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("runs agent with user prompt on first iteration", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const agent = createMockAgent(result);

    await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 1 });

    expect(agent.run).toHaveBeenCalledWith("do stuff", expect.objectContaining({
      appendSystemPrompt: undefined,
      loopMaxMinutes: undefined,
      passthrough: undefined,
    }));
  });

  it("returns 1 when agent is not available", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "", stderr: "" };
    const agent = createMockAgent(result, false);

    const code = await executeRunCommand({ agent, prompt: "do stuff" });

    expect(code).toBe(1);
    expect(agent.run).not.toHaveBeenCalled();
  });

  it("passes append_system_prompt from agent config", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const agent = createMockAgent(result);
    const agentConfig = {
      type: "claude",
      append_system_prompt: "Be concise",
    };

    await executeRunCommand({ agent, prompt: "do stuff", agentConfig, maxIterations: 1 });

    expect(agent.run).toHaveBeenCalledWith("do stuff", expect.objectContaining({
      appendSystemPrompt: "Be concise",
    }));
  });

  it("passes loopMaxMinutes from loop config", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const agent = createMockAgent(result);
    const loopConfig = { max_turn_time_minutes: 10 };

    await executeRunCommand({ agent, prompt: "do stuff", loopConfig, maxIterations: 1 });

    expect(agent.run).toHaveBeenCalledWith("do stuff", expect.objectContaining({
      loopMaxMinutes: 10,
    }));
  });

  it("exits immediately on first-run failure", async () => {
    const fail: AgentResult = { exitCode: 42, stdout: "", stderr: "something broke" };
    const agent = createMockAgent(fail);
    const fs = createMockFileSystem();

    const code = await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 2, fs });

    expect(agent.run).toHaveBeenCalledTimes(1);
    expect(code).toBe(42);
  });

  it("continues looping on non-first-run failure", async () => {
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const fail: AgentResult = { exitCode: 1, stdout: "", stderr: "" };
    const agent = createSequenceMockAgent([ok, fail, ok]);
    const fs = createMockFileSystem();

    const code = await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 3, fs });

    expect(agent.run).toHaveBeenCalledTimes(3);
    expect(code).toBe(0);
  });

  it("logs non-zero exit code and stderr from agent", async () => {
    const fail: AgentResult = { exitCode: 42, stdout: "", stderr: "auth token expired" };
    const agent = createMockAgent(fail);
    const logger = createMockLogger();

    await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 1, logger });

    const allErrors = logger.error.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allErrors).toContain("exited with code 42");
    expect(allErrors).toContain("auth token expired");
  });

  it("passes passthrough args to agent", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const agent = createMockAgent(result);

    await executeRunCommand({
      agent,
      prompt: "do stuff",
      passthrough: ["--max-turns", "5"],
      maxIterations: 1,
    });

    expect(agent.run).toHaveBeenCalledWith("do stuff", expect.objectContaining({
      passthrough: ["--max-turns", "5"],
    }));
  });

  it("passes progressFilePath to agent options", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "", stderr: "" };
    const agent = createMockAgent(result);

    await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 1 });

    expect(agent.run).toHaveBeenCalledWith("do stuff", expect.objectContaining({
      progressFilePath: expect.stringContaining("loop-progress"),
    }));
  });

  it("stops at maxIterations", async () => {
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const agent = createSequenceMockAgent([ok, ok, ok]);
    const fs = createMockFileSystem();

    await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 2, fs });

    expect(agent.run).toHaveBeenCalledTimes(2);
  });

  it("runs wrap-up turn with timeout prompt when time limit is reached", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const killed: AgentResult = { exitCode: 130, stdout: "", stderr: "" };
    let resolveFirstTurn!: (r: AgentResult) => void;
    const fs = createMockFileSystem();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // 10 min TTL: kill at 10min
    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 10 },
      fs,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Advance to final timeout (10 min) — agent gets killed
    jest.advanceTimersByTime(10 * 60 * 1000);
    resolveFirstTurn(killed);

    const code = await promise;
    jest.useRealTimers();

    expect(code).toBe(0);
    expect(agent.run).toHaveBeenCalledTimes(2);
    expect((agent.run as jest.Mock).mock.calls[1][0]).toContain("time limit");
  });

  it("continues looping after wrap-up turn completes", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const killed: AgentResult = { exitCode: 130, stdout: "", stderr: "" };
    let resolveFirstTurn!: (r: AgentResult) => void;
    const fs = createMockFileSystem();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // 10 min TTL: kill at 10min
    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 10 },
      fs,
      maxIterations: 3,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Advance to final timeout (10 min) — agent gets killed
    jest.advanceTimersByTime(10 * 60 * 1000);
    resolveFirstTurn(killed);

    const code = await promise;
    jest.useRealTimers();

    expect(code).toBe(0);
    expect(agent.run).toHaveBeenCalledTimes(3);
    // First call: original prompt
    // Second call: timeout wrap-up
    expect((agent.run as jest.Mock).mock.calls[1][0]).toContain("time limit");
    // Third call: continuation after wrap-up
    expect((agent.run as jest.Mock).mock.calls[2][0]).toContain("Continue where you left off");
  });

  it("uses custom timeout_prompt from loop config", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const killed: AgentResult = { exitCode: 130, stdout: "", stderr: "" };
    let resolveFirstTurn!: (r: AgentResult) => void;
    const fs = createMockFileSystem();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // 10 min TTL: kill at 10min
    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: {
        max_turn_time_minutes: 10,
        timeout_prompt: "Wrap it up now!",
      },
      fs,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Advance to final timeout (10 min) — agent gets killed
    jest.advanceTimersByTime(10 * 60 * 1000);
    resolveFirstTurn(killed);

    await promise;
    jest.useRealTimers();

    expect((agent.run as jest.Mock).mock.calls[1][0]).toContain("Wrap it up now!");
  });

  it("displays User header with timeout prompt on wrap-up turn", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const killed: AgentResult = { exitCode: 130, stdout: "", stderr: "" };
    let resolveFirstTurn!: (r: AgentResult) => void;
    const logger = createMockLogger();
    const fs = createMockFileSystem();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // 10 min TTL: kill at 10min
    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 10 },
      logger,
      fs,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Advance to final timeout (10 min) — agent gets killed
    jest.advanceTimersByTime(10 * 60 * 1000);
    resolveFirstTurn(killed);
    await promise;
    jest.useRealTimers();

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain(ICONS.USER);
    expect(allLogs).toContain("User:");
  });

  it("logs urgent warning before kill time", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    let resolveFirstTurn!: (r: AgentResult) => void;
    const logger = createMockLogger();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // 10 min TTL: soft at 5min, urgent at 8min, kill at 10min
    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 10 },
      logger,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Advance to 8 min — past soft (5min) and urgent (8min), before kill (10min)
    jest.advanceTimersByTime(8 * 60 * 1000);

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("URGENT");
    expect(child.kill).not.toHaveBeenCalled();

    resolveFirstTurn(ok);
    await promise;
    jest.useRealTimers();
  });

  it("force-kills agent at timeout and restarts for next loop", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
    const child2 = createMockChild();
    let resolveFirstTurn!: (r: AgentResult) => void;
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const logger = createMockLogger();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValueOnce({
          child: child2,
          result: Promise.resolve(ok),
          iterationComplete: { value: true },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // 10 min TTL: kill fires at 10min
    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 10 },
      logger,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Advance past kill time (10 min)
    jest.advanceTimersByTime(10 * 60 * 1000);

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("FINAL WARNING");
    expect(allLogs).toContain("Restarting agent for next loop");
    expect(child.kill).toHaveBeenCalled();

    // Resolve — agent restarts for wrap-up turn (not exit)
    resolveFirstTurn({ exitCode: 130, stdout: "", stderr: "" });

    const code = await promise;
    expect(code).toBe(0);
    expect(agent.run).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("logs minute ticker every 60 seconds", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    let resolveFirstTurn!: (r: AgentResult) => void;
    const logger = createMockLogger();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 5 },
      logger,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(120000);

    const tickLogs = logger.info.mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s: string) => s.includes(ICONS.TIME));

    expect(tickLogs).toHaveLength(2);
    expect(tickLogs[0]).toContain("minute 1");
    expect(tickLogs[0]).toContain("total 1m");
    expect(tickLogs[1]).toContain("minute 2");
    expect(tickLogs[1]).toContain("total 2m");

    resolveFirstTurn(ok);
    await promise;
    jest.useRealTimers();
  });

  it("debounces rapid double SIGINT (ignores second within 500ms)", async () => {
    const child = createMockChild();
    const logger = createMockLogger();
    const fs = createMockFileSystem();
    let resolveFirstTurn!: (r: AgentResult) => void;

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const promise = executeRunCommand({
      agent, prompt: "do stuff", logger, fs, maxIterations: 3,
    });

    await Promise.resolve();
    await Promise.resolve();

    // First SIGINT — sets stopAfterIteration
    process.emit("SIGINT");
    // Second SIGINT within debounce window (< 500ms) — should be ignored
    process.emit("SIGINT");

    // process.exit should NOT have been called (debounced)
    expect(mockExit).not.toHaveBeenCalled();

    // Resolve and clean up
    resolveFirstTurn({ exitCode: 130, stdout: "", stderr: "" });
    await promise;

    mockExit.mockRestore();
  });

  it("returns 130 when interrupted flag is set during agent run", async () => {
    const child = createMockChild();
    const logger = createMockLogger();
    const fs = createMockFileSystem();
    let resolveFirstTurn!: (r: AgentResult) => void;

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // Mock process.exit to prevent actually exiting and set interrupted
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      resolveFirstTurn({ exitCode: 130, stdout: "", stderr: "" });
      return undefined as never;
    });

    const promise = executeRunCommand({
      agent, prompt: "do stuff", logger, fs, maxIterations: 3,
    });

    await Promise.resolve();
    await Promise.resolve();

    // First SIGINT
    process.emit("SIGINT");
    // Second SIGINT (force quit sets interrupted)
    await new Promise((r) => setTimeout(r, 600));
    process.emit("SIGINT");

    const code = await promise;

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("Interrupted");
    expect(code).toBe(130);

    mockExit.mockRestore();
  });

  it("returns 130 on double SIGINT (force quit)", async () => {
    const child = createMockChild();
    const logger = createMockLogger();
    const fs = createMockFileSystem();
    let resolveFirstTurn!: (r: AgentResult) => void;

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // Mock process.exit to prevent actually exiting
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {
      // Resolve the first turn to unblock the loop
      resolveFirstTurn({ exitCode: 130, stdout: "", stderr: "" });
      return undefined as never;
    });

    const promise = executeRunCommand({
      agent, prompt: "do stuff", logger, fs, maxIterations: 3,
    });

    await Promise.resolve();
    await Promise.resolve();

    // First SIGINT — sets stopAfterIteration
    process.emit("SIGINT");

    // Second SIGINT — force quit (with enough delay to bypass debounce)
    await new Promise((r) => setTimeout(r, 600));
    process.emit("SIGINT");

    await promise;

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("force quitting");
    expect(mockExit).toHaveBeenCalledWith(130);

    mockExit.mockRestore();
  });

  it("runs wrap-up turn on first CTRL+C then stops gracefully", async () => {
    const sigint: AgentResult = { exitCode: 130, stdout: "", stderr: "" };
    const ok: AgentResult = { exitCode: 0, stdout: "", stderr: "" };
    const child = createMockChild();
    const logger = createMockLogger();
    const fs = createMockFileSystem();
    let resolveFirstTurn!: (r: AgentResult) => void;

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent, prompt: "do stuff", logger, fs, maxIterations: 3,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Simulate first CTRL+C while agent is still running
    process.emit("SIGINT");

    // Child receives OS SIGINT and exits with 130
    resolveFirstTurn(sigint);

    const code = await promise;

    // Should run a wrap-up turn, then stop gracefully
    expect(agent.run).toHaveBeenCalledTimes(2);
    const wrapUpPrompt = (agent.run as jest.Mock).mock.calls[1][0] as string;
    expect(wrapUpPrompt).toContain("graceful stop");

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("Wrapping up");
    expect(allLogs).toContain("stop requested");
    expect(allLogs).toContain("Stopped after");
    expect(allLogs).toContain("gracefully");
    expect(allLogs).not.toContain("Interrupted");
    expect(code).toBe(0);
  });

  it("cleans up signal listeners after completion", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "", stderr: "" };
    const agent = createMockAgent(result);

    const before = process.listenerCount("SIGINT");
    await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 1 });
    const after = process.listenerCount("SIGINT");

    expect(after).toBe(before);
  });

  it("returns 130 when agent exits with Windows CTRL+C code", async () => {
    const ctrlC: AgentResult = { exitCode: 0xC000013A, stdout: "", stderr: "" };
    const agent = createMockAgent(ctrlC);

    const code = await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 2 });

    expect(code).toBe(130);
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it("returns 130 when agent exits with Unix SIGINT code", async () => {
    const sigint: AgentResult = { exitCode: 130, stdout: "", stderr: "" };
    const agent = createMockAgent(sigint);

    const code = await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 2 });

    expect(code).toBe(130);
    expect(agent.run).toHaveBeenCalledTimes(1);
  });

  it("displays highlighted loop transition on continuation", async () => {
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const agent = createSequenceMockAgent([ok]);
    const logger = createMockLogger();
    const fs = createMockFileSystem();

    await executeRunCommand({ agent, prompt: "do stuff", logger, fs, maxIterations: 2 });

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain(ICONS.LOOP);
    expect(allLogs).toContain("loop 2");
  });

  it("returns 1 when agent requests exit", async () => {
    const result: AgentResult = { exitCode: 0, stdout: "", stderr: "" };
    const child = createMockChild();
    const logger = createMockLogger();
    const fs = createMockFileSystem();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn().mockReturnValue({
        child,
        result: Promise.resolve(result),
        iterationComplete: { value: false },
        exitRequested: { value: true },
      }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const code = await executeRunCommand({ agent, prompt: "do stuff", logger, fs, maxIterations: 2 });

    expect(code).toBe(1);
    const allErrors = logger.error.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allErrors).toContain("Agent requested exit");
  });

  it("includes progress file in stop prompt on CTRL+C", async () => {
    const ok: AgentResult = { exitCode: 0, stdout: "", stderr: "" };
    const child = createMockChild();
    const logger = createMockLogger();
    const fs = createMockFileSystem();
    let resolveFirstTurn!: (r: AgentResult) => void;

    (fs.exists as jest.Mock).mockResolvedValue(true);
    (fs.readFile as jest.Mock).mockResolvedValue("## My progress content");

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn()
        .mockReturnValueOnce({
          child,
          result: new Promise<AgentResult>((resolve) => {
            resolveFirstTurn = resolve;
          }),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
          iterationComplete: { value: false },
          exitRequested: { value: false },
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent, prompt: "do stuff", logger, fs, maxIterations: 3,
    });

    await Promise.resolve();
    await Promise.resolve();

    process.emit("SIGINT");
    resolveFirstTurn({ exitCode: 130, stdout: "", stderr: "" });

    await promise;

    const stopPrompt = (agent.run as jest.Mock).mock.calls[1][0] as string;
    expect(stopPrompt).toContain("graceful stop");
    expect(stopPrompt).toContain("My progress content");
  });

  it("does not log stderr when empty", async () => {
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const fail: AgentResult = { exitCode: 1, stdout: "", stderr: "   " };
    const agent = createSequenceMockAgent([ok, fail]);
    const fs = createMockFileSystem();
    const logger = createMockLogger();

    await executeRunCommand({ agent, prompt: "do stuff", fs, maxIterations: 3, logger });

    const errorCalls = logger.error.mock.calls.map((c: unknown[]) => c[0] as string);
    const stderrLogs = errorCalls.filter((s: string) => !s.includes("exited with code"));
    expect(stderrLogs).toHaveLength(0);
  });

  it("sets iterationComplete exit code to 0", async () => {
    const result: AgentResult = { exitCode: 1, stdout: "", stderr: "" };
    const child = createMockChild();
    const fs = createMockFileSystem();

    const agent: Agent = {
      name: "mock-agent",
      run: jest.fn().mockReturnValue({
        child,
        result: Promise.resolve(result),
        iterationComplete: { value: true },
        exitRequested: { value: false },
      }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const code = await executeRunCommand({ agent, prompt: "do stuff", fs, maxIterations: 1 });

    expect(code).toBe(0);
  });

  describe("continuation loop", () => {
    it("re-runs agent with continue prompt after completion", async () => {
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      const agent = createSequenceMockAgent([ok, ok]);
      const fs = createMockFileSystem();

      await executeRunCommand({ agent, prompt: "do stuff", fs, maxIterations: 3 });

      expect(agent.run).toHaveBeenCalledTimes(3);
      expect(agent.run).toHaveBeenNthCalledWith(1, "do stuff", expect.any(Object));
      expect((agent.run as jest.Mock).mock.calls[1][0]).toContain(
        "Continue where you left off.",
      );
    });

    it("uses custom continue_prompt from loop config", async () => {
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      const agent = createSequenceMockAgent([ok]);
      const fs = createMockFileSystem();
      const loopConfig = {
        max_turn_time_minutes: 5,
        continue_prompt: "Keep going!",
      };

      await executeRunCommand({ agent, prompt: "do stuff", loopConfig, fs, maxIterations: 2 });

      expect((agent.run as jest.Mock).mock.calls[1][0]).toContain("Keep going!");
    });

    it("continues looping on non-first-run failure", async () => {
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      const fail: AgentResult = { exitCode: 1, stdout: "", stderr: "" };
      const agent = createSequenceMockAgent([ok, fail, ok]);
      const fs = createMockFileSystem();

      await executeRunCommand({ agent, prompt: "do stuff", fs, maxIterations: 3 });

      expect(agent.run).toHaveBeenCalledTimes(3);
    });

    it("stops after max consecutive failures", async () => {
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      const fail: AgentResult = { exitCode: 1, stdout: "", stderr: "error" };
      const agent = createSequenceMockAgent([ok, fail, fail, fail, ok]);
      const fs = createMockFileSystem();
      const logger = createMockLogger();

      const code = await executeRunCommand({
        agent, prompt: "do stuff", fs, maxIterations: 5, logger,
      });

      expect(agent.run).toHaveBeenCalledTimes(4);
      expect(code).toBe(1);

      const allErrors = logger.error.mock.calls.map((c: unknown[]) => c[0]).join("\n");
      expect(allErrors).toContain("failed 3 times in a row");
    });

    it("includes progress file content in continuation prompt", async () => {
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      const agent = createSequenceMockAgent([ok]);
      const fs = createMockFileSystem();

      // Simulate agent writing progress during first iteration
      (fs.exists as jest.Mock).mockResolvedValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue("Fixed bug in auth module\nStill need to add tests");

      await executeRunCommand({ agent, prompt: "do stuff", fs, maxIterations: 2 });

      const secondCallPrompt = (agent.run as jest.Mock).mock.calls[1][0] as string;
      expect(secondCallPrompt).toContain("Progress from previous iteration");
      expect(secondCallPrompt).toContain("Fixed bug in auth module");
      expect(secondCallPrompt).toContain("Still need to add tests");
    });

    it("does not write to stdin when it is destroyed", async () => {
      jest.useFakeTimers();
      const child = createMockChild();
      // Mark stdin as destroyed
      (child.stdin as unknown as { destroyed: boolean }).destroyed = true;
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      let resolveFirstTurn!: (r: AgentResult) => void;
      const fs = createMockFileSystem();

      const agent: Agent = {
        name: "mock-agent",
        run: jest.fn()
          .mockReturnValueOnce({
            child,
            result: new Promise<AgentResult>((resolve) => {
              resolveFirstTurn = resolve;
            }),
            iterationComplete: { value: false },
            exitRequested: { value: false },
          })
          .mockReturnValue({
            child,
            result: Promise.resolve(ok),
            iterationComplete: { value: false },
            exitRequested: { value: false },
          }),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const promise = executeRunCommand({
        agent,
        prompt: "do stuff",
        loopConfig: { max_turn_time_minutes: 10 },
        fs,
        maxIterations: 2,
      });

      await Promise.resolve();
      await Promise.resolve();

      // Advance past soft warning time — stdin.write should NOT be called since stdin is destroyed
      jest.advanceTimersByTime(10 * 60 * 1000);
      resolveFirstTurn(ok);
      await promise;
      jest.useRealTimers();

      expect(child.stdin!.write).not.toHaveBeenCalled();
    });

    it("logs stdin messages when verbose mode is enabled", async () => {
      jest.useFakeTimers();
      const child = createMockChild();
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      let resolveFirstTurn!: (r: AgentResult) => void;
      const logger = createMockLogger();
      const fs = createMockFileSystem();

      const agent: Agent = {
        name: "mock-agent",
        run: jest.fn()
          .mockReturnValueOnce({
            child,
            result: new Promise<AgentResult>((resolve) => {
              resolveFirstTurn = resolve;
            }),
            iterationComplete: { value: false },
            exitRequested: { value: false },
          })
          .mockReturnValue({
            child,
            result: Promise.resolve(ok),
            iterationComplete: { value: false },
            exitRequested: { value: false },
          }),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const promise = executeRunCommand({
        agent,
        prompt: "do stuff",
        loopConfig: { max_turn_time_minutes: 10 },
        logger,
        verbose: true,
        fs,
        maxIterations: 2,
      });

      await Promise.resolve();
      await Promise.resolve();

      // Advance past soft warning (5 min from end = 5 min in)
      jest.advanceTimersByTime(5 * 60 * 1000);

      const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
      expect(allLogs).toContain("[stdin]");

      // Advance to kill time
      jest.advanceTimersByTime(5 * 60 * 1000);
      resolveFirstTurn({ exitCode: 130, stdout: "", stderr: "" });
      await promise;
      jest.useRealTimers();
    });

    it("formats elapsed time with hours when > 60 minutes", async () => {
      jest.useFakeTimers();
      const child = createMockChild();
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      let resolveFirstTurn!: (r: AgentResult) => void;
      const logger = createMockLogger();

      const agent: Agent = {
        name: "mock-agent",
        run: jest.fn()
          .mockReturnValueOnce({
            child,
            result: new Promise<AgentResult>((resolve) => {
              resolveFirstTurn = resolve;
            }),
            iterationComplete: { value: false },
            exitRequested: { value: false },
          })
          .mockReturnValue({
            child,
            result: Promise.resolve(ok),
            iterationComplete: { value: false },
            exitRequested: { value: false },
          }),
        isAvailable: jest.fn().mockResolvedValue(true),
      };

      const promise = executeRunCommand({
        agent,
        prompt: "do stuff",
        logger,
        maxIterations: 2,
      });

      await Promise.resolve();
      await Promise.resolve();

      // Advance 61 minutes to trigger minute ticker with hours format
      jest.advanceTimersByTime(61 * 60 * 1000);

      const tickLogs = logger.info.mock.calls
        .map((c: unknown[]) => c[0] as string)
        .filter((s: string) => s.includes(ICONS.TIME));

      // The 61st tick should show "1h 1m"
      const lastTick = tickLogs[tickLogs.length - 1];
      expect(lastTick).toContain("1h");

      resolveFirstTurn(ok);
      await promise;
      jest.useRealTimers();
    });

    it("cleans up progress file after loop ends", async () => {
      const ok: AgentResult = { exitCode: 0, stdout: "", stderr: "" };
      const agent = createMockAgent(ok);
      const fs = createMockFileSystem();

      (fs.exists as jest.Mock).mockResolvedValue(true);

      await executeRunCommand({ agent, prompt: "do stuff", fs, maxIterations: 1 });

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("loop-progress"),
        "",
      );
    });
  });
});
