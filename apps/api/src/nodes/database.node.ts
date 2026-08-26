import { prisma } from "../lib/prisma";
import { resolveTemplate } from "../utils/template";
import { registerNode } from "./registry";
import { nodeError } from "./errors";

/**
 * Allow-list of tables the Database node may operate on, mapped to Prisma
 * model delegates. This deliberately prevents arbitrary SQL or access to
 * internal tables (users, workflows, executions).
 */
const ALLOWED_TABLES: Record<string, { model: "lead"; fields: string[] }> = {
  lead: {
    model: "lead",
    fields: ["email", "name", "company", "status", "source"],
  },
  leads: {
    model: "lead",
    fields: ["email", "name", "company", "status", "source"],
  },
};

const OPERATIONS = ["insert", "update", "upsert", "delete"];

export function registerDatabaseNode(): void {
  registerNode({
    schema: {
      type: "database",
      category: "action",
      label: "Database Operation",
      description: "Performs a safe, allow-listed database operation (insert, update, upsert, delete).",
      icon: "database",
      color: "#2dd4bf",
      outputAliases: ["database"],
      defaultConfig: {
        operation: "insert",
        table: "lead",
        data: { email: "{{webhook.email}}", name: "{{webhook.name}}" },
        where: { email: "{{webhook.email}}" },
      },
      configFields: [
        {
          name: "operation",
          label: "Operation",
          type: "select",
          options: OPERATIONS.map((op) => ({ label: op, value: op })),
          default: "insert",
        },
        {
          name: "table",
          label: "Table",
          type: "select",
          options: [
            { label: "Lead", value: "lead" },
          ],
          default: "lead",
          help: "Only allow-listed tables are available.",
        },
        {
          name: "data",
          label: "Data",
          type: "object",
          help: "Field values. Supports {{variables}}.",
          default: {},
        },
        {
          name: "where",
          label: "Where (for update/delete)",
          type: "object",
          help: "Match condition, e.g. email. Supports {{variables}}.",
          default: {},
        },
      ],
    },
    handler: async (ctx) => {
      const operation = String(ctx.node.config.operation ?? "insert");
      const table = String(ctx.node.config.table ?? "lead").toLowerCase();
      const entry = ALLOWED_TABLES[table];
      if (!entry) {
        throw nodeError(`Table "${table}" is not allowed`, { code: "DB_TABLE_NOT_ALLOWED" });
      }
      if (!OPERATIONS.includes(operation)) {
        throw nodeError(`Unknown operation: ${operation}`, { code: "DB_BAD_OPERATION" });
      }

      const resolveFields = (obj: unknown): Record<string, unknown> => {
        const resolved = resolveTemplate(obj ?? {}, ctx.context);
        if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
          throw nodeError("Database node data must be an object", { code: "DB_BAD_DATA" });
        }
        return resolved as Record<string, unknown>;
      };

      const data = resolveFields(ctx.node.config.data);
      const where = resolveFields(ctx.node.config.where ?? {});

      // Only allow known fields for the model — prevents Prisma errors and surprises.
      const sanitize = (obj: Record<string, unknown>): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (entry.fields.includes(k)) out[k] = v;
        }
        return out;
      };

      let result: unknown;
      let count = 0;

      switch (operation) {
        case "insert": {
          const record = await (prisma as any)[entry.model].create({ data: sanitize(data) });
          result = record;
          count = 1;
          break;
        }
        case "update": {
          if (Object.keys(sanitize(where)).length === 0) {
            throw nodeError("Update operation requires a where clause", { code: "DB_NO_WHERE" });
          }
          const res = await (prisma as any)[entry.model].updateMany({
            where: sanitize(where),
            data: sanitize(data),
          });
          count = res.count;
          result = { count };
          break;
        }
        case "upsert": {
          if (Object.keys(sanitize(where)).length === 0) {
            throw nodeError("Upsert operation requires a where clause", { code: "DB_NO_WHERE" });
          }
          const record = await (prisma as any)[entry.model].upsert({
            where: sanitize(where),
            update: sanitize(data),
            create: sanitize(data),
          });
          result = record;
          count = 1;
          break;
        }
        case "delete": {
          if (Object.keys(sanitize(where)).length === 0) {
            throw nodeError("Delete operation requires a where clause", { code: "DB_NO_WHERE" });
          }
          const res = await (prisma as any)[entry.model].deleteMany({ where: sanitize(where) });
          count = res.count;
          result = { count };
          break;
        }
      }

      await ctx.log("info", `Database ${operation} on ${entry.model} (${count} row${count === 1 ? "" : "s"})`);
      return { operation, table: entry.model, count, result };
    },
  });
}
