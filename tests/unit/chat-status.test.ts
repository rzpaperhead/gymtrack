import { describe, expect, it } from "vitest";
import { messageStatus } from "@/lib/chat-status";

const at = "2026-10-14T10:00:00Z";
const r = (delivered: string, read: string, user_id = "b") => ({ user_id, last_delivered_at: delivered, last_read_at: read });

describe("messageStatus", () => {
  it("is pending until the server accepted it", () => {
    expect(messageStatus(null, [], true)).toBe("pending");
  });
  it("one tick when not yet on the recipient's device", () => {
    expect(messageStatus(at, [r("2026-10-14T09:00:00Z", "2026-10-14T09:00:00Z")])).toBe("sent");
  });
  it("two grey ticks when delivered", () => {
    expect(messageStatus(at, [r("2026-10-14T10:00:05Z", "2026-10-14T09:00:00Z")])).toBe("delivered");
  });
  it("two blue ticks when read", () => {
    expect(messageStatus(at, [r("2026-10-14T10:01:00Z", "2026-10-14T10:01:00Z")])).toBe("read");
  });
  it("groups need every member", () => {
    const rs = [r("2026-10-14T10:01:00Z", "2026-10-14T10:01:00Z", "b"), r("2026-10-14T10:01:00Z", "2026-10-14T09:00:00Z", "c")];
    expect(messageStatus(at, rs)).toBe("delivered");
    rs.push(r("2026-10-14T09:00:00Z", "2026-10-14T09:00:00Z", "d"));
    expect(messageStatus(at, rs)).toBe("sent");
  });
});
