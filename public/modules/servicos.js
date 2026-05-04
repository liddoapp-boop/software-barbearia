import { renderPanelMessage } from "./feedback.js";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Number(toNumber(value)).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pct(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function statusMeta(isActive) {
  if (isActive) {
    return {
      label: "Ativo",
      tone: "text-emerald-700 bg-emerald-100 border-emerald-200",
    };
  }
  return {
    label: "Inativo",
    tone: "text-slate-600 bg-slate-100 border-slate-200",
  };
}

function card(title, value, subtitle = "", tone = "text-slate-900") {
  return `
    <article class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${title}</div>
      <div class="mt-1 text-lg font-black ${tone}">${value}</div>
      <div class="text-xs text-slate-500 mt-1">${subtitle}</div>
    </article>
  `;
}

export function renderServicesLoading(elements) {
  if (elements.summary) renderPanelMessage(elements.summary, "Carregando resumo de servicos...");
  if (elements.tableBody) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="11" class="px-3 py-6 text-center text-sm text-slate-500">Carregando servicos...</td>
      </tr>
    `;
  }
  if (elements.mobileList) renderPanelMessage(elements.mobileList, "Carregando servicos...");
}

export function renderServicesError(elements, message = "Falha ao carregar servicos.") {
  if (elements.summary) renderPanelMessage(elements.summary, message, "error");
  if (elements.tableBody) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="11" class="px-3 py-6 text-center text-sm text-red-700">${message}</td>
      </tr>
    `;
  }
  if (elements.mobileList) renderPanelMessage(elements.mobileList, message, "error");
}

