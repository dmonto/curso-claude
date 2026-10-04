export function getUserContext(userId) {
  const users = {
    "user-001": {
      userId: "user-001",
      name: "Laura",
      role: "cliente",
      permissions: ["read_orders", "read_tickets", "create_tickets"],
      currentPage: "orders"
    },
    "user-limited": {
      userId: "user-limited",
      name: "Mario",
      role: "cliente",
      permissions: ["read_orders"],
      currentPage: "orders"
    }
  };

  return users[userId] ?? null;
}

export function serializeUserContextForClient(userContext) {
  if (!userContext) {
    return null;
  }

  return {
    userId: userContext.userId,
    name: userContext.name,
    role: userContext.role,
    currentPage: userContext.currentPage,
    permissions: userContext.permissions
  };
}
