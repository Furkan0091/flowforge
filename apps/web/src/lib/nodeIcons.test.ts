import { describe, it, expect } from "vitest";
import { nodeIcon, NODE_ICONS, NODE_STATUS_ICONS, NODE_STATUS_COLORS } from "./nodeIcons";
import { Webhook, Circle, CheckCircle2 } from "lucide-react";

describe("nodeIcon", () => {
  it("returns the mapped icon for known types", () => {
    expect(nodeIcon("webhook")).toBe(Webhook);
    expect(NODE_ICONS["git-branch"]).toBeDefined();
  });

  it("falls back to Circle for unknown types", () => {
    expect(nodeIcon("does_not_exist")).toBe(Circle);
  });
});

describe("node status visuals", () => {
  it("maps every run status to an icon and color", () => {
    for (const status of ["idle", "queued", "running", "success", "failed", "skipped"]) {
      expect(NODE_STATUS_ICONS[status]).toBeDefined();
      expect(NODE_STATUS_COLORS[status]).toContain("text-");
    }
    expect(NODE_STATUS_ICONS.success).toBe(CheckCircle2);
  });
});
