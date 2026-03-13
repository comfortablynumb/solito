import { DefaultVariableResolver, getNestedValue } from "./variable-resolver";
import { CommandVariables } from "../config/config";

describe("DefaultVariableResolver", () => {
  const resolver = new DefaultVariableResolver({ solitoRootDir: "/fake/solito" });

  describe("env variables", () => {
    it("resolves ${env:...} from process.env", () => {
      process.env.TEST_SOLITO_VAR = "hello";
      const result = resolver.resolve("path/${env:TEST_SOLITO_VAR}/file");

      expect(result).toBe("path/hello/file");
      delete process.env.TEST_SOLITO_VAR;
    });

    it("keeps original token when env var is missing", () => {
      const result = resolver.resolve("${env:NONEXISTENT_SOLITO_VAR_XYZ}");

      expect(result).toBe("${env:NONEXISTENT_SOLITO_VAR_XYZ}");
    });
  });

  describe("var variables", () => {
    it("resolves ${var:solito_root_dir}", () => {
      const result = resolver.resolve("${var:solito_root_dir}/prompts/q.md");

      expect(result).toBe("/fake/solito/prompts/q.md");
    });

    it("resolves flat variable from command variables", () => {
      const variables: CommandVariables = { name: "world" };
      const result = resolver.resolve("hello ${var:name}", variables);

      expect(result).toBe("hello world");
    });

    it("resolves nested dot-path variable", () => {
      const variables: CommandVariables = {
        thresholds: { min_coverage: 0.5 },
      };
      const result = resolver.resolve("min=${var:thresholds.min_coverage}", variables);

      expect(result).toBe("min=0.5");
    });

    it("keeps original token when var is not found", () => {
      const result = resolver.resolve("${var:unknown_key}");

      expect(result).toBe("${var:unknown_key}");
    });

    it("resolves boolean variables", () => {
      const variables: CommandVariables = { strict: true };
      const result = resolver.resolve("strict=${var:strict}", variables);

      expect(result).toBe("strict=true");
    });

    it("resolves custom built-in variables", () => {
      const customResolver = new DefaultVariableResolver({
        solitoRootDir: "/fake/solito",
        builtIns: { command_work_dir: "/project/.solito/commands/quality" },
      });
      const result = customResolver.resolve("dir=${var:command_work_dir}");

      expect(result).toBe("dir=/project/.solito/commands/quality");
    });
  });

  describe("mixed interpolation", () => {
    it("resolves multiple tokens in one string", () => {
      process.env.TEST_SOLITO_MIX = "envval";
      const variables: CommandVariables = { count: 3 };
      const result = resolver.resolve(
        "${var:solito_root_dir}/${env:TEST_SOLITO_MIX}/${var:count}",
        variables,
      );

      expect(result).toBe("/fake/solito/envval/3");
      delete process.env.TEST_SOLITO_MIX;
    });

    it("returns string unchanged when no tokens present", () => {
      const result = resolver.resolve("plain text");

      expect(result).toBe("plain text");
    });
  });
});

describe("getNestedValue", () => {
  it("returns undefined for missing key", () => {
    expect(getNestedValue({}, "a")).toBeUndefined();
  });

  it("returns undefined for partial path", () => {
    expect(getNestedValue({ a: "val" }, "a.b")).toBeUndefined();
  });

  it("returns undefined for object leaf", () => {
    const obj: CommandVariables = { a: { b: { c: "deep" } } };
    expect(getNestedValue(obj, "a.b")).toBeUndefined();
  });

  it("returns deep value", () => {
    const obj: CommandVariables = { a: { b: { c: 42 } } };
    expect(getNestedValue(obj, "a.b.c")).toBe(42);
  });
});
