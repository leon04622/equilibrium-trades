import { describe, expect, it } from "vitest";
import { crmUsersToCsv, escapeCsvCell } from "./csv-export";

describe("escapeCsvCell", () => {
  it("leaves simple text unchanged", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("quotes and escapes double quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes fields with commas or newlines", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("crmUsersToCsv", () => {
  it("writes header and one row", () => {
    const csv = crmUsersToCsv([
      {
        wallet: "0xabc",
        email: "u@x.com",
        referralWallet: null,
        joinDate: "2024-01-01",
        subTier: "Pro",
        status: "active",
        manualProOverride: false,
        builderStatus: "ok",
      },
    ]);
    expect(
      csv.startsWith("wallet,email,referralWallet,joinDate,subTier,status,manualProOverride,builderStatus"),
    ).toBe(true);
    expect(csv).toContain("0xabc");
    expect(csv).toContain("u@x.com");
  });
});
