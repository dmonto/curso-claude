export function summarizeQuestionExecution(plan, executionResults) {
  if (plan.needsClarification) {
    return plan.clarificationQuestion;
  }

  const parts = [];

  for (const item of executionResults) {
    const { description } = item.step;

    if (item.resultType === "records") {
      parts.push(`${description}: he encontrado ${item.rows.length} registro(s) en ${item.step.table}.`);
    }

    if (item.resultType === "documents") {
      if (item.rows.length === 0) {
        parts.push(`${description}: no he encontrado documentos relacionados.`);
      } else {
        parts.push(`${description}: he encontrado ${item.rows.length} documento(s): ${item.rows.map((row) => row.title).join(", ")}.`);
      }
    }

    if (item.resultType === "group_comparison") {
      if (item.rows.length === 0) {
        parts.push(`${description}: no hay datos suficientes para comparar.`);
      } else {
        const top = item.rows[0];
        parts.push(`${description}: el grupo con más registros es "${top.group_name}", con ${top.total}.`);
      }
    }

    if (item.resultType === "customer_exposure") {
      if (item.rows.length === 0) {
        parts.push(`${description}: no hay clientes que cumplan las condiciones.`);
      } else {
        const top = item.rows[0];
        parts.push(`${description}: he encontrado ${item.rows.length} cliente(s); el de mayor exposición es ${top.name} (${top.exposure} EUR pendientes).`);
      }
    }
  }

  if (parts.length === 0) {
    return "No he encontrado información suficiente para responder con los datos disponibles.";
  }

  return parts.join(" ");
}
