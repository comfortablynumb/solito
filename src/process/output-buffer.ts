const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export class OutputBuffer {
  private buffer = "";
  private truncated = false;
  private readonly maxBytes: number;

  constructor(maxBytes = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  append(text: string): void {
    if (this.truncated) {
      return;
    }

    if (this.buffer.length + text.length > this.maxBytes) {
      this.buffer = this.buffer.slice(0, this.maxBytes);
      this.truncated = true;
      return;
    }

    this.buffer += text;
  }

  toString(): string {
    if (this.truncated) {
      return this.buffer + "\n[output truncated: exceeded buffer limit]";
    }

    return this.buffer;
  }
}
