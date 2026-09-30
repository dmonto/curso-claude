const chat = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const statusBox = document.getElementById("status");
const pendingActionBox = document.getElementById("pendingActionBox");
const orderSelector = document.getElementById("orderSelector");
const selectedEntityId = document.getElementById("selectedEntityId");
const closeSessionButton = document.getElementById("closeSessionButton");
const feedbackPositive = document.getElementById("feedbackPositive");
const feedbackNegative = document.getElementById("feedbackNegative");

const appState = {
  userId: "user-001",
  sessionId: null,
  pendingAction: null,
  lastMessageId: null,
  clientContext: {
    currentPage: "orders",
    selectedEntityType: "order",
    selectedEntityId: "ORD-1002",
    locale: "es-ES"
  }
};

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function setStatus(text) {
  statusBox.textContent = text || "";
}

function setLoading(isLoading) {
  messageInput.disabled = isLoading;
  chatForm.querySelector("button").disabled = isLoading;
}

function renderPendingAction(pendingAction) {
  if (!pendingAction) {
    pendingActionBox.classList.add("hidden");
    pendingActionBox.innerHTML = "";
    return;
  }

  pendingActionBox.classList.remove("hidden");
  pendingActionBox.innerHTML = `
    <strong>Acción pendiente</strong>
    <p>Tipo: ${pendingAction.type}</p>
    <p>Pedido: ${pendingAction.orderId || "-"}</p>
    <p>Asunto: ${pendingAction.subject || pendingAction.title || "-"}</p>
    <button id="confirmAction">Confirmar</button>
    <button id="cancelAction">Cancelar</button>
  `;

  document
    .getElementById("confirmAction")
    .addEventListener("click", () => confirmPendingAction(true));

  document
    .getElementById("cancelAction")
    .addEventListener("click", () => confirmPendingAction(false));
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message || "Error llamando al backend");
  }

  return payload.data;
}

async function createAssistantSession() {
  setStatus("Creando sesión del asistente...");

  const data = await apiFetch("/api/assistant/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: `req-${Date.now()}`,
      userId: appState.userId,
      clientContext: appState.clientContext
    })
  });

  appState.sessionId = data.session.sessionId;
  setStatus(`Sesión activa: ${appState.sessionId}`);
}

async function sendMessage(message) {
  setStatus("Procesando mensaje...");

  return apiFetch("/api/assistant/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: `req-${Date.now()}`,
      userId: appState.userId,
      sessionId: appState.sessionId,
      message,
      clientContext: appState.clientContext
    })
  });
}

async function confirmPendingAction(confirm) {
  if (!appState.pendingAction) {
    return;
  }

  const actionId = appState.pendingAction.actionId;
  const endpoint = confirm
    ? `/api/assistant/actions/${actionId}/confirm`
    : `/api/assistant/actions/${actionId}/cancel`;

  setStatus(confirm ? "Confirmando acción..." : "Cancelando acción...");

  try {
    const result = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: `req-${Date.now()}`,
        userId: appState.userId,
        sessionId: appState.sessionId
      })
    });

    addMessage("assistant", result.message);

    if (result.result) {
      addMessage("assistant", `Resultado:\n${JSON.stringify(result.result, null, 2)}`);
    }

    appState.pendingAction = null;
    renderPendingAction(null);
    setStatus("");
  } catch (error) {
    console.error(error);
    addMessage("assistant", `Error: ${error.message}`);
    setStatus("");
  }
}

async function closeAssistantSession() {
  if (!appState.sessionId) {
    return;
  }

  const result = await apiFetch(`/api/assistant/sessions/${appState.sessionId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: `req-${Date.now()}`,
      userId: appState.userId
    })
  });

  addMessage("assistant", result.message);
  appState.sessionId = null;
  appState.pendingAction = null;
  renderPendingAction(null);
  setStatus("");
}

async function sendFeedback(rating) {
  if (!appState.sessionId || !appState.lastMessageId) {
    addMessage("assistant", "No hay una respuesta reciente sobre la que enviar feedback.");
    return;
  }

  const result = await apiFetch("/api/assistant/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: `req-${Date.now()}`,
      sessionId: appState.sessionId,
      messageId: appState.lastMessageId,
      rating,
      comment: rating === "positive" ? "Respuesta útil" : "Respuesta no útil"
    })
  });

  addMessage("assistant", result.message);
}

orderSelector.addEventListener("change", () => {
  const newValue = orderSelector.value;
  appState.clientContext.selectedEntityId = newValue;
  selectedEntityId.textContent = newValue;
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!appState.sessionId) {
    addMessage("assistant", "La sesión del asistente todavía no está lista.");
    return;
  }

  const message = messageInput.value.trim();

  if (!message) {
    return;
  }

  addMessage("user", message);
  messageInput.value = "";
  setLoading(true);

  try {
    const result = await sendMessage(message);

    addMessage("assistant", result.answer);
    appState.lastMessageId = result.messageId;
    appState.pendingAction = result.pendingAction || null;
    renderPendingAction(appState.pendingAction);

    setStatus(`Tiempo backend: ${result.elapsedMs} ms`);
  } catch (error) {
    console.error(error);
    addMessage("assistant", "No se pudo procesar la solicitud. Revisa el backend o inténtalo de nuevo.");
    setStatus("");
  } finally {
    setLoading(false);
  }
});

closeSessionButton.addEventListener("click", () => {
  closeAssistantSession().catch((error) => {
    console.error(error);
    addMessage("assistant", `Error: ${error.message}`);
  });
});

feedbackPositive.addEventListener("click", () => {
  sendFeedback("positive").catch((error) => {
    console.error(error);
    addMessage("assistant", `Error: ${error.message}`);
  });
});

feedbackNegative.addEventListener("click", () => {
  sendFeedback("negative").catch((error) => {
    console.error(error);
    addMessage("assistant", `Error: ${error.message}`);
  });
});

createAssistantSession().catch((error) => {
  console.error(error);
  addMessage("assistant", "No se pudo inicializar la sesión del asistente.");
  setStatus("");
});
