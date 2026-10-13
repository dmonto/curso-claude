import { Injectable, computed, inject, signal } from "@angular/core";
import { NavigationStart, Router } from "@angular/router";
import { filter } from "rxjs";
import { AssistantFrontendContext } from "./assistant.types";

type PageContextPatch = Partial<Omit<AssistantFrontendContext, "route" | "client">>;

@Injectable({
  providedIn: "root"
})
export class AssistantContextService {
  private readonly router = inject(Router);

  private readonly pageContext = signal<PageContextPatch>({});

  readonly context = computed<AssistantFrontendContext>(() => ({
    route: this.router.url,
    ...this.sanitizePageContext(this.pageContext()),
    client: {
      locale: navigator.language || "es-ES",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      appVersion: "1.0.0"
    }
  }));

  constructor() {
    this.router.events
      .pipe(filter(event => event instanceof NavigationStart))
      .subscribe(() => this.clearPageContext());
  }

  setPageContext(context: PageContextPatch): void {
    this.pageContext.set(this.sanitizePageContext(context));
  }

  patchPageContext(context: PageContextPatch): void {
    this.pageContext.update(current => this.sanitizePageContext({ ...current, ...context }));
  }

  clearPageContext(): void {
    this.pageContext.set({});
  }

  buildContextForRequest(): AssistantFrontendContext {
    return this.context();
  }

  private sanitizePageContext(context: PageContextPatch): PageContextPatch {
    const sanitized: PageContextPatch = { ...context };

    if (sanitized.entity?.id) {
      sanitized.entity = {
        type: String(sanitized.entity.type).slice(0, 40),
        id: String(sanitized.entity.id).slice(0, 80),
        label: sanitized.entity.label ? String(sanitized.entity.label).slice(0, 120) : undefined
      };
    }

    if (sanitized.selection?.selectedIds) {
      sanitized.selection = {
        ...sanitized.selection,
        selectedIds: sanitized.selection.selectedIds
          .slice(0, 20)
          .map(id => String(id).slice(0, 80))
      };
    }

    return sanitized;
  }
}
