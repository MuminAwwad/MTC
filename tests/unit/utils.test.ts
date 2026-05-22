import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins multiple class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "")).toBe("a");
  });

  it("supports conditional object syntax", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("merges conflicting tailwind utilities (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("preserves non-conflicting utilities", () => {
    expect(cn("text-sm", "font-bold")).toBe("text-sm font-bold");
  });

  it("flattens array inputs", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("returns empty string with no input", () => {
    expect(cn()).toBe("");
  });
});
