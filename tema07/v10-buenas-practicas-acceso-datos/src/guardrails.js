const blockedTerms = [
  "emails",
  "email",
  "tokens",
  "token",
  "contraseñas",
  "passwords",
  "secretos",
  "usuarios internos",
  "notas internas"
];

export function detectBlockedRequest(question) {
  const q = String(question || "").toLowerCase();
  return blockedTerms.find((term) => q.includes(term)) || null;
}
