import { allTables, customers, invoices, orders } from "./data.js";
import { normalize } from "./question-plan.js";

const ROW_LIMIT = 20;

function applyFilters(rows, filters = []) {
  return rows.filter((row) => filters.every((filter) => {
    const value = row[filter.field];
    if (filter.operator === "equals") return normalize(value) === normalize(filter.value);
    if (filter.operator === "contains") return normalize(value).includes(normalize(filter.value));
    if (filter.operator === "gt") return Number(value) > Number(filter.value);
    if (filter.operator === "gte") return Number(value) >= Number(filter.value);
    if (filter.operator === "lt") return Number(value) < Number(filter.value);
    if (filter.operator === "lte") return Number(value) <= Number(filter.value);
    if (filter.operator === "in") return filter.value.map(normalize).includes(normalize(value));
    return true;
  }));
}

function sortRows(rows, sort) {
  if (!sort?.field) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a[sort.field] < b[sort.field]) return -1 * direction;
    if (a[sort.field] > b[sort.field]) return 1 * direction;
    return 0;
  });
}

function executeRecordQuery(step) {
  const rows = applyFilters(allTables()[step.table], step.filters);
  return sortRows(rows, step.sort).slice(0, ROW_LIMIT);
}

function executeDocumentSearch(step) {
  const terms = normalize(step.query)
    .split(/[^a-z0-9ñ]+/)
    .filter((term) => term.length >= 4);

  return allTables().documents
    .map((doc) => {
      const haystack = normalize(`${doc.title} ${doc.tags.join(" ")} ${doc.body}`);
      return { doc, score: terms.filter((term) => haystack.includes(term)).length };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.doc);
}

function executeGroupComparison(step) {
  const groups = new Map();

  for (const row of applyFilters(allTables()[step.table], step.filters)) {
    const key = row[step.groupBy];
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  return [...groups.entries()]
    .map(([group_name, total]) => ({ group_name, total }))
    .sort((a, b) => b.total - a.total);
}

function executeCustomerExposure(step) {
  const selectedOrders = step.orderStatus ? applyFilters(orders, [{ field: "status", operator: "equals", value: step.orderStatus }]) : [];
  const selectedInvoices = step.invoiceStatus ? applyFilters(invoices, [{ field: "status", operator: "equals", value: step.invoiceStatus }]) : [];

  return customers
    .map((customer) => ({
      ...customer,
      delayedOrders: selectedOrders.filter((order) => order.customerId === customer.id).length,
      overdueInvoices: selectedInvoices.filter((invoice) => invoice.customerId === customer.id).length,
      exposure: invoices
        .filter((invoice) => invoice.customerId === customer.id && invoice.status !== "pagada")
        .reduce((sum, invoice) => sum + invoice.amount, 0)
    }))
    .filter((customer) => customer.delayedOrders > 0 || customer.overdueInvoices > 0)
    .sort((a, b) => b.exposure - a.exposure);
}

export function executeQuestionPlan(plan) {
  return plan.steps.map((step) => {
    if (step.type === "query_records") return { step, resultType: "records", rows: executeRecordQuery(step) };
    if (step.type === "search_documents") return { step, resultType: "documents", rows: executeDocumentSearch(step) };
    if (step.type === "compare_groups") return { step, resultType: "group_comparison", rows: executeGroupComparison(step) };
    return { step, resultType: "customer_exposure", rows: executeCustomerExposure(step) };
  });
}
