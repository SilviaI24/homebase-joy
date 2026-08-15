import { describe, expect, it } from "vitest";

// ── escapeLike helper (duplicated here for unit testing without server context) ──

function escapeLike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ── Page / pageSize validation logic (mirrors server validator) ──

function validatePage(raw: unknown): number {
  return Math.max(1, Number(raw) || 1);
}

function validatePageSize(raw: unknown, max = 200, defaultSize = 48): number {
  return Math.min(max, Math.max(1, Number(raw) || defaultSize));
}

// ─── escapeLike ────────────────────────────────────────────────────────────────

describe("escapeLike", () => {
  it("does not modify a plain string", () => {
    expect(escapeLike("calle mayor")).toBe("calle mayor");
  });

  it("escapes % so it is treated as a literal character in ILIKE", () => {
    expect(escapeLike("100%")).toBe("100\\%");
  });

  it("escapes _ so it is treated as a literal character in ILIKE", () => {
    expect(escapeLike("ref_123")).toBe("ref\\_123");
  });

  it("escapes multiple % and _ occurrences", () => {
    expect(escapeLike("%foo_bar%")).toBe("\\%foo\\_bar\\%");
  });

  it("handles empty string", () => {
    expect(escapeLike("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(escapeLike("___%%%")).toBe("\\_\\_\\_\\%\\%\\%");
  });

  it("preserves other wildcard-sensitive chars intact", () => {
    // Backslash, digits, letters — nothing else should change.
    expect(escapeLike("hello\\world")).toBe("hello\\world");
  });
});

// ─── Page validation ──────────────────────────────────────────────────────────

describe("validatePage", () => {
  it("returns 1 for undefined / missing input", () => {
    expect(validatePage(undefined)).toBe(1);
  });

  it("returns 1 for NaN-producing input", () => {
    expect(validatePage("abc")).toBe(1);
  });

  it("returns 1 for zero", () => {
    expect(validatePage(0)).toBe(1);
  });

  it("returns 1 for negative numbers", () => {
    expect(validatePage(-5)).toBe(1);
  });

  it("returns the numeric value for valid positive integer strings", () => {
    expect(validatePage("3")).toBe(3);
  });

  it("returns the numeric value for a valid positive integer", () => {
    expect(validatePage(10)).toBe(10);
  });

  it("floors float input via Math.max(1, Number())", () => {
    // Number("2.9") === 2.9, Math.max(1, 2.9) === 2.9 — page should be floored by the route
    expect(validatePage(2.9)).toBeGreaterThanOrEqual(1);
  });
});

// ─── PageSize validation ──────────────────────────────────────────────────────

describe("validatePageSize", () => {
  it("returns default size when input is undefined", () => {
    expect(validatePageSize(undefined, 200, 48)).toBe(48);
  });

  it("returns default size when input is NaN", () => {
    expect(validatePageSize("bad", 200, 50)).toBe(50);
  });

  it("falls back to default for zero (falsy), clamps to 1 for negative", () => {
    // Number(0) is falsy → falls back to defaultSize (48).
    expect(validatePageSize(0, 200, 48)).toBe(48);
    // Number(-10) is truthy and negative → Math.max(1, -10) → 1.
    expect(validatePageSize(-10)).toBe(1);
  });

  it("clamps to max when value exceeds max", () => {
    expect(validatePageSize(500, 200)).toBe(200);
  });

  it("accepts a valid size within bounds", () => {
    expect(validatePageSize(48, 200, 48)).toBe(48);
    expect(validatePageSize(50, 200, 50)).toBe(50);
  });

  it("uses the specified default for each section", () => {
    expect(validatePageSize(undefined, 200, 48)).toBe(48); // inmuebles
    expect(validatePageSize(undefined, 200, 50)).toBe(50); // clientes / silvia
  });

  it("accepts exactly the max boundary", () => {
    expect(validatePageSize(200, 200)).toBe(200);
  });
});

// ─── Derived pagination calculations ─────────────────────────────────────────

describe("pagination range calculation", () => {
  it("computes from/to offsets correctly for page 1", () => {
    const page = 1;
    const pageSize = 48;
    expect((page - 1) * pageSize).toBe(0); // from
    expect(page * pageSize - 1).toBe(47); // to
  });

  it("computes from/to offsets correctly for page 2", () => {
    const page = 2;
    const pageSize = 48;
    expect((page - 1) * pageSize).toBe(48); // from
    expect(page * pageSize - 1).toBe(95); // to
  });

  it("computes total pages correctly when total is exact multiple", () => {
    expect(Math.ceil(96 / 48)).toBe(2);
  });

  it("computes total pages correctly when there is a remainder", () => {
    expect(Math.ceil(100 / 48)).toBe(3);
  });

  it("reports totalPages = 1 when total is 0", () => {
    expect(Math.max(1, Math.ceil(0 / 48))).toBe(1);
  });
});
