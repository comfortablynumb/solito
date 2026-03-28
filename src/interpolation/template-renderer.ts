import * as TwigLib from "twig";

export interface TemplateRenderer {
  render(template: string, context: Record<string, unknown>): string;
}

export class TwigTemplateRenderer implements TemplateRenderer {
  render(template: string, context: Record<string, unknown>): string {
    return TwigLib.twig({ data: template }).render(context);
  }
}
