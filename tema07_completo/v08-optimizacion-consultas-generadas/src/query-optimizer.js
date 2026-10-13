const indexedFields = new Set(["status", "priority", "category", "customer", "created_at"]);

export function optimizeQuerySpec(querySpec) {
  const warnings = [];
  const optimized = structuredClone(querySpec);

  if (optimized.limit > 50) {
    warnings.push("El límite se ha reducido a 50 para evitar consultas demasiado grandes.");
    optimized.limit = 50;
  }

  for (const filter of optimized.filters) {
    if (!indexedFields.has(filter.field)) {
      warnings.push(`El filtro sobre ${filter.field} puede ser menos eficiente porque no tiene índice.`);
    }
  }

  if (optimized.sort.length === 0 && optimized.operation === "list") {
    optimized.sort.push({ field: "created_at", direction: "desc" });
    warnings.push("Se ha añadido ordenación por created_at desc para obtener resultados estables.");
  }

  return { optimized, warnings };
}

export function explainQueryPlan(db, sql, params) {
  const planRows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
  return planRows.map((row) => ({ id: row.id, parent: row.parent, detail: row.detail }));
}
