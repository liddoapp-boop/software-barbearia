export const APPOINTMENT_SERVICES_MIN = 1;
export const APPOINTMENT_SERVICES_MAX = 6;

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeSelectedServices(input = [], servicesById = {}) {
  const ids = Array.isArray(input) ? input : [];
  const seen = new Set();
  const selected = [];
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw.trim() : text(raw?.id || raw?.serviceId);
    if (!id || seen.has(id)) continue;
    const service = servicesById[id] || (raw && typeof raw === "object" ? raw : null);
    if (!service) continue;
    selected.push(service);
    seen.add(id);
    if (selected.length >= APPOINTMENT_SERVICES_MAX) break;
  }
  return selected;
}

export function addServiceSelection(current = [], service, options = {}) {
  if (!service?.id) {
    return { ok: false, selected: [...current], message: "Servico invalido." };
  }
  if (isServiceSelected(current, service.id)) {
    return { ok: false, selected: [...current], message: "Este servico ja foi selecionado." };
  }
  const max = options.max ?? APPOINTMENT_SERVICES_MAX;
  if (current.length >= max) {
    return { ok: false, selected: [...current], message: `Selecione no maximo ${max} servicos.` };
  }
  if (service.active === false || service.isActive === false) {
    return { ok: false, selected: [...current], message: "Servico inativo nao pode ser selecionado." };
  }
  return { ok: true, selected: [...current, service], message: "" };
}

export function removeServiceSelection(current = [], serviceId) {
  const id = text(serviceId);
  return current.filter((service) => service?.id !== id);
}

export function clearServiceSelection() {
  return [];
}

export function isServiceSelected(current = [], serviceId) {
  const id = text(serviceId);
  return Boolean(id) && current.some((service) => service?.id === id);
}

export function getSelectedServiceIds(current = []) {
  return current.map((service) => text(service?.id)).filter(Boolean);
}

export function validateSelectedServices(current = []) {
  const ids = getSelectedServiceIds(current);
  if (ids.length < APPOINTMENT_SERVICES_MIN) {
    return { ok: false, message: "Selecione ao menos um servico." };
  }
  if (ids.length > APPOINTMENT_SERVICES_MAX) {
    return { ok: false, message: `Selecione no maximo ${APPOINTMENT_SERVICES_MAX} servicos.` };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, message: "Nao repita servicos no mesmo agendamento." };
  }
  return { ok: true, message: "" };
}

export function buildServiceSelectionLabel(current = [], fallback = "Servico") {
  const names = current.map((service) => text(service?.name || service?.serviceNameSnapshot)).filter(Boolean);
  return names.length ? names.join(" + ") : fallback;
}

export function calculateCatalogTotal(current = []) {
  return Number(
    current
      .reduce((acc, service) => acc + numberValue(service?.price ?? service?.servicePriceSnapshot), 0)
      .toFixed(2),
  );
}

export function normalizeAppointmentServiceItems(appointment = {}, servicesById = {}) {
  const rows = Array.isArray(appointment.serviceItems) && appointment.serviceItems.length
    ? [...appointment.serviceItems].sort((a, b) => numberValue(a.position) - numberValue(b.position))
    : [];
  if (rows.length) {
    return rows.map((item) => ({
      id: text(item.serviceId),
      serviceId: text(item.serviceId),
      name: text(item.serviceNameSnapshot || item.name || servicesById[item.serviceId]?.name, "Servico"),
      price: numberValue(item.servicePriceSnapshot ?? item.price ?? servicesById[item.serviceId]?.price),
      durationMin: numberValue(
        item.serviceDurationMinSnapshot ?? item.durationMin ?? item.durationMinutes ?? servicesById[item.serviceId]?.durationMin,
      ),
      position: numberValue(item.position),
    })).filter((item) => item.serviceId);
  }
  const legacyId = text(appointment.serviceId || appointment.service?.id);
  if (!legacyId) return [];
  const service = servicesById[legacyId] || appointment.service || {};
  return [{
    id: legacyId,
    serviceId: legacyId,
    name: text(appointment.serviceNameSnapshot || service.name, "Servico"),
    price: numberValue(appointment.servicePriceSnapshot ?? appointment.servicePrice ?? service.price),
    durationMin: numberValue(
      appointment.serviceDurationMinSnapshot ?? appointment.serviceDurationMin ?? service.durationMin ?? service.durationMinutes,
    ),
    position: 0,
  }];
}

export function interpretBackendSummary(payload = {}, fallbackSelection = []) {
  const source = payload.summary || payload.appointment || payload;
  const items = normalizeAppointmentServiceItems(source, {});
  const total = numberValue(
    source.totalPriceSnapshot ?? source.totalPrice ?? source.servicePrice ?? source.price,
    calculateCatalogTotal(fallbackSelection),
  );
  const effectiveDurationMin = numberValue(
    source.effectiveDurationMinSnapshot ?? source.effectiveDurationMin ?? source.serviceDurationMin,
    0,
  );
  return {
    serviceItems: items,
    totalPrice: total,
    effectiveDurationMin,
    calculationMode: text(source.durationCalculationMode || source.calculationMode),
    ruleId: text(source.durationRuleIdSnapshot || source.ruleId),
    ruleLabel: text(source.durationRuleLabelSnapshot || source.ruleLabel),
  };
}

export function isMultiServiceAppointment(appointment = {}) {
  const items = normalizeAppointmentServiceItems(appointment, {});
  return items.length > 1;
}
