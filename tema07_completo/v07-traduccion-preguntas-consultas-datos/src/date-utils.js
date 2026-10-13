export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function resolveRelativeDate(question, now = new Date()) {
  const q = String(question || "").toLowerCase();
  const today = new Date(now);

  if (q.includes("últimos 7") || q.includes("ultimos 7")) {
    const from = new Date(today);
    from.setDate(today.getDate() - 7);
    return { createdFrom: isoDate(from), createdTo: isoDate(today), relativeDate: "last_7_days" };
  }

  if (q.includes("esta semana")) {
    const from = new Date(today);
    const day = from.getDay() || 7;
    from.setDate(from.getDate() - day + 1);
    return { createdFrom: isoDate(from), createdTo: isoDate(today), relativeDate: "this_week" };
  }

  if (q.includes("este mes")) {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { createdFrom: isoDate(from), createdTo: isoDate(today), relativeDate: "this_month" };
  }

  return { createdFrom: null, createdTo: null, relativeDate: null };
}
