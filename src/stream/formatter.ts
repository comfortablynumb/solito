import {
  CliMessage,
  StreamEvent,
  ContentBlockStartEvent,
  ContentBlockDeltaEvent,
  MessageStartEvent,
  MessageDeltaEvent,
  CliResultMessage,
} from "./events";
import { isKnownTool, formatToolInput } from "./tool-formatter";
import { MarkdownRenderer } from "./markdown-renderer";
import { ANSI, SEPARATOR, ICONS } from "../constants";

export interface StreamOutput {
  write(text: string): void;
}

export interface StreamFormatterOptions {
  output: StreamOutput;
  verbose?: boolean;
  markdownRenderer?: MarkdownRenderer;
}

export interface StreamFormatter {
  format(message: CliMessage): void;
}

export class ConsoleStreamFormatter implements StreamFormatter {
  private currentBlockType: string | null = null;
  private currentToolName: string | null = null;
  private jsonBuffer: string[] = [];
  private textBuffer: string[] = [];
  private lastWroteSeparator = false;
  private readonly output: StreamOutput;
  private readonly verbose: boolean;
  private readonly markdownRenderer: MarkdownRenderer | null;

  constructor(options: StreamFormatterOptions) {
    this.output = options.output;
    this.verbose = options.verbose ?? false;
    this.markdownRenderer = options.markdownRenderer ?? null;
  }

  format(message: CliMessage): void {
    if (message.type === "stream_event") {
      this.formatStreamEvent(message.event);
      return;
    }

    if (message.type === "result") {
      this.formatResult(message);
      return;
    }

    if (this.verbose && message.type === "system") {
      this.writeVerbose(`[system:${message.subtype}] ${message.message ?? ""}`);
    }
  }

