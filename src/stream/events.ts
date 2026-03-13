export interface TextDelta {
  type: "text_delta";
  text: string;
}

export interface InputJsonDelta {
  type: "input_json_delta";
  partial_json: string;
}

export interface ThinkingDelta {
  type: "thinking_delta";
  thinking: string;
}

export type ContentDelta = TextDelta | InputJsonDelta | ThinkingDelta;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock;

export interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    role: string;
    model?: string;
  };
}

export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: ContentBlock;
}

export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: ContentDelta;
}

export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface MessageDeltaEvent {
  type: "message_delta";
  delta: {
    stop_reason: string;
  };
  usage?: {
    output_tokens: number;
  };
}

export interface MessageStopEvent {
  type: "message_stop";
}

export interface PingEvent {
  type: "ping";
}

export type StreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent;

export interface CliStreamEvent {
  type: "stream_event";
  event: StreamEvent;
}

export interface CliAssistantMessage {
  type: "assistant";
  message: {
    content: ContentBlock[];
  };
}

export interface CliResultMessage {
  type: "result";
  subtype: string;
  result?: string;
  is_error?: boolean;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  session_id?: string;
}

export interface CliSystemMessage {
  type: "system";
  subtype: string;
  message?: string;
}

export type CliMessage =
  | CliStreamEvent
  | CliAssistantMessage
  | CliResultMessage
  | CliSystemMessage;
