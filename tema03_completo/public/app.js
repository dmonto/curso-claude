const chat = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const statusBox = document.getElementById("status");
const pendingActionBox = document.getElementById("pendingActionBox");

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

async function createAssistantSession() {
  setStatus("Creando sesión del asistente...");

  const response = await fetch("/api/assistant/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requestId: `req-${Date.now()}`,
      userId: appState.userId,
      clientContext: appState.clientContext
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error?.message || "No se pudo crear la sesión"
    );
  }

  appState.sessionId = payload.data.session.sessionId;

  setStatus(`Sesión activa: ${appState.sessionId}`);
}

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
    <p>Asunto: ${pendingAction.subject || "-"}</p>
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

async function sendMessage(message) {
  setStatus("Procesando mensaje...");

  const requestId = `req-${Date.now()}`;

  const response = await fetch("/api/assistant/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requestId,
      userId: appState.userId,
      sessionId: appState.sessionId,
      message,
      clientContext: appState.clientContext
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error?.message || "Error llamando al backend"
    );
  }

  return payload.data;
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
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requestId: `req-${Date.now()}`,
        userId: appState.userId,
        sessionId: appState.sessionId
      })
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.error?.message || "Error procesando la acción"
      );
    }

    const result = payload.data;

    addMessage("assistant", result.message);

    if (result.result) {
      addMessage(
        "assistant",
        `Resultado: ${JSON.stringify(result.result, null, 2)}`
      );
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

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = messageInput.value.trim();

  if (!message) {
    return;
  }
  if (!appState.sessionId) {
    addMessage("assistant", "La sesión del asistente todavía no está lista.");
    return;
  }
  addMessage("user", message);
  messageInput.value = "";

  try {
    const result = await sendMessage(message);

    addMessage("assistant", result.answer);

    appState.pendingAction = result.pendingAction || null;
    renderPendingAction(appState.pendingAction);

    setStatus(`Tiempo backend: ${result.elapsedMs} ms`);
  } catch (error) {
    addMessage("assistant", `Error: ${error.message}`);
    setStatus("");
  }
});

createAssistantSession().catch((error) => {
  console.error(error);
  addMessage(
    "assistant",
    "No se pudo inicializar la sesión del asistente."
  );
  setStatus("");
});
const closeSessionButton = document.getElementById("closeSessionButton");

async function closeAssistantSession() {
  if (!appState.sessionId) {
    return;
  }

  const response = await fetch(
    `/api/assistant/sessions/${appState.sessionId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requestId: `req-${Date.now()}`,
        userId: appState.userId
      })
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload?.error?.message || "No se pudo cerrar la sesión"
    );
  }

  addMessage("assistant", "Sesión cerrada correctamente.");
  appState.sessionId = null;
  appState.pendingAction = null;
  renderPendingAction(null);
  setStatus("");
}

closeSessionButton?.addEventListener("click", () => {
  closeAssistantSession().catch((error) => {
    console.error(error);
    addMessage("assistant", `Error: ${error.message}`);
  });
});