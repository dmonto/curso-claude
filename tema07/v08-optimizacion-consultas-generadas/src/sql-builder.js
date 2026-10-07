export function buildSql(querySpec) {
  const params = [];

  const selectClause = querySpec.operation === "count"
    ? "COUNT(*) AS total"
    : "id, title, status, priority, category, customer, created_at, resolution_minutes";

  let sql = `SELECT ${selectClause} FROM tickets`;

  if (querySpec.filters.length > 0) {
    const whereParts = querySpec.filters.map((filter) => {
      if (filter.operator === "contains") {
        params.push(`%${filter.value}%`);
        return `${filter.field} LIKE ?`;
      }

      params.push(filter.value);
      return `${filter.field} ${filter.operator} ?`;
    });

    sql += ` WHERE ${whereParts.join(" AND ")}`;
  }

  if (querySpec.operation === "list" && querySpec.sort.length > 0) {
    const orderParts = querySpec.sort.map(
      (sort) => `${sort.field} ${sort.direction.toUpperCase()}`
    );
    sql += ` ORDER BY ${orderParts.join(", ")}`;
  }

  if (querySpec.operation === "list") {
    sql += " LIMIT ?";
    params.push(querySpec.limit);
  }

  return { sql, params };
}
