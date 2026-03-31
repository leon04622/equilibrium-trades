import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("merges tailwind conflicts toward the last token", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});
