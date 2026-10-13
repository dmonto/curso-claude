export function seedData() {
  return {
    orders: [
      { id: '1842', customerId: 'C001', customerName: 'María López', status: 'preparing', amount: 89.5, canCancel: true, canChangeAddress: true, deliveryAddress: 'Calle Mayor 10, Madrid', tenantId: 'demo', version: 1 },
      { id: '1843', customerId: 'C002', customerName: 'Carlos Ruiz', status: 'shipped', amount: 42, canCancel: false, canChangeAddress: false, deliveryAddress: 'Avenida del Puerto 5, Valencia', tenantId: 'demo', version: 1 },
      { id: '1844', customerId: 'C001', customerName: 'María López', status: 'preparing', amount: 35, canCancel: true, canChangeAddress: true, deliveryAddress: 'Calle Mayor 10, Madrid', tenantId: 'demo', version: 1 },
      { id: '1845', customerId: 'C003', customerName: 'Ana Torres', status: 'preparing', amount: 250, canCancel: true, canChangeAddress: true, deliveryAddress: 'Calle Alcalá 25, Madrid', tenantId: 'demo', version: 1 },
      { id: '1846', customerId: 'C003', customerName: 'Ana Torres', status: 'shipped', amount: 180, canCancel: false, canChangeAddress: false, deliveryAddress: 'Calle Alcalá 25, Madrid', tenantId: 'demo', version: 1 }
    ],
    shipments: [
      { orderId: '1842', status: 'not_dispatched', delayed: false, carrier: 'DHL', trackingCode: null, estimatedDeliveryDate: null },
      { orderId: '1843', status: 'delayed', delayed: true, carrier: 'SEUR', trackingCode: 'SEUR-1843', estimatedDeliveryDate: '2026-09-25' },
      { orderId: '1844', status: 'not_dispatched', delayed: false, carrier: 'DHL', trackingCode: null, estimatedDeliveryDate: null },
      { orderId: '1845', status: 'not_dispatched', delayed: false, carrier: 'DHL', trackingCode: null, estimatedDeliveryDate: null },
      { orderId: '1846', status: 'delayed', delayed: true, carrier: 'SEUR', trackingCode: 'SEUR-1846', estimatedDeliveryDate: '2026-09-25' }
    ],
    customers: [
      { customerId: 'C001', name: 'María López', tier: 'gold', canReceivePrioritySupport: true },
      { customerId: 'C002', name: 'Carlos Ruiz', tier: 'standard', canReceivePrioritySupport: false },
      { customerId: 'C003', name: 'Ana Torres', tier: 'vip', canReceivePrioritySupport: true }
    ],
    tickets: [], notifications: [], approvals: [], operations: {}
  };
}
