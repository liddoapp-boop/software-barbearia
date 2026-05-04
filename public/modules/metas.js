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

function paceMeta(status) {
  if (status === "ABOVE_RHYTHM") {
    return {
      label: "Acima do ritmo",
      chip: "border-emerald-300 bg-emerald-50 text-emerald-700",
      bar: "bg-emerald-500",
      message: "A operacao esta performando acima da expectativa do periodo.",
    };
  }
  if (status === "ON_TRACK") {
    return {
      label: "Dentro do ritmo",
      chip: "border-amber-300 bg-amber-50 text-amber-700",
      bar: "bg-amber-500",
      message: "A meta segue no ritmo esperado. Mantenha a consistencia diaria.",
    };
  }
  return {
    label: "Abaixo do ritmo",
    chip: "border-red-300 bg-red-50 text-red-700",
    bar: "bg-red-500",
    message: "A operacao esta abaixo do ritmo esperado e requer acao imediata.",
  };
}

function card(title, value, subtitle = "", tone = "text-slate-900") {
  return `
    <article class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">${title}</div>
      <div class="mt-1 text-xl font-black ${tone}">${value}</div>
      <div class="mt-1 text-xs text-slate-500">${subtitle}</div>
    </article>
  `;
}

function emptyBlock(message) {
  return `<div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">${message}</div>`;
}

export function renderMetasLoading(elements) {
  if (elements.feedback) {
    renderPanelMessage(elements.feedback, "Carregando metas e performance...");
  }
  if (elements.cards) {
    renderPanelMessage(elements.cards, "Calculando indicadores da meta...");
  }
  if (elements.progress) {
    renderPanelMessage(elements.progress, "Calculando ritmo de desempenho...");
  }
  if (elements.professionals) {
    renderPanelMessage(elements.professionals, "Carregando ranking de profissionais...");
  }
  if (elements.services) {
    renderPanelMessage(elements.services, "Carregando servicos mais relevantes...");
  }
  if (elements.insights) {
    renderPanelMessage(elements.insights, "Gerando insights acionaveis...");
  }
}

export function renderMetasError(elements, message = "Falha ao carregar metas e performance.") {
  if (elements.feedback) {
    renderPanelMessage(elements.feedback, message, "error");
  }
  if (elements.cards) {
    elements.cards.innerHTML = emptyBlock("Nao foi possivel calcular os indicadores da meta.");
  }
  if (elements.progress) {
    elements.progress.innerHTML = emptyBlock("Nao foi possivel calcular o progresso da meta.");
  }
  if (elements.professionals) {
    elements.professionals.innerHTML = emptyBlock("Nao foi possivel carregar ranking de profissionais.");
  }
  if (elements.services) {
    elements.services.innerHTML = emptyBlock("Nao foi possivel carregar ranking de servicos.");
  }
  if (elements.insights) {
    elements.insights.innerHTML = emptyBlock("Nao foi possivel gerar insights acionaveis.");
  }
}

