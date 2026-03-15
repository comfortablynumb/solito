import { ConsoleStreamFormatter } from "./formatter";
import { CliMessage } from "./events";
import { SEPARATOR, ICONS, ANSI } from "../constants";

function createMockOutput(): { write: jest.Mock; getOutput: () => string } {
  const chunks: string[] = [];
  return {
    write: jest.fn((text: string) => chunks.push(text)),
    getOutput: () => chunks.join(""),
  };
}

describe("ConsoleStreamFormatter", () => {
  it("streams text deltas directly to output", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    const message: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello world" },
      },
    };

    formatter.format(message);

    expect(output.getOutput()).toBe("  Hello world");
  });

  it("displays unknown tool name on block start", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    const message: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "Write", input: {} },
      },
    };

    formatter.format(message);

    expect(output.getOutput()).toContain("Write");
  });

  it("writes separator line after tool block stop", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "Write", input: {} },
      },
    });

    formatter.format({
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
    });

    expect(output.getOutput()).toContain(SEPARATOR);
  });

  it("writes separator line before result output", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    formatter.format({
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
    });

    expect(output.getOutput()).toContain(SEPARATOR);
  });

  it("writes Answer header on text block start", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    });

    const text = output.getOutput();
    expect(text).toContain(ICONS.ANSWER);
    expect(text).toContain("Answer:");
    expect(text).toContain(SEPARATOR);
  });

  it("writes Think header on thinking block start when verbose", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output, verbose: true });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking" as const, thinking: "" },
      },
    });

    const text = output.getOutput();
    expect(text).toContain(ICONS.THINK);
    expect(text).toContain("Think:");
    expect(text).toContain(SEPARATOR);
  });

  it("hides Think header when not verbose", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output, verbose: false });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking" as const, thinking: "" },
      },
    });

    expect(output.write).not.toHaveBeenCalled();
  });

  it("does not write double separator between consecutive tools", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    const agentJson = JSON.stringify({
      subagent_type: "Explore",
      description: "task one",
    });

    for (let i = 0; i < 2; i++) {
      formatter.format({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: i,
          content_block: { type: "tool_use", id: `t${i}`, name: "Agent", input: {} },
        },
      });

      formatter.format({
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: i,
          delta: { type: "input_json_delta", partial_json: agentJson },
        },
      });

      formatter.format({
        type: "stream_event",
        event: { type: "content_block_stop", index: i },
      });
    }

    const text = output.getOutput();
    const doubleSep = `${SEPARATOR}${ANSI.RESET}\n\n${ANSI.DIM}${SEPARATOR}`;
    expect(text).not.toContain(doubleSep);
  });

  it("shows tool input json in dim for unknown tools", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    // Set up an unknown tool context first
    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "Write", input: {} },
      },
    });
    output.write.mockClear();

    const message: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"cmd":"ls"}' },
      },
    };

    formatter.format(message);

    const text = output.getOutput();
    expect(text).toContain('{"cmd":"ls"}');
    expect(text).toContain("\x1b[2m");
  });

  it("formats Agent tool with type and description on block stop", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "Agent", input: {} },
      },
    });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify({
            subagent_type: "Explore",
            description: "Read all source files",
          }),
        },
      },
    });

    output.write.mockClear();

    formatter.format({
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
    });

    const text = output.getOutput();
    expect(text).toContain("Agent (Explore)");
    expect(text).toContain("Read all source files");
  });

  it("formats Bash tool with description and command on block stop", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "Bash", input: {} },
      },
    });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: JSON.stringify({
            command: "npm test",
            description: "Run project tests",
          }),
        },
      },
    });

    output.write.mockClear();

    formatter.format({
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
    });

    const text = output.getOutput();
    expect(text).toContain("Bash");
    expect(text).toContain("Run project tests");
    expect(text).toContain("$ npm test");
  });

  it("buffers json deltas for known tools instead of streaming", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "t1", name: "Agent", input: {} },
      },
    });
    output.write.mockClear();

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"subagent' },
      },
    });

    expect(output.write).not.toHaveBeenCalled();
  });

  it("shows thinking text in dim when verbose", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output, verbose: true });

    const message: CliMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Let me think..." },
      },
    };

    formatter.format(message);

    const text = output.getOutput();
    expect(text).toContain("Let me think...");
    expect(text).toContain("\x1b[2m");
  });

  it("hides thinking text when not verbose", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output, verbose: false });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Let me think..." },
      },
    });

    expect(output.write).not.toHaveBeenCalled();
  });

  it("renders markdown when markdownRenderer is provided", () => {
    const output = createMockOutput();
    const mockRenderer = { render: (md: string) => `RENDERED:${md}` };
    const formatter = new ConsoleStreamFormatter({
      output,
      markdownRenderer: mockRenderer,
    });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Hello **world**" },
      },
    });

    formatter.format({
      type: "stream_event",
      event: { type: "content_block_stop", index: 0 },
    });

    const text = output.getOutput();
    expect(text).toContain("  RENDERED:Hello **world**");
  });

  it("buffers text deltas when markdownRenderer is provided", () => {
    const output = createMockOutput();
    const mockRenderer = { render: jest.fn((md: string) => md) };
    const formatter = new ConsoleStreamFormatter({
      output,
      markdownRenderer: mockRenderer,
    });

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
    });

    output.write.mockClear();

    formatter.format({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "chunk1" },
      },
    });

    expect(output.write).not.toHaveBeenCalled();
    expect(mockRenderer.render).not.toHaveBeenCalled();
  });

  it("shows error result in red", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    const message: CliMessage = {
      type: "result",
      subtype: "error",
      is_error: true,
      result: "Something went wrong",
    };

    formatter.format(message);

    const text = output.getOutput();
    expect(text).toContain("Something went wrong");
    expect(text).toContain("\x1b[31m");
  });

  it("shows cost on successful result", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    const message: CliMessage = {
      type: "result",
      subtype: "success",
      cost_usd: 0.0123,
    };

    formatter.format(message);

    expect(output.getOutput()).toContain("0.0123");
  });

  it("ignores ping events", () => {
    const output = createMockOutput();
    const formatter = new ConsoleStreamFormatter({ output });

    const message: CliMessage = {
      type: "stream_event",
      event: { type: "ping" },
    };

    formatter.format(message);

    expect(output.write).not.toHaveBeenCalled();
  });

  describe("verbose mode", () => {
    it("shows message_start metadata when verbose", () => {
      const output = createMockOutput();
      const formatter = new ConsoleStreamFormatter({ output, verbose: true });

      const message: CliMessage = {
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_123", role: "assistant", model: "claude-sonnet-4-20250514" },
        },
      };

      formatter.format(message);

      const text = output.getOutput();
      expect(text).toContain("msg_123");
      expect(text).toContain("claude-sonnet-4-20250514");
    });

    it("hides message_start metadata when not verbose", () => {
      const output = createMockOutput();
      const formatter = new ConsoleStreamFormatter({ output, verbose: false });

      const message: CliMessage = {
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg_123", role: "assistant", model: "claude-sonnet-4-20250514" },
        },
      };

      formatter.format(message);

      expect(output.write).not.toHaveBeenCalled();
    });

    it("shows result metadata when verbose", () => {
      const output = createMockOutput();
      const formatter = new ConsoleStreamFormatter({ output, verbose: true });

      const message: CliMessage = {
        type: "result",
        subtype: "success",
        cost_usd: 0.05,
        session_id: "sess_abc",
        duration_ms: 1200,
        total_cost_usd: 0.10,
      };

      formatter.format(message);

      const text = output.getOutput();
      expect(text).toContain("sess_abc");
      expect(text).toContain("1200ms");
    });
  });
});
