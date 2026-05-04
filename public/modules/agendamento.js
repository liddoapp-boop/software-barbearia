function safeText(value, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function asDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDateTime(date) {
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function humanizeTag(tag) {
  if (tag === "VIP") return "VIP";
  if (tag === "RECURRING") return "Recorrente";
  if (tag === "INACTIVE") return "Inativo";
  return "Novo";
}

export function normalizeCatalogForScheduling(catalog) {
  const clients = Array.isArray(catalog.clients) ? catalog.clients : [];
  const services = Array.isArray(catalog.services) ? catalog.services : [];
  const professionals = Array.isArray(catalog.professionals) ? catalog.professionals : [];

  return {
    clients,
    services,
    professionals,
    clientsById: Object.fromEntries(clients.map((item) => [item.id, item])),
    servicesById: Object.fromEntries(services.map((item) => [item.id, item])),
    professionalsById: Object.fromEntries(professionals.map((item) => [item.id, item])),
  };
}

export function buildClientSummary(client, agendaItems) {
  if (!client) return null;

  const list = Array.isArray(agendaItems) ? agendaItems : [];
  const fromClient = list.filter((item) => item.clientId === client.id);
  const completed = fromClient.filter((item) => item.status === "COMPLETED").length;
  const noShow = fromClient.filter((item) => item.status === "NO_SHOW").length;
  const cancelled = fromClient.filter((item) => item.status === "CANCELLED").length;
  const lastVisit = fromClient
    .filter((item) => item.status === "COMPLETED")
    .map((item) => asDate(item.endsAt || item.startsAt))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    completed,
    noShow,
    cancelled,
    lastVisit: lastVisit || null,
  };
}

export function suggestRelatedServices(selectedService, allServices) {
  if (!selectedService) return [];
  const services = Array.isArray(allServices) ? allServices : [];
  const sameCategory = services.filter(
    (item) => item.id !== selectedService.id && item.category === selectedService.category,
  );
  const fallback = services.filter(
    (item) => item.id !== selectedService.id && item.category !== selectedService.category,
  );
  return [...sameCategory, ...fallback].slice(0, 4);
}

export function validateSlotLocally(input) {
  const startsAt = asDate(input.startsAt);
  if (!startsAt) {
    return {
      ok: false,
      code: "INVALID_DATE",
      message: "Horario invalido. Revise a data e hora selecionadas.",
    };
  }

  const service = input.servicesById?.[input.serviceId];
  if (!service) {
    return {
      ok: false,
      code: "MISSING_SERVICE",
      message: "Selecione um servico para validar conflito.",
    };
  }

  if (!safeText(input.professionalId)) {
    return {
      ok: false,
      code: "MISSING_PROFESSIONAL",
      message: "Selecione um profissional para validar disponibilidade.",
    };
  }

  const endsAt = new Date(startsAt.getTime() + asNumber(service.durationMin) * 60_000);
  const agenda = Array.isArray(input.agendaItems) ? input.agendaItems : [];
  const conflict = agenda.find((item) => {
    if (item.professionalId !== input.professionalId) return false;
    if (!["SCHEDULED", "CONFIRMED", "IN_SERVICE"].includes(item.status)) return false;
    return startsAt < item.endsAt && endsAt > item.startsAt;
  });

  if (!conflict) {
    return {
      ok: true,
      code: "AVAILABLE",
      message: "Horario livre no pre-check local.",
      startsAt,
      endsAt,
    };
  }

  return {
    ok: false,
    code: "CONFLICT",
    message: `Conflito local com ${safeText(conflict.client, "outro cliente")} as ${conflict.startsAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}.`,
    startsAt,
    endsAt,
    conflict,
  };
}

export function renderScheduleAssist(state, elements) {
  renderClientInsights(state, elements);
  renderServiceSuggestions(state, elements);
  renderFeedback(state, elements);
}

function renderClientInsights(state, elements) {
  const { client, clientSummary, professionalsById } = state;
  if (!client) {
    elements.clientInsights.textContent =
      "Selecione um cliente para ver historico resumido e perfil.";
    return;
  }

  const tags = (client.tags || []).map(humanizeTag);
  const preferred = client.preferredProfessionalId
    ? professionalsById?.[client.preferredProfessionalId]?.name || "Nao definido"
    : "Nao definido";
  const lastVisitLabel = clientSummary?.lastVisit
    ? formatDateTime(clientSummary.lastVisit)
    : "Sem atendimento concluido no periodo carregado";

  elements.clientInsights.innerHTML = `
    <strong class="text-gray-800">${safeText(client.fullName, "Cliente")}</strong><br/>
    Perfil: ${tags.join(", ") || "Sem classificacao"}<br/>
    Profissional preferido: ${preferred}<br/>
    Historico (periodo atual): ${clientSummary?.completed ?? 0} concluidos, ${clientSummary?.noShow ?? 0} faltas, ${clientSummary?.cancelled ?? 0} cancelados<br/>
    Ultima visita: ${lastVisitLabel}
  `;
}

function renderServiceSuggestions(state, elements) {
  const { selectedService, relatedServices } = state;
  if (!selectedService) {
    elements.serviceSuggestions.textContent = "Sugestoes de servicos relacionados aparecerao aqui.";
    return;
  }

  const lines = relatedServices
    .map((item) => `${safeText(item.name, "Servico")} (R$ ${asNumber(item.price).toFixed(2)})`)
    .join(" | ");
  elements.serviceSuggestions.innerHTML = `
    <strong class="text-gray-800">Relacionados a ${safeText(selectedService.name, "servico")}:</strong><br/>
    ${lines || "Sem sugestoes no momento"}
  `;
}

function renderFeedback(state, elements) {
  const feedback = state.feedback || { type: "neutral", message: "" };
  if (!feedback.message) {
    elements.appointmentFeedback.className =
      "md:col-span-2 rounded-lg border px-3 py-2 text-sm bg-gray-50 border-gray-200 text-gray-600";
    elements.appointmentFeedback.textContent =
      "Selecione cliente, profissional, servico e horario para validar disponibilidade.";
    return;
  }

  if (feedback.type === "error") {
    elements.appointmentFeedback.className =
      "md:col-span-2 rounded-lg border px-3 py-2 text-sm bg-red-50 border-red-200 text-red-700";
  } else if (feedback.type === "success") {
    elements.appointmentFeedback.className =
      "md:col-span-2 rounded-lg border px-3 py-2 text-sm bg-emerald-50 border-emerald-200 text-emerald-700";
  } else {
    elements.appointmentFeedback.className =
      "md:col-span-2 rounded-lg border px-3 py-2 text-sm bg-amber-50 border-amber-200 text-amber-700";
  }
  elements.appointmentFeedback.textContent = feedback.message;
}

export function renderAlternativeSlots(slots, onSelect, container) {
  const list = Array.isArray(slots) ? slots : [];
  if (!list.length) {
    container.innerHTML = `
      <div class="text-sm text-gray-500">
        Sem horarios alternativos no recorte atual. Tente outro profissional ou periodo.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="flex flex-wrap gap-2">
      ${list
        .map((slot) => {
          const startsAt = asDate(slot.startsAt);
          if (!startsAt) return "";
          return `<button type="button" data-slot="${startsAt.toISOString()}" class="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">${formatDateTime(startsAt)}</button>`;
        })
        .join("")}
    </div>
  `;

  container.querySelectorAll("[data-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      const iso = button.dataset.slot;
      if (iso && typeof onSelect === "function") onSelect(iso);
    });
  });
}
