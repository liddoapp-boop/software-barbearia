/* ─────────────────────────────────────────────────────────────────────────
   WhatsApp Integration + Automation Templates
   - Conexão via Evolution API (QR Code)
   - Templates editáveis de confirmação e lembrete persistidos no localStorage
───────────────────────────────────────────────────────────────────────── */

const DEFAULT_TPL_CONFIRM =
`Olá {{nome}}! ✂️

Seu agendamento na *Liddo Barber* foi confirmado!

📋 Serviço: {{servico}}
💰 Valor: {{preco}}
📅 Data: {{data}}
⏰ Horário: {{hora}}

Qualquer dúvida pode nos chamar aqui mesmo!

Até logo 🤙`;

const DEFAULT_TPL_REMINDER =
`Olá {{nome}}! 👋

Lembrando do seu agendamento *hoje* às *{{hora}}* na Liddo Barber.

📋 Serviço: {{servico}}

Te esperamos! ✂️`;

const STORAGE_KEY_CONFIRM  = "liddo_wz_tpl_confirm";
const STORAGE_KEY_REMINDER = "liddo_wz_tpl_reminder";
const MAX_CONFIRM  = 600;
const MAX_REMINDER = 400;

function loadTpl(key, def) {
  try { return localStorage.getItem(key) || def; } catch { return def; }
}
function saveTpl(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export async function renderWhatsAppSection(container, { getToken }) {
  container.innerHTML = `
    <div class="wz-page">

      <!-- ── Page header ──────────────────────────────────────────── -->
      <header class="op-page-header">
        <div class="op-page-header-main">
          <h1 class="op-page-title">WhatsApp</h1>
          <p class="op-page-subtitle">
            Conecte o número que envia confirmações e lembretes automáticos para os clientes.
          </p>
        </div>
        <div class="op-page-action">
          <div id="wzStatusBadge" class="op-status-chip wz-chip-pending">Verificando...</div>
        </div>
      </header>

      <!-- ── Loading ──────────────────────────────────────────────── -->
      <div id="wzLoadingPanel" class="wz-loading">
        <span class="wz-spinner"></span>
        Verificando status da conexão...
      </div>

      <!-- ── Connection grid ──────────────────────────────────────── -->
      <div id="wzMainGrid" class="wz-main-grid" style="display:none">

        <!-- Connection card -->
        <div class="wz-conn-card">

          <!-- Connected state -->
          <div id="wzConnectedPanel" style="display:none">
            <div class="wz-info-connected">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              WhatsApp conectado e pronto para enviar mensagens.
            </div>
            <div class="wz-actions">
              <button id="wzDisconnectBtn" class="ux-btn ux-btn-danger-outline">
                Desconectar número
              </button>
            </div>
          </div>

          <!-- Disconnected state -->
          <div id="wzDisconnectedPanel" style="display:none">
            <p class="wz-hint">
              Clique em <strong>Conectar</strong> e escaneie o QR Code com o WhatsApp
              do número que enviará as mensagens.
            </p>
            <button id="wzConnectBtn" class="op-primary-action" style="width:100%;justify-content:center;gap:8px">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                   aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Conectar WhatsApp
            </button>
            <div id="wzQrWrap" class="wz-qr-wrap" style="display:none">
              <p class="wz-qr-hint">
                Abra o WhatsApp → <strong>Aparelhos conectados</strong> → Conectar aparelho
              </p>
              <div id="wzQrLoading" class="wz-qr-loading" style="display:none">
                <span class="wz-spinner"></span>
                Aguardando QR Code...
              </div>
              <img id="wzQrImg" src="" alt="QR Code" class="wz-qr-img" style="display:none"/>
            </div>
          </div>

          <div id="wzError" class="wz-error" style="display:none"></div>
        </div>

        <!-- Instructions card -->
        <div class="wz-steps-card">
          <p class="ux-label">COMO CONECTAR</p>
          <ol class="wz-steps-list">
            <li>Abra o <strong>WhatsApp</strong> no celular do número que vai enviar as mensagens</li>
            <li>Toque nos três pontos (⋮) → <strong>Aparelhos conectados</strong></li>
            <li>Selecione <strong>Conectar um aparelho</strong></li>
            <li>Clique em <strong>Conectar WhatsApp</strong> ao lado e escaneie o QR Code</li>
            <li>Aguarde a confirmação — a página atualizará automaticamente</li>
          </ol>
          <p class="wz-hint" style="margin-top:4px;font-size:12px">
            Após conectado, o número permanece ativo até você desconectar manualmente ou o WhatsApp revogar o acesso.
          </p>
        </div>
      </div>

      <!-- ── Automation templates ──────────────────────────────────── -->
      <section class="wz-tpl-section">
        <p class="ux-section-label">AUTOMAÇÕES DE MENSAGEM</p>

        <!-- Confirmation template -->
        <div class="wz-tpl-card">
          <div class="wz-tpl-head">
            <div class="wz-tpl-icon-wrap wz-tpl-icon-success" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
            </div>
            <div>
              <strong class="wz-tpl-title">Confirmação de Agendamento</strong>
              <span class="wz-tpl-sub">
                Enviada quando o cliente confirma o agendamento pelo link público.
              </span>
            </div>
          </div>
          <div>
            <p class="wz-tpl-vars-label">Clique em uma variável para inserir no cursor</p>
            <div class="wz-tpl-vars" id="wzVarsConfirm">
              <span class="wz-var-chip" data-var="{{nome}}">{{nome}}</span>
              <span class="wz-var-chip" data-var="{{servico}}">{{servico}}</span>
              <span class="wz-var-chip" data-var="{{preco}}">{{preco}}</span>
              <span class="wz-var-chip" data-var="{{data}}">{{data}}</span>
              <span class="wz-var-chip" data-var="{{hora}}">{{hora}}</span>
            </div>
          </div>
          <textarea
            id="wzTplConfirm"
            class="wz-tpl-textarea"
            rows="11"
            maxlength="${MAX_CONFIRM}"
            placeholder="Digite a mensagem de confirmação..."
            aria-label="Mensagem de confirmação de agendamento"
          ></textarea>
          <div class="wz-tpl-footer">
            <span id="wzTplConfirmCount" class="wz-tpl-count">0 / ${MAX_CONFIRM}</span>
            <div class="wz-tpl-actions">
              <button id="wzTplConfirmReset" class="wz-tpl-btn-ghost">Restaurar padrão</button>
              <button id="wzTplConfirmSave" class="wz-tpl-btn-primary">Salvar mensagem</button>
            </div>
          </div>
          <p id="wzTplConfirmFeedback" class="wz-tpl-feedback" style="display:none"></p>
        </div>

        <!-- Reminder template -->
        <div class="wz-tpl-card">
          <div class="wz-tpl-head">
            <div class="wz-tpl-icon-wrap wz-tpl-icon-warning" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                   fill="none" stroke="currentColor" stroke-width="2.5"
                   stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <strong class="wz-tpl-title">Lembrete — 2h antes</strong>
              <span class="wz-tpl-sub">
                Enviada 2 horas antes do horário marcado para reduzir faltas.
              </span>
            </div>
          </div>
          <div>
            <p class="wz-tpl-vars-label">Clique em uma variável para inserir no cursor</p>
            <div class="wz-tpl-vars" id="wzVarsReminder">
              <span class="wz-var-chip" data-var="{{nome}}">{{nome}}</span>
              <span class="wz-var-chip" data-var="{{servico}}">{{servico}}</span>
              <span class="wz-var-chip" data-var="{{hora}}">{{hora}}</span>
            </div>
          </div>
          <textarea
            id="wzTplReminder"
            class="wz-tpl-textarea"
            rows="8"
            maxlength="${MAX_REMINDER}"
            placeholder="Digite a mensagem de lembrete..."
            aria-label="Mensagem de lembrete de agendamento"
          ></textarea>
          <div class="wz-tpl-footer">
            <span id="wzTplReminderCount" class="wz-tpl-count">0 / ${MAX_REMINDER}</span>
            <div class="wz-tpl-actions">
              <button id="wzTplReminderReset" class="wz-tpl-btn-ghost">Restaurar padrão</button>
              <button id="wzTplReminderSave" class="wz-tpl-btn-primary">Salvar mensagem</button>
            </div>
          </div>
          <p id="wzTplReminderFeedback" class="wz-tpl-feedback" style="display:none"></p>
        </div>
      </section>

    </div>
  `;

  /* ── DOM refs ─────────────────────────────────────────────────────── */
  const badge             = document.getElementById("wzStatusBadge");
  const connectedPanel    = document.getElementById("wzConnectedPanel");
  const disconnectedPanel = document.getElementById("wzDisconnectedPanel");
  const loadingPanel      = document.getElementById("wzLoadingPanel");
  const mainGrid          = document.getElementById("wzMainGrid");
  const errorDiv          = document.getElementById("wzError");
  const qrWrap            = document.getElementById("wzQrWrap");
  const qrImg             = document.getElementById("wzQrImg");
  const qrLoading         = document.getElementById("wzQrLoading");

  /* ── Error helpers ────────────────────────────────────────────────── */
  function showError(msg) { errorDiv.textContent = msg; errorDiv.style.display = "block"; }
  function hideError()    { errorDiv.style.display = "none"; }

  /* ── Status state ─────────────────────────────────────────────────── */
  function setStatus(state) {
    loadingPanel.style.display = "none";
    mainGrid.style.display     = "grid";

    if (state === "open") {
      badge.textContent = "Conectado";
      badge.className   = "op-status-chip wz-chip-open";
      connectedPanel.style.display    = "block";
      disconnectedPanel.style.display = "none";
    } else {
      badge.textContent = "Desconectado";
      badge.className   = "op-status-chip wz-chip-close";
      connectedPanel.style.display    = "none";
      disconnectedPanel.style.display = "block";
    }
  }

  /* ── Status check ─────────────────────────────────────────────────── */
  async function checkStatus() {
    hideError();
    try {
      const token = getToken();
      const res = await fetch("/whatsapp/status", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao verificar status");
      const data = await res.json();
      setStatus(data.state);
    } catch {
      loadingPanel.style.display = "none";
      mainGrid.style.display     = "grid";
      badge.textContent = "Erro";
      badge.className   = "op-status-chip wz-chip-pending";
      disconnectedPanel.style.display = "block";
      showError("Não foi possível verificar o status. Verifique se a Evolution API está acessível.");
    }
  }

  /* ── Polling ──────────────────────────────────────────────────────── */
  let pollInterval = null;

  function startPolling() {
    stopPolling();
    pollInterval = setInterval(async () => {
      try {
        const token = getToken();
        const res = await fetch("/whatsapp/status", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.state === "open") {
          stopPolling();
          qrWrap.style.display = "none";
          setStatus("open");
        }
      } catch { /* silencioso */ }
    }, 4000);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  /* ── Connect button ───────────────────────────────────────────────── */
  document.getElementById("wzConnectBtn").addEventListener("click", async (e) => {
    hideError();
    const btn = e.currentTarget;
    btn.disabled    = true;
    btn.textContent = "Aguarde...";
    qrWrap.style.display    = "none";
    qrLoading.style.display = "flex";
    qrImg.style.display     = "none";

    try {
      const token = getToken();
      const res = await fetch("/whatsapp/connect", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao iniciar conexão");
      const data = await res.json();

      qrLoading.style.display = "none";
      qrWrap.style.display    = "block";

      if (data.qrcode) {
        const src = data.qrcode.startsWith("data:") ? data.qrcode : `data:image/png;base64,${data.qrcode}`;
        qrImg.src               = src;
        qrImg.style.display     = "block";
        startPolling();
      } else {
        qrLoading.textContent   = "Aguardando QR Code...";
        qrLoading.style.display = "flex";
        startPolling();
      }
    } catch (err) {
      qrLoading.style.display = "none";
      showError(err.message ?? "Erro ao conectar. Tente novamente.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg> Conectar WhatsApp`;
    }
  });

  /* ── Disconnect button ────────────────────────────────────────────── */
  document.getElementById("wzDisconnectBtn").addEventListener("click", async () => {
    if (!confirm("Deseja desconectar o WhatsApp? As mensagens automáticas serão pausadas.")) return;
    stopPolling();
    try {
      const token = getToken();
      await fetch("/whatsapp/disconnect", {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setStatus("close");
    } catch {
      showError("Erro ao desconectar. Tente novamente.");
    }
  });

  /* ── Template helpers ─────────────────────────────────────────────── */
  function updateCount(ta, countEl, max) {
    countEl.textContent = `${ta.value.length}/${max}`;
  }

  function showFeedback(el, msg, isError = false) {
    el.textContent = msg;
    el.className   = "wz-tpl-feedback" + (isError ? " wz-tpl-feedback-err" : "");
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 2500);
  }

  function wireVarChips(wrapId, textareaId) {
    const wrap = document.getElementById(wrapId);
    const ta   = document.getElementById(textareaId);
    if (!wrap || !ta) return;
    wrap.querySelectorAll(".wz-var-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const varStr = chip.dataset.var;
        const start  = ta.selectionStart ?? ta.value.length;
        const end    = ta.selectionEnd   ?? ta.value.length;
        ta.value = ta.value.slice(0, start) + varStr + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + varStr.length;
        ta.focus();
        ta.dispatchEvent(new Event("input"));
      });
    });
  }

  function wireTemplate({ taId, countId, feedbackId, resetId, saveId, storageKey, def, max }) {
    const ta       = document.getElementById(taId);
    const countEl  = document.getElementById(countId);
    const feedback = document.getElementById(feedbackId);
    const resetBtn = document.getElementById(resetId);
    const saveBtn  = document.getElementById(saveId);
    if (!ta) return;

    // Load saved or default
    ta.value = loadTpl(storageKey, def);
    updateCount(ta, countEl, max);

    ta.addEventListener("input", () => updateCount(ta, countEl, max));

    resetBtn?.addEventListener("click", () => {
      ta.value = def;
      updateCount(ta, countEl, max);
      saveTpl(storageKey, def);
      showFeedback(feedback, "Restaurado para o padrão.");
    });

    saveBtn?.addEventListener("click", () => {
      const ok = saveTpl(storageKey, ta.value);
      showFeedback(feedback, ok ? "Mensagem salva com sucesso! ✓" : "Erro ao salvar.", !ok);
    });
  }

  /* ── Wire confirmation template ───────────────────────────────────── */
  wireVarChips("wzVarsConfirm", "wzTplConfirm");
  wireTemplate({
    taId:       "wzTplConfirm",
    countId:    "wzTplConfirmCount",
    feedbackId: "wzTplConfirmFeedback",
    resetId:    "wzTplConfirmReset",
    saveId:     "wzTplConfirmSave",
    storageKey: STORAGE_KEY_CONFIRM,
    def:        DEFAULT_TPL_CONFIRM,
    max:        MAX_CONFIRM,
  });

  /* ── Wire reminder template ───────────────────────────────────────── */
  wireVarChips("wzVarsReminder", "wzTplReminder");
  wireTemplate({
    taId:       "wzTplReminder",
    countId:    "wzTplReminderCount",
    feedbackId: "wzTplReminderFeedback",
    resetId:    "wzTplReminderReset",
    saveId:     "wzTplReminderSave",
    storageKey: STORAGE_KEY_REMINDER,
    def:        DEFAULT_TPL_REMINDER,
    max:        MAX_REMINDER,
  });

  /* ── Init: check connection status ───────────────────────────────── */
  checkStatus();
}
