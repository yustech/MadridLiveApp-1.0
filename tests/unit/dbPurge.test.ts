import { describe, expect, it } from "vitest";
import {
  PURGE_COLLECTION_KEYS as CLIENT_KEYS,
  PURGE_COLLECTION_OPTIONS,
  PURGE_CONFIRM_WORD,
  canConfirmPurge,
} from "../../src/utils/dbPurge";
import { PURGE_COLLECTION_KEYS as SERVER_KEYS } from "../../server/mysql/purge";

describe("canConfirmPurge", () => {
  it("requires at least one selected collection", () => {
    expect(canConfirmPurge([], PURGE_CONFIRM_WORD)).toBe(false);
    expect(canConfirmPurge(["staff"], PURGE_CONFIRM_WORD)).toBe(true);
  });

  it("requires the exact confirmation word (trimmed, case-sensitive)", () => {
    expect(canConfirmPurge(["staff"], "  VACIAR  ")).toBe(true);
    expect(canConfirmPurge(["staff"], "vaciar")).toBe(false);
    expect(canConfirmPurge(["staff"], "VACIA")).toBe(false);
    expect(canConfirmPurge(["staff"], "")).toBe(false);
  });
});

describe("client/server collection parity", () => {
  it("exposes the same collection keys the server allows", () => {
    expect([...CLIENT_KEYS].sort()).toEqual([...SERVER_KEYS].sort());
  });

  it("never offers users or schema_migrations as a purge option", () => {
    const keys = PURGE_COLLECTION_OPTIONS.map((option) => option.key);
    expect(keys).not.toContain("users");
    expect(keys).not.toContain("schema_migrations");
  });
});
