const customers = [
  {
    userId: "user-001",
    name: "Laura",
    customerType: "standard",
    preferredLanguage: "es-ES",
    supportLevel: "normal",
    sensitiveNotes: "No enviar al modelo"
  },
  {
    userId: "user-limited",
    name: "Mario",
    customerType: "standard",
    preferredLanguage: "es-ES",
    supportLevel: "normal",
    sensitiveNotes: "No enviar al modelo"
  }
];

export function getBasicCustomerProfile(userId) {
  const customer = customers.find((item) => item.userId === userId);

  if (!customer) {
    return null;
  }

  return {
    userId: customer.userId,
    name: customer.name,
    customerType: customer.customerType,
    preferredLanguage: customer.preferredLanguage,
    supportLevel: customer.supportLevel
  };
}
