import { DefaultTsvParser } from "./tsv-parser";

describe("DefaultTsvParser", () => {
  const parser = new DefaultTsvParser();

  it("parses TSV content with headers and rows", () => {
    const content = "name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA";
    const rows = parser.parse(content);

    expect(rows).toEqual([
      { name: "Alice", age: "30", city: "NYC" },
      { name: "Bob", age: "25", city: "LA" },
    ]);
  });

  it("returns empty array for empty content", () => {
    expect(parser.parse("")).toEqual([]);
  });

  it("returns empty array for header-only content", () => {
    expect(parser.parse("name\tage")).toEqual([]);
  });

  it("handles missing values with empty strings", () => {
    const content = "a\tb\tc\n1\t2";
    const rows = parser.parse(content);

    expect(rows).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("trims whitespace from cells", () => {
    const content = " name \t age \n Alice \t 30 ";
    const rows = parser.parse(content);

    expect(rows).toEqual([{ name: "Alice", age: "30" }]);
  });

  it("handles multiple rows", () => {
    const content = "loop\tcoverage\n1\t50\n2\t60\n3\t72";
    const rows = parser.parse(content);

    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({ loop: "3", coverage: "72" });
  });
});
