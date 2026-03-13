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

  it("continues looping on non-zero exit code", async () => {
    const fail: AgentResult = { exitCode: 42, stdout: "", stderr: "err" };
    const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
    const agent = createSequenceMockAgent([fail, ok]);
    const fs = createMockFileSystem();

    const code = await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 2, fs });

    expect(agent.run).toHaveBeenCalledTimes(2);
    expect(code).toBe(0);
  });

  it("logs non-zero exit code from agent", async () => {
    const fail: AgentResult = { exitCode: 42, stdout: "", stderr: "err" };
    const agent = createMockAgent(fail);
    const logger = createMockLogger();

    await executeRunCommand({ agent, prompt: "do stuff", maxIterations: 1, logger });

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("exited with code 42");
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
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 1 },
      fs,
      maxIterations: 2,
    });

    // Let isAvailable() microtask resolve
    await Promise.resolve();
    await Promise.resolve();

    // Fire the soft timeout
    jest.advanceTimersByTime(60000);

    // Agent was NOT killed
    expect(child.kill).not.toHaveBeenCalled();

    // Resolve first turn — timeout flag is now set
    resolveFirstTurn(ok);

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
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 1 },
      fs,
      maxIterations: 3,
    });

    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(60000);
    resolveFirstTurn(ok);

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
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: {
        max_turn_time_minutes: 1,
        timeout_prompt: "Wrap it up now!",
      },
      fs,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(60000);
    resolveFirstTurn(ok);

    await promise;
    jest.useRealTimers();

    expect((agent.run as jest.Mock).mock.calls[1][0]).toContain("Wrap it up now!");
  });

  it("displays User header with timeout prompt on wrap-up turn", async () => {
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
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 1 },
      logger,
      fs,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    jest.advanceTimersByTime(60000);
    resolveFirstTurn(ok);
    await promise;
    jest.useRealTimers();

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain(ICONS.USER);
    expect(allLogs).toContain("User:");
  });

  it("logs urgent warning at timeout + 2 minutes", async () => {
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
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 1 },
      logger,
      maxIterations: 2,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Fire first warning (1 min) + urgent warning (3 min)
    jest.advanceTimersByTime(180000);

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("URGENT");
    expect(child.kill).not.toHaveBeenCalled();

    resolveFirstTurn(ok);
    await promise;
    jest.useRealTimers();
  });

  it("force-kills agent at timeout + 5 minutes with final warning", async () => {
    jest.useFakeTimers();
    const child = createMockChild();
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
        }),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    const promise = executeRunCommand({
      agent,
      prompt: "do stuff",
      loopConfig: { max_turn_time_minutes: 1 },
      logger,
      maxIterations: 1,
    });

    await Promise.resolve();
    await Promise.resolve();

    // Fire all three warnings (1 min + 3 min + 6 min)
    jest.advanceTimersByTime(360000);

    const allLogs = logger.info.mock.calls.map((c: unknown[]) => c[0]).join("\n");
    expect(allLogs).toContain("FINAL WARNING");
    expect(allLogs).toContain("Forcing stop");
    expect(child.kill).toHaveBeenCalled();

    // Resolve to let the promise settle
    resolveFirstTurn({ exitCode: 130, stdout: "", stderr: "" });
    await promise;
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
        })
        .mockReturnValue({
          child,
          result: Promise.resolve(ok),
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

    it("continues looping even on non-zero exit code", async () => {
      const fail: AgentResult = { exitCode: 1, stdout: "", stderr: "" };
      const ok: AgentResult = { exitCode: 0, stdout: "ok", stderr: "" };
      const agent = createSequenceMockAgent([fail, ok]);
      const fs = createMockFileSystem();

      await executeRunCommand({ agent, prompt: "do stuff", fs, maxIterations: 2 });

      expect(agent.run).toHaveBeenCalledTimes(2);
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