export function renderMetasData(elements, payload = {}) {
  const summary = payload.summary || {};
  const professionalsPayload = payload.professionals || {};
  const servicesPayload = payload.services || {};
  const goal = summary.goal || null;
  const metrics = summary.metrics || {};
  const professionals = Array.isArray(professionalsPayload.professionals)
    ? professionalsPayload.professionals
    : [];
  const services = Array.isArray(servicesPayload.services) ? servicesPayload.services : [];
  const insights = Array.isArray(summary.insights) ? summary.insights : [];

  if (elements.feedback) {
    if (!goal) {
      renderPanelMessage(
        elements.feedback,
        "Voce ainda nao definiu uma meta para este mes. Defina a meta para acompanhar desempenho e ritmo.",
        "warning",
      );
    } else {
      renderPanelMessage(
        elements.feedback,
        "Painel de metas carregado. Use os rankings e insights para ajustar a operacao ao longo do mes.",
        "success",
      );
    }
  }

  if (!goal) {
    if (elements.cards) {
      elements.cards.innerHTML = `
        <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p class="text-base font-semibold text-slate-800">Voce ainda nao definiu uma meta para este mes.</p>
          <p class="text-sm text-slate-500 mt-2">Definir uma meta ajuda a acompanhar o desempenho da empresa e entender quanto falta para atingir o resultado esperado.</p>
          <button type="button" data-metas-action="open-goal-modal" class="mt-4 min-h-[44px] rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-semibold">Definir meta agora</button>
        </div>
      `;
    }
    if (elements.progress) {
      elements.progress.innerHTML = emptyBlock("Defina uma meta para habilitar o progresso visual e o status de ritmo.");
    }
    if (elements.professionals) {
      elements.professionals.innerHTML = emptyBlock(
        "Ainda nao ha atendimentos concluidos suficientes para calcular a performance.",
      );
    }
    if (elements.services) {
      elements.services.innerHTML = emptyBlock(
        "Ainda nao ha atendimentos concluidos suficientes para calcular a performance.",
      );
    }
    if (elements.insights) {
      elements.insights.innerHTML = emptyBlock("Defina uma meta para receber recomendacoes acionaveis.");
    }
    return;
  }

  const pace = paceMeta(metrics.paceStatus);
  const progressPercent = Math.min(Math.max(toNumber(metrics.goalProgressPercent), 0), 999);

  if (elements.cards) {
    elements.cards.innerHTML = [
      card("Meta mensal", money(goal.revenueTarget), `${goal.month}/${goal.year}`),
      card("Faturamento atual", money(metrics.revenueCurrent), "Receita de atendimentos concluidos + vendas", "text-emerald-700"),
      card("Percentual atingido", pct(metrics.goalProgressPercent), "Progresso da meta de faturamento"),
      card("Valor faltante", money(metrics.remainingAmount), "Quanto falta para bater a meta", "text-amber-700"),
      card("Ritmo necessario por dia", money(metrics.requiredRevenuePerDay), `${toNumber(metrics.daysRemaining)} dias restantes`, "text-rose-700"),
      card("Ticket medio atual", money(metrics.ticketAverageCurrent), goal.averageTicketTarget ? `Meta: ${money(goal.averageTicketTarget)}` : "Sem meta de ticket definida"),
      card("Atendimentos concluidos", `${toNumber(metrics.appointmentsCompleted)}`, `Meta: ${toNumber(goal.appointmentsTarget)}`),
      card("Dias restantes", `${toNumber(metrics.daysRemaining)}`, `Mes com ${toNumber(metrics.daysTotal)} dias`),
    ].join("");
  }

  if (elements.progress) {
    elements.progress.innerHTML = `
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-xs uppercase tracking-wide text-slate-500 font-semibold">Progresso da meta</div>
            <div class="text-2xl font-black text-slate-900 mt-1">${pct(metrics.goalProgressPercent)}</div>
            <div class="text-sm text-slate-600 mt-1">${money(metrics.revenueCurrent)} de ${money(goal.revenueTarget)}</div>
          </div>
          <span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${pace.chip}">${pace.label}</span>
        </div>
        <div class="mt-3 h-3 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full ${pace.bar}" style="width: ${Math.min(progressPercent, 100)}%"></div>
        </div>
        <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">${pace.message}</div>
      </article>
    `;
  }

  if (elements.professionals) {
    if (!professionals.length) {
      elements.professionals.innerHTML = emptyBlock(
        "Ainda nao ha atendimentos concluidos suficientes para calcular a performance.",
      );
    } else {
      elements.professionals.innerHTML = professionals
        .slice(0, 6)
        .map((row, index) => {
          const highlight = index === 0 ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white";
          return `
            <article class="rounded-xl border ${highlight} p-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">#${toNumber(row.rank)}</div>
                  <div class="text-sm font-bold text-slate-900">${row.name}</div>
                </div>
                <div class="text-sm font-black text-slate-900">${money(row.revenue)}</div>
              </div>
              <div class="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>Atendimentos: <strong>${toNumber(row.completedAppointments)}</strong></div>
                <div>Ticket: <strong>${money(row.ticketAverage)}</strong></div>
                <div>Ocupacao: <strong>${pct(row.occupancyRate)}</strong></div>
                <div>Comissao estimada: <strong>${money(row.commissionEstimated)}</strong></div>
              </div>
            </article>
          `;
        })
        .join("");
    }
  }

  if (elements.services) {
    if (!services.length) {
      elements.services.innerHTML = emptyBlock(
        "Ainda nao ha atendimentos concluidos suficientes para calcular a performance.",
      );
    } else {
      elements.services.innerHTML = services
        .slice(0, 6)
        .map(
          (row) => `
            <article class="rounded-xl border border-slate-200 bg-white p-3">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="text-sm font-bold text-slate-900">${row.name}</div>
                  <div class="text-xs text-slate-500 mt-1">${toNumber(row.quantity)} realizados</div>
                </div>
                <div class="text-right">
                  <div class="text-sm font-black text-slate-900">${money(row.revenue)}</div>
                  <div class="text-xs text-slate-500">${pct(row.sharePct)} da receita</div>
                </div>
              </div>
              <div class="mt-2 text-xs text-slate-600">Ticket medio: <strong>${money(row.ticketAverage)}</strong></div>
            </article>
          `,
        )
        .join("");
    }
  }

  if (elements.insights) {
    const content = insights.length
      ? insights
          .map(
            (item) =>
              `<li class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">${item}</li>`,
          )
          .join("")
      : `<li class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">Ainda nao ha insights suficientes para este periodo.</li>`;

    elements.insights.innerHTML = `<ul class="space-y-2">${content}</ul>`;
  }
}
