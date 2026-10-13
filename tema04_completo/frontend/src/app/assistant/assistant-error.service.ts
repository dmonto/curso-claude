import { HttpErrorResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { TimeoutError } from "rxjs";
import { AssistantClientError } from "./assistant.types";

@Injectable({
  providedIn: "root"
})
export class AssistantErrorService {
  fromError(error: unknown): AssistantClientError {
    if (error instanceof TimeoutError) {
      return this.fromTimeout();
    }

    if (error instanceof HttpErrorResponse) {
      return this.fromHttpError(error);
    }

    if (this.looksLikeAssistantClientError(error)) {
      return error;
    }

    return {
      kind: "unknown",
      title: "Error inesperado",
      message: "Se ha producido un error no controlado en el asistente.",
      retryable: true,
      technicalDetail: String(error)
    };
  }

  fromHttpError(error: HttpErrorResponse): AssistantClientError {
    const body = this.safeBody(error);
    const correlationId = body?.correlationId || error.headers?.get("x-correlation-id") || undefined;
    const requestId = body?.requestId || error.headers?.get("request-id") || undefined;

    if (error.status === 0) {
      return {
        kind: "network",
        title: "No se pudo contactar con el asistente",
        message: "El backend no responde o hay un problema de red.",
        retryable: true,
        correlationId,
        requestId,
        statusCode: error.status
      };
    }

    if (error.status === 403) {
      return {
        kind: "forbidden",
        title: "No tienes permisos suficientes",
        message: "El asistente no puede consultar esta información con tus permisos actuales.",
        retryable: false,
        correlationId,
        requestId,
        statusCode: error.status
      };
    }

    if (error.status === 429) {
      return {
        kind: "rate_limited",
        title: "Demasiadas solicitudes",
        message: "Espera unos segundos antes de volver a enviar otro mensaje.",
        retryable: true,
        correlationId,
        requestId,
        statusCode: error.status
      };
    }

    if (error.status >= 500) {
      return {
        kind: "backend",
        title: "Error temporal del asistente",
        message: "No se ha podido completar la respuesta. Puedes intentarlo de nuevo.",
        retryable: true,
        correlationId,
        requestId,
        statusCode: error.status
      };
    }

    return {
      kind: "backend",
      title: "Error del asistente",
      message: body?.message || "El asistente no ha podido completar la operación.",
      retryable: true,
      correlationId,
      requestId,
      statusCode: error.status
    };
  }

  fromTimeout(): AssistantClientError {
    return {
      kind: "timeout",
      title: "La respuesta está tardando demasiado",
      message: "El asistente no ha completado la operación dentro del tiempo esperado.",
      retryable: true
    };
  }

  fromBadResponse(detail: string): AssistantClientError {
    return {
      kind: "bad_response",
      title: "Respuesta no válida",
      message: "El backend devolvió una respuesta que el cliente no puede representar correctamente.",
      retryable: true,
      technicalDetail: detail
    };
  }

  fromSse(message: string, correlationId?: string): AssistantClientError {
    return {
      kind: "sse",
      title: "Error en streaming",
      message,
      retryable: true,
      correlationId
    };
  }

  private safeBody(error: HttpErrorResponse): any {
    if (!error.error) {
      return null;
    }

    if (typeof error.error === "object") {
      return error.error;
    }

    try {
      return JSON.parse(error.error);
    } catch {
      return null;
    }
  }

  private looksLikeAssistantClientError(error: unknown): error is AssistantClientError {
    return Boolean(
      error &&
      typeof error === "object" &&
      "kind" in error &&
      "title" in error &&
      "message" in error &&
      "retryable" in error
    );
  }
}
