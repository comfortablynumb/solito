export interface TsvRow {
  [key: string]: string;
}

export interface TsvParser {
  parse(content: string): TsvRow[];
}

export class DefaultTsvParser implements TsvParser {
  parse(content: string): TsvRow[] {
    const lines = content.trim().split("\n");

    if (lines.length < 2) {
      return [];
    }

    const headers = this.splitLine(lines[0]);
    return lines.slice(1).map((line) => this.buildRow(headers, line));
  }

  private splitLine(line: string): string[] {
    return line.split("\t").map((cell) => cell.trim());
  }

  private buildRow(headers: string[], line: string): TsvRow {
    const values = this.splitLine(line);
    const row: TsvRow = {};

    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }

    return row;
  }
}
