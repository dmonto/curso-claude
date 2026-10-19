export function estimateTokens(text) { return Math.ceil(String(text || '').length / 4); }
export function clipText(text, maxChars) { text = String(text || ''); return text.length <= maxChars ? text : text.slice(0, maxChars) + '\n...[recortado por presupuesto de contexto]'; }
export function compactJson(value) { return JSON.stringify(value, (_k, v) => { if (v === null || v === undefined) return undefined; if (typeof v === 'string' && v.trim() === '') return undefined; if (Array.isArray(v) && v.length === 0) return undefined; return v; }); }
export function buildContextWithBudget(sections, maxTokensApprox) {
  const order = { required: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...sections].sort((a,b) => order[a.priority] - order[b.priority]);
  const includedSections = [], excludedSections = [], sectionTokens = {};
  let estimatedTokens = 0, text = '';
  for (const section of sorted) {
    const block = `\n### ${section.name}\n${section.content}\n`;
    const tokens = estimateTokens(block); sectionTokens[section.name] = tokens;
    if (section.priority === 'required' || estimatedTokens + tokens <= maxTokensApprox) { text += block; estimatedTokens += tokens; includedSections.push(section.name); }
    else excludedSections.push(section.name);
  }
  return { text, includedSections, excludedSections, estimatedTokens, sectionTokens };
}