function renderDesktopRows(container, services = []) {
  if (!container) return;
  container.innerHTML = services
    .map((service) => {
      const status = statusMeta(service.isActive);
      return `
        <tr class="border-t border-slate-200">
          <td class="px-3 py-3 align-top">
            <div class="text-sm font-semibold text-slate-900">${service.name}</div>
            <div class="text-xs text-slate-500 mt-1">${service.category || "Sem categoria"}</div>
          </td>
          <td class="px-3 py-3 align-top text-sm text-slate-700">${service.category || "-"}</td>
          <td class="px-3 py-3 align-top text-sm font-semibold text-slate-900">${money(service.price)}</td>
          <td class="px-3 py-3 align-top text-sm text-slate-700">${toNumber(service.durationMinutes)} min</td>
          <td class="px-3 py-3 align-top text-sm text-slate-700">${pct(service.defaultCommissionRate)}</td>
          <td class="px-3 py-3 align-top text-sm text-slate-700">${money(service.estimatedCost)}</td>
          <td class="px-3 py-3 align-top text-sm text-slate-700">${money(service.estimatedMargin)} (${pct(service.estimatedMarginPct)})</td>
          <td class="px-3 py-3 align-top">
            <span class="inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${status.tone}">${status.label}</span>
          </td>
          <td class="px-3 py-3 align-top text-xs text-slate-600">${service.enabledProfessionals.length ? service.enabledProfessionals.map((item) => item.name).join(", ") : "Todos ativos"}</td>
          <td class="px-3 py-3 align-top text-sm text-slate-700">
            <div>${toNumber(service.salesCount)} vendas</div>
            <div class="text-xs text-slate-500">${money(service.revenueGenerated)}</div>
          </td>
          <td class="px-3 py-3 align-top">
            <div class="flex flex-wrap gap-1">
              <button type="button" data-service-action="detail" data-service-id="${service.id}" class="min-h-[36px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Detalhes</button>
              <button type="button" data-service-action="edit" data-service-id="${service.id}" class="min-h-[36px] rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Editar</button>
              <button type="button" data-service-action="duplicate" data-service-id="${service.id}" class="min-h-[36px] rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Duplicar</button>
              <button type="button" data-service-action="toggle-status" data-service-id="${service.id}" data-next-active="${service.isActive ? "false" : "true"}" class="min-h-[36px] rounded-md border ${service.isActive ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"} px-2 py-1 text-xs font-semibold">${service.isActive ? "Inativar" : "Ativar"}</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderMobileCards(container, services = []) {
  if (!container) return;
  container.innerHTML = services
    .map((service) => {
      const status = statusMeta(service.isActive);
      return `
        <article class="rounded-xl border border-slate-200 bg-white p-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-sm font-semibold text-slate-900">${service.name}</div>
              <div class="text-xs text-slate-500 mt-1">${service.category || "Sem categoria"}</div>
            </div>
            <span class="inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${status.tone}">${status.label}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-2 text-xs text-slate-600">
            <div>Preco: <strong>${money(service.price)}</strong></div>
            <div>Duracao: <strong>${toNumber(service.durationMinutes)} min</strong></div>
            <div>Comissao: <strong>${pct(service.defaultCommissionRate)}</strong></div>
            <div>Margem: <strong>${money(service.estimatedMargin)}</strong></div>
          </div>
          <div class="mt-2 text-xs text-slate-500">
            ${service.salesCount} vendas • ${money(service.revenueGenerated)} de receita
          </div>
          <div class="flex flex-wrap gap-1 mt-3">
            <button type="button" data-service-action="detail" data-service-id="${service.id}" class="min-h-[38px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700">Detalhes</button>
            <button type="button" data-service-action="edit" data-service-id="${service.id}" class="min-h-[38px] rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">Editar</button>
            <button type="button" data-service-action="duplicate" data-service-id="${service.id}" class="min-h-[38px] rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">Duplicar</button>
            <button type="button" data-service-action="toggle-status" data-service-id="${service.id}" data-next-active="${service.isActive ? "false" : "true"}" class="min-h-[38px] rounded-md border ${service.isActive ? "border-amber-300 bg-amber-50 text-amber-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"} px-2 py-1 text-xs font-semibold">${service.isActive ? "Inativar" : "Ativar"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

export function renderServicesData(elements, payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : [];
  const summary = payload.summary || {};
  const categories = Array.isArray(payload.categories) ? payload.categories : [];

  if (elements.summary) {
    elements.summary.innerHTML = [
      card("Total de servicos", toNumber(summary.totalServices)),
      card("Servicos ativos", toNumber(summary.activeServices), "", "text-emerald-700"),
      card("Servicos inativos", toNumber(summary.inactiveServices)),
      card("Ticket medio", money(summary.averageTicket), "Preco medio atual"),
      card(
        "Mais vendido",
        summary.bestSellingService?.name || "-",
        summary.bestSellingService ? `${toNumber(summary.bestSellingService.salesCount)} vendas` : "Sem historico",
      ),
      card(
        "Maior receita",
        summary.highestRevenueService?.name || "-",
        summary.highestRevenueService ? money(summary.highestRevenueService.revenueGenerated) : "Sem historico",
      ),
    ].join("");
  }

  if (elements.categoryFilter) {
    const previous = elements.categoryFilter.value || "";
    elements.categoryFilter.innerHTML = `
      <option value="">Todas categorias</option>
      ${categories.map((item) => `<option value="${item}">${item}</option>`).join("")}
    `;
    if (categories.includes(previous)) elements.categoryFilter.value = previous;
  }

  if (elements.emptyState) {
    elements.emptyState.classList.toggle("hidden", services.length > 0);
  }
  if (elements.tableWrap) {
    elements.tableWrap.classList.toggle("hidden", services.length === 0);
    elements.tableWrap.classList.toggle("xl:block", services.length > 0);
  }

  if (!services.length) {
    if (elements.tableBody) elements.tableBody.innerHTML = "";
    if (elements.mobileList) elements.mobileList.innerHTML = "";
    return;
  }

  renderDesktopRows(elements.tableBody, services);
  renderMobileCards(elements.mobileList, services);
}

export function renderServiceDetail(elements, payload = null) {
  if (!elements?.panel || !elements?.content) return;
  if (!payload?.service) {
    elements.panel.classList.add("hidden");
    elements.content.innerHTML = "";
    return;
  }
  const service = payload.service;
  const usage = payload.usage || {};
  const financialImpact = payload.financialImpact || {};
  elements.content.innerHTML = `
    <div class="space-y-2">
      <h3 class="text-lg font-extrabold text-slate-900">${service.name}</h3>
      <div class="text-sm text-slate-600">${service.description || "Sem descricao cadastrada."}</div>
      <div class="grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div>Categoria: <strong>${service.category || "-"}</strong></div>
        <div>Status: <strong>${service.isActive ? "Ativo" : "Inativo"}</strong></div>
        <div>Preco: <strong>${money(service.price)}</strong></div>
        <div>Duracao: <strong>${toNumber(service.durationMinutes)} min</strong></div>
        <div>Comissao: <strong>${pct(service.defaultCommissionRate)}</strong></div>
        <div>Custo estimado: <strong>${money(service.estimatedCost)}</strong></div>
        <div>Margem estimada: <strong>${money(service.estimatedMargin)}</strong></div>
        <div>Margem %: <strong>${pct(service.estimatedMarginPct)}</strong></div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <div class="font-semibold text-slate-700">Historico resumido</div>
        <div class="mt-1">${toNumber(usage.totalCompleted)} atendimentos concluidos</div>
        <div>Receita acumulada: <strong>${money(usage.totalRevenue)}</strong></div>
        <div>Ultima venda: <strong>${usage.lastSoldAt ? new Date(usage.lastSoldAt).toLocaleString("pt-BR") : "-"}</strong></div>
      </div>
      <div class="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <div class="font-semibold text-slate-700">Impacto financeiro</div>
        <div class="mt-1">Custo total estimado: <strong>${money(financialImpact.estimatedCostTotal)}</strong></div>
        <div>Lucro total estimado: <strong>${money(financialImpact.estimatedProfitTotal)}</strong></div>
      </div>
      <div class="text-xs text-slate-600">Profissionais habilitados: <strong>${service.enabledProfessionals.length ? service.enabledProfessionals.map((item) => item.name).join(", ") : "Todos ativos"}</strong></div>
    </div>
  `;
  elements.panel.classList.remove("hidden");
}
