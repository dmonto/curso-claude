import { Injectable } from "@angular/core";
import { AssistantFrontendContext } from "./assistant.types";

export interface AssistantPromptSuggestion {
  label: string;
  prompt: string;
  intent: "summarize" | "missing_data" | "draft" | "explain" | "general";
}

export interface AssistantUxHint {
  title: string;
  description: string;
  severity: "info" | "warning";
}

@Injectable({
  providedIn: "root"
})
export class AssistantUxPolicyService {
  getPromptSuggestions(context: AssistantFrontendContext): AssistantPromptSuggestion[] {
    if (context.entity?.type === "ticket") {
      return [
        {
          label: "Resumir ticket",
          prompt: "Resume este ticket en pocas líneas",
          intent: "summarize"
        },
        {
          label: "Datos pendientes",
          prompt: "Dime qué datos faltan para escalar este ticket",
          intent: "missing_data"
        },
        {
          label: "Respuesta soporte",
          prompt: "Prepara una respuesta para soporte explicando la situación",
          intent: "draft"
        },
        {
          label: "Riesgos",
          prompt: "Explica los riesgos de esta incidencia",
          intent: "explain"
        }
      ];
    }

    return [
      {
        label: "Qué puedo hacer",
        prompt: "¿Qué puedo hacer en esta pantalla?",
        intent: "general"
      },
      {
        label: "Resumir vista",
        prompt: "Resume esta vista",
        intent: "summarize"
      },
      {
        label: "Explicar opciones",
        prompt: "Explícame las opciones disponibles",
        intent: "explain"
      }
    ];
  }

  getContextHint(context: AssistantFrontendContext): AssistantUxHint {
    if (context.entity?.type === "ticket") {
      return {
        title: `Trabajando sobre ${context.entity.type} ${context.entity.id}`,
        description: "El asistente usará este contexto como pista. El backend validará permisos y recuperará datos autorizados.",
        severity: "info"
      };
    }

    return {
      title: "Sin entidad activa",
      description: "Puedes hacer preguntas generales, pero serán menos precisas si no hay una entidad de negocio activa.",
      severity: "warning"
    };
  }

  shouldShowTechnicalMeta(): boolean {
    return true;
  }
}
