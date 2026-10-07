import { z } from "zod";

export const QuerySpecSchema = z.object({
  entity: z.literal("tickets"),
  operation: z.enum(["list", "count"]).default("list"),
  filters: z.array(
    z.object({
      field: z.enum([
        "id",
        "title",
        "status",
        "priority",
        "category",
        "customer",
        "created_at",
        "resolution_minutes"
      ]),
      operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
      value: z.union([z.string(), z.number()])
    })
  ).default([]),
  sort: z.array(
    z.object({
      field: z.enum(["created_at", "priority", "customer", "resolution_minutes"]),
      direction: z.enum(["asc", "desc"])
    })
  ).default([]),
  limit: z.number().int().min(1).default(20)
});

export function validateQuerySpec(raw) {
  return QuerySpecSchema.parse(raw);
}
