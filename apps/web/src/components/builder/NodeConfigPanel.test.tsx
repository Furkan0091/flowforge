import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NodeConfigPanel } from "./NodeConfigPanel";
import type { BuilderNodeData } from "./builderTypes";
import type { NodeTypeSchema } from "../../lib/types";

const schema: NodeTypeSchema = {
  type: "condition",
  category: "logic",
  label: "Condition",
  description: "Evaluates a variable against an operator.",
  icon: "git-branch",
  color: "#fbbf24",
  outputAliases: [],
  branchHandles: ["true", "false"],
  defaultConfig: { variable: "", operator: "contains", value: "" },
  configFields: [
    {
      name: "variable",
      label: "Variable",
      type: "text",
      placeholder: "e.g. webhook.email",
      default: "",
    },
    {
      name: "operator",
      label: "Operator",
      type: "select",
      options: [
        { label: "contains", value: "contains" },
        { label: "equals", value: "equals" },
      ],
      default: "contains",
    },
  ],
};

const node: BuilderNodeData & { id: string } = {
  id: "n1",
  label: "Check Email",
  type: "condition",
  category: "logic",
  color: "#fbbf24",
  icon: "git-branch",
  config: { variable: "", operator: "contains", value: "" },
};

describe("NodeConfigPanel", () => {
  it("renders the schema description and fields", () => {
    render(
      <NodeConfigPanel
        node={node}
        schema={schema}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Evaluates a variable against an operator.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. webhook.email")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("contains");
    expect(screen.getByRole("button", { name: /delete node/i })).toBeInTheDocument();
  });

  it("pushes label changes on blur", async () => {
    const onUpdate = vi.fn();
    render(
      <NodeConfigPanel
        node={node}
        schema={schema}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const labelInput = screen.getByDisplayValue("Check Email");
    await userEvent.clear(labelInput);
    await userEvent.type(labelInput, "Verify Email");
    await userEvent.tab();

    expect(onUpdate).toHaveBeenCalledWith({ label: "Verify Email" });
  });

  it("pushes config changes while typing", async () => {
    const onUpdate = vi.fn();
    render(
      <NodeConfigPanel
        node={node}
        schema={schema}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. webhook.email"), {
      target: { value: "manual.email" },
    });

    expect(onUpdate).toHaveBeenCalledWith({
      config: { variable: "manual.email", operator: "contains", value: "" },
    });
  });
});
