import { SUPPORT_TICKETS } from "../data/supportTickets.js";

const PUBLIC_TICKET_FIELDS = [
  "id",
  "service",
  "status",
  "priority",
  "title",
  "publicSummary",
  "createdAt",
];

function sanitizeTicket(ticket) {
  const sanitized = {};

  for (const field of PUBLIC_TICKET_FIELDS) {
    sanitized[field] = ticket[field];
  }

  return sanitized;
}

function applyUserScope(tickets, userContext) {
  if (userContext.userRole === "admin" || userContext.userRole === "support_agent") {
    return tickets;
  }

  return tickets.filter((ticket) => ticket.ownerUserId === userContext.userId);
}

function applyFilter(ticket, filter) {
  const actualValue = ticket[filter.field];

  if (actualValue === undefined || actualValue === null) {
    return false;
  }

  const actualText = String(actualValue).toLowerCase();
  const expectedText = String(filter.value).toLowerCase();

  if (filter.operator === "eq") {
    return actualText === expectedText;
  }

  if (filter.operator === "neq") {
    return actualText !== expectedText;
  }

  if (filter.operator === "contains") {
    return actualText.includes(expectedText);
  }

  if (filter.operator === "gte") {
    return String(actualValue) >= String(filter.value);
  }

  if (filter.operator === "lte") {
    return String(actualValue) <= String(filter.value);
  }

  return false;
}

function applySort(tickets, sort) {
  if (!sort) {
    return tickets;
  }

  return [...tickets].sort((a, b) => {
    const left = String(a[sort.field] ?? "");
    const right = String(b[sort.field] ?? "");

    if (sort.direction === "asc") {
      return left.localeCompare(right);
    }

    return right.localeCompare(left);
  });
}

function groupByField(tickets, field) {
  const groups = {};

  for (const ticket of tickets) {
    const key = ticket[field] ?? "unknown";
    groups[key] = (groups[key] ?? 0) + 1;
  }

  return Object.entries(groups).map(([value, count]) => ({
    value,
    count,
  }));
}

export function executeTicketQuerySpec(querySpec, userContext) {
  if (querySpec.queryType === "unsupported") {
    return {
      type: "unsupported",
      message: "La consulta solicitada no está soportada por este asistente.",
    };
  }

  if (querySpec.requiresClarification) {
    return {
      type: "clarification_required",
      clarificationQuestion: querySpec.clarificationQuestion,
    };
  }

  let scopedTickets = applyUserScope(SUPPORT_TICKETS, userContext);

  for (const filter of querySpec.filters ?? []) {
    scopedTickets = scopedTickets.filter((ticket) => applyFilter(ticket, filter));
  }

  if (querySpec.queryType === "count") {
    return {
      type: "count",
      count: scopedTickets.length,
    };
  }

  if (querySpec.queryType === "group_by") {
    return {
      type: "group_by",
      groupBy: querySpec.groupBy,
      groups: groupByField(scopedTickets, querySpec.groupBy),
    };
  }

  const sortedTickets = applySort(scopedTickets, querySpec.sort);
  const limitedTickets = sortedTickets.slice(0, querySpec.limit ?? 10);

  return {
    type: "list",
    totalMatched: scopedTickets.length,
    returned: limitedTickets.length,
    tickets: limitedTickets.map(sanitizeTicket),
  };
}
