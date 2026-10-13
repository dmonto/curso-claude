export const orders = [
  {
    id: "PED-2026-001",
    customerId: "CLI-001",
    customer: "Marta López",
    city: "Madrid",
    status: "retrasado",
    total: 84.5,
    channel: "web",
    category: "electrónica",
    priority: "media",
    createdAt: "2026-09-10",
    eta: "2026-09-28",
    canCancel: true
  },
  {
    id: "PED-2026-002",
    customerId: "CLI-002",
    customer: "Carlos Ruiz",
    city: "Valencia",
    status: "entregado",
    total: 249.9,
    channel: "tienda",
    category: "hogar",
    priority: "baja",
    createdAt: "2026-09-08",
    eta: "2026-09-15",
    canCancel: false
  },
  {
    id: "PED-2026-003",
    customerId: "CLI-003",
    customer: "Lucía Ramos",
    city: "Barcelona",
    status: "pendiente",
    total: 1290,
    channel: "web",
    category: "empresa",
    priority: "alta",
    createdAt: "2026-09-18",
    eta: "2026-10-02",
    canCancel: true
  },
  {
    id: "PED-2026-004",
    customerId: "CLI-001",
    customer: "Marta López",
    city: "Madrid",
    status: "retrasado",
    total: 315.75,
    channel: "web",
    category: "hogar",
    priority: "alta",
    createdAt: "2026-09-21",
    eta: "2026-10-04",
    canCancel: true
  },
  {
    id: "PED-2026-005",
    customerId: "CLI-004",
    customer: "Nora Fernández",
    city: "Sevilla",
    status: "cancelado",
    total: 52.2,
    channel: "partner",
    category: "electrónica",
    priority: "baja",
    createdAt: "2026-09-03",
    eta: "2026-09-12",
    canCancel: false
  }
];

export const invoices = [
  {
    id: "FAC-2026-001",
    orderId: "PED-2026-001",
    customerId: "CLI-001",
    customer: "Marta López",
    status: "vencida",
    amount: 84.5,
    dueDate: "2026-09-20",
    paidAt: null,
    risk: "medio"
  },
  {
    id: "FAC-2026-002",
    orderId: "PED-2026-002",
    customerId: "CLI-002",
    customer: "Carlos Ruiz",
    status: "pagada",
    amount: 249.9,
    dueDate: "2026-09-30",
    paidAt: "2026-09-22",
    risk: "bajo"
  },
  {
    id: "FAC-2026-003",
    orderId: "PED-2026-003",
    customerId: "CLI-003",
    customer: "Lucía Ramos",
    status: "pendiente",
    amount: 1290,
    dueDate: "2026-10-10",
    paidAt: null,
    risk: "alto"
  },
  {
    id: "FAC-2026-004",
    orderId: "PED-2026-004",
    customerId: "CLI-001",
    customer: "Marta López",
    status: "vencida",
    amount: 315.75,
    dueDate: "2026-09-27",
    paidAt: null,
    risk: "alto"
  }
];

export const tickets = [
  {
    id: "TCK-501",
    customerId: "CLI-001",
    customer: "Marta López",
    title: "Pedido retrasado y factura vencida",
    status: "abierto",
    severity: "media",
    productArea: "logística",
    createdAt: "2026-09-22",
    lastUpdate: "2026-09-25",
    description: "La clienta indica que el pedido no llega y que la factura aparece vencida."
  },
  {
    id: "TCK-502",
    customerId: "CLI-003",
    customer: "Lucía Ramos",
    title: "Importe elevado pendiente de validación",
    status: "abierto",
    severity: "alta",
    productArea: "facturación",
    createdAt: "2026-09-24",
    lastUpdate: "2026-09-25",
    description: "Factura pendiente de importe alto; requiere seguimiento antes de vencimiento."
  },
  {
    id: "TCK-503",
    customerId: "CLI-002",
    customer: "Carlos Ruiz",
    title: "Consulta sobre entrega completada",
    status: "cerrado",
    severity: "baja",
    productArea: "soporte",
    createdAt: "2026-09-12",
    lastUpdate: "2026-09-16",
    description: "Consulta informativa resuelta tras confirmar entrega."
  }
];

export const customers = [
  {
    id: "CLI-001",
    name: "Marta López",
    segment: "pyme",
    city: "Madrid",
    accountManager: "Laura",
    lifetimeValue: 2400,
    openTickets: 1,
    risk: "medio"
  },
  {
    id: "CLI-002",
    name: "Carlos Ruiz",
    segment: "particular",
    city: "Valencia",
    accountManager: "Sergio",
    lifetimeValue: 620,
    openTickets: 0,
    risk: "bajo"
  },
  {
    id: "CLI-003",
    name: "Lucía Ramos",
    segment: "empresa",
    city: "Barcelona",
    accountManager: "Laura",
    lifetimeValue: 9800,
    openTickets: 1,
    risk: "alto"
  },
  {
    id: "CLI-004",
    name: "Nora Fernández",
    segment: "particular",
    city: "Sevilla",
    accountManager: "Irene",
    lifetimeValue: 310,
    openTickets: 0,
    risk: "bajo"
  }
];

export const documents = [
  {
    id: "DOC-001",
    title: "Política de cancelaciones",
    type: "policy",
    tags: ["pedidos", "cancelación", "cliente"],
    body: "Los pedidos pendientes o retrasados pueden solicitar cancelación si todavía no han sido preparados para envío final."
  },
  {
    id: "DOC-002",
    title: "Procedimiento de facturas vencidas",
    type: "runbook",
    tags: ["facturas", "cobros", "riesgo"],
    body: "Las facturas vencidas se priorizan por importe, riesgo del cliente y existencia de tickets abiertos relacionados."
  },
  {
    id: "DOC-003",
    title: "Criterios de escalado de incidencias",
    type: "runbook",
    tags: ["tickets", "escalado", "soporte"],
    body: "Una incidencia de severidad alta o con cliente de riesgo alto debe escalarse con resumen, evidencias y propuesta de siguiente paso."
  }
];

export function allTables() {
  return {
    orders,
    invoices,
    tickets,
    customers,
    documents
  };
}
