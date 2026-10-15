import { z } from 'zod';

export const AppContextSchema = z.object({
  route: z.string().default('/support'),
  appArea: z.enum(['support','billing','admin']).default('support'),
  view: z.enum(['ticket_list','ticket_detail','dashboard','unknown']).default('unknown'),
  activeEntity: z.object({ type: z.enum(['ticket','customer','order','none']).default('none'), id: z.string().optional() }).default({ type: 'none' }),
  activeTab: z.string().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  selectedRows: z.array(z.string()).optional(),
  lastUiError: z.object({ code: z.string(), visibleMessage: z.string().optional(), occurredAt: z.string().optional() }).optional(),
  draftState: z.object({ hasUnsavedChanges: z.boolean().optional(), draftReply: z.string().optional() }).optional()
});

export function sanitizeAppContext(input) {
  const parsed = AppContextSchema.parse(input || {});
  return {
    route: parsed.route,
    appArea: parsed.appArea,
    view: parsed.view,
    activeEntity: parsed.activeEntity,
    activeTab: parsed.activeTab,
    filters: parsed.filters || {},
    selectedRows: (parsed.selectedRows || []).slice(0, 20),
    lastUiError: parsed.lastUiError ? { ...parsed.lastUiError, visibleMessage: parsed.lastUiError.visibleMessage?.slice(0, 300) } : undefined,
    draftState: parsed.draftState ? { hasUnsavedChanges: Boolean(parsed.draftState.hasUnsavedChanges), draftReply: parsed.draftState.draftReply?.slice(0, 1200) } : { hasUnsavedChanges: false }
  };
}

export function reduceAppContextForPrompt(appContext, userMessage = '') {
  const asksAboutError = /error|fallo|problema|timeout/i.test(userMessage);
  if (appContext.view === 'ticket_detail') {
    return { route: appContext.route, appArea: appContext.appArea, view: appContext.view, activeEntity: appContext.activeEntity, activeTab: appContext.activeTab, draftState: { hasUnsavedChanges: Boolean(appContext.draftState?.hasUnsavedChanges), hasDraftReply: Boolean(appContext.draftState?.draftReply) }, ...(asksAboutError && appContext.lastUiError ? { lastUiError: appContext.lastUiError } : {}) };
  }
  if (appContext.view === 'ticket_list') {
    return { route: appContext.route, appArea: appContext.appArea, view: appContext.view, filters: appContext.filters, selectedRows: appContext.selectedRows?.slice(0, 10), ...(asksAboutError && appContext.lastUiError ? { lastUiError: appContext.lastUiError } : {}) };
  }
  return { route: appContext.route, appArea: appContext.appArea, view: appContext.view, ...(asksAboutError && appContext.lastUiError ? { lastUiError: appContext.lastUiError } : {}) };
}
