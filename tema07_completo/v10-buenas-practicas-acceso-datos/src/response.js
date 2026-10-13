export function buildAnalysisResponse({ requestId, startedAt, question, analysisType, contract, answer, data, evidence, criteria, limitations, precisionReport }) {
  return {
    question,
    answer: precisionReport.safeAnswer,
    data,
    evidence,
    criteria,
    limitations,
    precisionReport,
    audit: {
      requestId,
      analysisType,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      contract
    }
  };
}
