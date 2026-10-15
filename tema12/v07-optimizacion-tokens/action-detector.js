export function detectAction(message) {
  const text = message.toLowerCase();
  if (/sí,? confirmo|confirmo/.test(text)) return { type: 'confirm' };
  if (/cierra|cerrar|ciérralo|cerrarlo/.test(text)) return { type: 'close_ticket' };
  if (/añade una nota|agrega una nota|registra una nota|añadir nota|agregar nota/.test(text)) {
    const noteText = message.replace(/añade una nota diciendo que/i,'').replace(/agrega una nota diciendo que/i,'').replace(/registra una nota diciendo que/i,'').replace(/añade una nota/i,'').replace(/agrega una nota/i,'').replace(/registra una nota/i,'').trim();
    return { type: 'add_ticket_note', noteText: noteText || 'Nota añadida desde el asistente.' };
  }
  return { type: 'none' };
}
