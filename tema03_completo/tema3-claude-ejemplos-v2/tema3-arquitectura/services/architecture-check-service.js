import { assistantConfig } from "./assistant-config.js";

export function getArchitectureChecks() {
  const checks = [
    {
      id: "backend_proxy",
      name: "El frontend no llama directamente al modelo",
      status: assistantConfig.architecture.usesBackendProxy ? "ok" : "warning",
      detail: "Las llamadas al modelo deben pasar por el backend."
    },
    {
      id: "session_validation",
      name: "Validación de sesión obligatoria",
      status: assistantConfig.architecture.requiresSessionValidation ? "ok" : "warning",
      detail: "Cada mensaje debe validar sessionId y userId."
    },
    {
      id: "action_confirmation",
      name: "Confirmación de acciones sensibles",
      status: assistantConfig.architecture.requiresActionConfirmation ? "ok" : "warning",
      detail: "Las acciones reales deben pasar por pendingAction y confirmación."
    },
    {
      id: "audit_events",
      name: "Auditoría de interacciones y acciones",
      status: assistantConfig.architecture.requiresAuditEvents ? "ok" : "warning",
      detail: "Debe existir trazabilidad de mensajes, acciones y errores."
    },
    {
      id: "context_minimization",
      name: "Minimización de contexto",
      status: assistantConfig.architecture.contextMustBeMinimized ? "ok" : "warning",
      detail: "El modelo debe recibir solo datos necesarios y autorizados."
    },
    {
      id: "model_api_key",
      name: "API key del modelo configurada o modo mock activo",
      status: process.env.ANTHROPIC_API_KEY || process.env.USE_MOCK_MODEL !== "false" ? "ok" : "error",
      detail: process.env.ANTHROPIC_API_KEY
        ? "La variable ANTHROPIC_API_KEY está presente."
        : "No hay API key, pero el modo mock permite ejecutar el laboratorio."
    }
  ];

  const hasError = checks.some((check) => check.status === "error");
  const hasWarning = checks.some((check) => check.status === "warning");

  return {
    status: hasError ? "error" : hasWarning ? "warning" : "ok",
    checks
  };
}
