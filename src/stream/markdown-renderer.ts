import { Marked, MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";

export interface MarkdownRenderer {
  render(markdown: string): string;
}

export class TerminalMarkdownRenderer implements MarkdownRenderer {
  private readonly markedInstance: Marked;

  constructor() {
    this.markedInstance = new Marked();
    this.markedInstance.use(
      markedTerminal({
        showSectionPrefix: false,
        reflowText: true,
        width: process.stdout.columns ?? 80,
      }) as MarkedExtension,
    );
    this.fixInlineTokenRendering();
  }

  render(markdown: string): string {
    const result = this.markedInstance.parse(markdown);

    if (typeof result !== "string") {
      return markdown;
    }

    return result.replace(/\n+$/, "\n");
  }

  private fixInlineTokenRendering(): void {
    const renderer = this.markedInstance.defaults
      .renderer as Record<string, unknown> | undefined;

    if (!renderer) {
      return;
    }

    const origText = (renderer.text as Function).bind(renderer);

    renderer.text = function (
      this: { parser: { parseInline: (tokens: unknown[]) => string } },
      token: unknown,
    ) {
      const t = token as { tokens?: unknown[] };

      if (t.tokens && t.tokens.length > 0) {
        return this.parser.parseInline(t.tokens);
      }

      return origText(token);
    };
  }
}