  private formatStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case "message_start":
        this.handleMessageStart(event);
        break;
      case "content_block_start":
        this.handleBlockStart(event);
        break;
      case "content_block_delta":
        this.handleBlockDelta(event);
        break;
      case "content_block_stop":
        this.handleBlockStop();
        break;
      case "message_delta":
        this.handleMessageDelta(event);
        break;
    }
  }

  private handleMessageStart(event: MessageStartEvent): void {
    if (!this.verbose) {
      return;
    }

    const parts = [`[message_start] id=${event.message.id}`];

    if (event.message.model) {
      parts.push(`model=${event.message.model}`);
    }

    this.writeVerbose(parts.join(" "));
  }

  private handleBlockStart(event: ContentBlockStartEvent): void {
    const block = event.content_block;
    this.currentBlockType = block.type;

    if (block.type === "text") {
      this.writeSeparator();
      this.writeContent(`${ANSI.CYAN}${ICONS.ANSWER} Answer:${ANSI.RESET}\n`);
      return;
    }

    if (block.type === "thinking") {
      if (this.verbose) {
        this.writeSeparator();
        this.writeContent(`${ANSI.CYAN}${ICONS.THINK} Think:${ANSI.RESET}\n`);
      }

      return;
    }

    if (block.type === "tool_use") {
      this.currentToolName = block.name;
      this.jsonBuffer = [];

      if (!isKnownTool(block.name)) {
        this.writeSeparator();
        this.writeContent(`${ANSI.CYAN}${ICONS.TOOL} ${block.name}${ANSI.RESET} `);
      }

      if (this.verbose) {
        this.writeVerbose(`[tool_use] id=${block.id} name=${block.name}`);
      }
    }
  }

  private handleBlockDelta(event: ContentBlockDeltaEvent): void {
    const delta = event.delta;

    if (delta.type === "text_delta") {
      if (this.markdownRenderer) {
        this.textBuffer.push(delta.text);
      } else {
        this.writeContent(indentText(delta.text));
      }

      return;
    }

    if (delta.type === "input_json_delta") {
      if (this.currentToolName && isKnownTool(this.currentToolName)) {
        this.jsonBuffer.push(delta.partial_json);
      } else {
        this.writeContent(`${ANSI.DIM}${delta.partial_json}${ANSI.RESET}`);
      }
      return;
    }

    if (delta.type === "thinking_delta" && this.verbose) {
      this.writeContent(`${ANSI.DIM}${delta.thinking}${ANSI.RESET}`);
    }
  }

  private handleBlockStop(): void {
    if (this.currentBlockType === "text") {
      this.flushTextDisplay();
      this.output.write("\n");
    }

    if (this.currentBlockType === "tool_use") {
      this.flushToolDisplay();
      this.output.write("\n");
      this.writeSeparator();
    }

    this.currentBlockType = null;
    this.currentToolName = null;
    this.jsonBuffer = [];
    this.textBuffer = [];
  }

  private flushTextDisplay(): void {
    if (!this.markdownRenderer) {
      return;
    }

    const text = this.textBuffer.join("");

    if (!text) {
      return;
    }

    this.writeContent(indentText(this.markdownRenderer.render(text)));
  }

  private flushToolDisplay(): void {
    if (!this.currentToolName || !isKnownTool(this.currentToolName)) {
      return;
    }

    const json = this.jsonBuffer.join("");

    if (!json) {
      return;
    }

    const display = formatToolInput(this.currentToolName, json);

    if (!display) {
      this.writeSeparator();
      this.writeContent(`${ANSI.CYAN}${ICONS.TOOL} ${this.currentToolName}${ANSI.RESET} `);
      this.writeContent(`${ANSI.DIM}${json}${ANSI.RESET}`);
      return;
    }

    this.writeSeparator();
    this.writeContent(`${ANSI.CYAN}${ICONS.TOOL} ${display.label}${ANSI.RESET}`);

    for (const line of display.details) {
      this.writeContent(`\n  ${ANSI.DIM}${line}${ANSI.RESET}`);
    }
  }

  private handleMessageDelta(event: MessageDeltaEvent): void {
    if (!this.verbose) {
      return;
    }

    const parts = [`[message_delta] stop_reason=${event.delta.stop_reason}`];

    if (event.usage?.output_tokens !== undefined) {
      parts.push(`tokens=${event.usage.output_tokens}`);
    }

    this.writeVerbose(parts.join(" "));
  }

  private formatResult(message: CliResultMessage): void {
    this.writeSeparator();

    if (message.is_error) {
      this.writeContent(`${ANSI.RED}✗ Error: ${message.result ?? "unknown"}${ANSI.RESET}\n`);
      return;
    }

    if (this.verbose) {
      this.writeResultMetadata(message);
    }

    if (message.cost_usd !== undefined) {
      const cost = message.cost_usd.toFixed(4);
      this.writeContent(`${ANSI.DIM}$ ${cost} USD${ANSI.RESET}\n`);
    }
  }

  private writeResultMetadata(message: CliResultMessage): void {
    const parts: string[] = [];

    if (message.session_id) {
      parts.push(`session=${message.session_id}`);
    }

    if (message.duration_ms !== undefined) {
      parts.push(`duration=${message.duration_ms}ms`);
    }

    if (message.duration_api_ms !== undefined) {
      parts.push(`api=${message.duration_api_ms}ms`);
    }

    if (message.total_cost_usd !== undefined) {
      parts.push(`total=$${message.total_cost_usd.toFixed(4)}`);
    }

    if (parts.length > 0) {
      this.writeVerbose(`[result] ${parts.join(" ")}`);
    }
  }

  private writeContent(text: string): void {
    this.lastWroteSeparator = false;
    this.output.write(text);
  }

  private writeSeparator(): void {
    if (this.lastWroteSeparator) {
      return;
    }

    this.output.write(`${ANSI.DIM}${SEPARATOR}${ANSI.RESET}\n`);
    this.lastWroteSeparator = true;
  }

  private writeVerbose(text: string): void {
    this.lastWroteSeparator = false;
    this.output.write(`${ANSI.DIM}${ANSI.YELLOW}${text}${ANSI.RESET}\n`);
  }
}

const INDENT = "  ";

function indentText(text: string): string {
  return text
    .split("\n")
    .map((line) => `${INDENT}${line}`)
    .join("\n");
}
