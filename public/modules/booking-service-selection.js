(function (root) {
  const BOOKING_SERVICES_MIN = 1;
  const BOOKING_SERVICES_MAX = 6;

  function text(value, fallback = "") {
    const normalized = String(value ?? "").trim();
    return normalized || fallback;
  }

  function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeService(service) {
    if (!service || typeof service !== "object") return null;
    const id = text(service.id || service.serviceId);
    if (!id) return null;
    return {
      ...service,
      id,
      name: text(service.name || service.serviceNameSnapshot, "Servico"),
      price: numberValue(service.price ?? service.servicePriceSnapshot),
      duration: numberValue(service.duration ?? service.durationMinutes ?? service.durationMin ?? service.serviceDurationMinSnapshot),
    };
  }

  function isSelected(current = [], serviceId) {
    const id = text(serviceId);
    return Boolean(id) && current.some((service) => service?.id === id);
  }

  function add(current = [], service, options = {}) {
    const normalized = normalizeService(service);
    if (!normalized) return { ok: false, selected: [...current], message: "Servico invalido." };
    if (isSelected(current, normalized.id)) {
      return { ok: false, selected: [...current], message: "Este servico ja foi selecionado." };
    }
    const max = options.max ?? BOOKING_SERVICES_MAX;
    if (current.length >= max) {
      return { ok: false, selected: [...current], message: `Selecione no maximo ${max} servicos.` };
    }
    return { ok: true, selected: [...current, normalized], message: "" };
  }

  function remove(current = [], serviceId) {
    const id = text(serviceId);
    return current.filter((service) => service?.id !== id);
  }

  function clear() {
    return [];
  }

  function ids(current = []) {
    return current.map((service) => text(service?.id)).filter(Boolean);
  }

  function validate(current = []) {
    const serviceIds = ids(current);
    if (serviceIds.length < BOOKING_SERVICES_MIN) return { ok: false, message: "Selecione ao menos um servico." };
    if (serviceIds.length > BOOKING_SERVICES_MAX) return { ok: false, message: `Selecione no maximo ${BOOKING_SERVICES_MAX} servicos.` };
    if (new Set(serviceIds).size !== serviceIds.length) return { ok: false, message: "Nao repita servicos no mesmo agendamento." };
    return { ok: true, message: "" };
  }

  function label(current = [], fallback = "Servicos") {
    const names = current.map((service) => text(service?.name || service?.serviceNameSnapshot)).filter(Boolean);
    return names.length ? names.join(" + ") : fallback;
  }

  function catalogTotal(current = []) {
    return Number(current.reduce((sum, service) => sum + numberValue(service?.price ?? service?.servicePriceSnapshot), 0).toFixed(2));
  }

  function normalizeItems(payload = {}, fallbackSelection = []) {
    const source = payload.summary || payload.appointment || payload;
    const rawItems = Array.isArray(source.serviceItems) ? [...source.serviceItems] : [];
    if (rawItems.length) {
      return rawItems
        .sort((a, b) => numberValue(a.position) - numberValue(b.position))
        .map((item, position) => ({
          serviceId: text(item.serviceId || item.id),
          name: text(item.serviceNameSnapshot || item.name, "Servico"),
          price: numberValue(item.servicePriceSnapshot ?? item.price),
          duration: numberValue(item.serviceDurationMinSnapshot ?? item.durationMin ?? item.durationMinutes ?? item.duration),
          position: numberValue(item.position, position),
        }))
        .filter((item) => item.serviceId);
    }
    return fallbackSelection.map((service, position) => ({
      serviceId: service.id,
      name: text(service.name, "Servico"),
      price: numberValue(service.price),
      duration: numberValue(service.duration ?? service.durationMinutes ?? service.durationMin),
      position,
    }));
  }

  function interpretPreview(payload = {}, fallbackSelection = []) {
    const source = payload.summary || payload.appointment || payload;
    const serviceItems = normalizeItems(source, fallbackSelection);
    return {
      serviceItems,
      serviceIds: ids(serviceItems.map((item) => ({ id: item.serviceId }))),
      label: label(serviceItems.map((item) => ({ name: item.name })), "Servicos"),
      totalPrice: numberValue(source.totalPriceSnapshot ?? source.totalPrice ?? source.price, catalogTotal(fallbackSelection)),
      effectiveDurationMin: numberValue(source.effectiveDurationMinSnapshot ?? source.effectiveDurationMin ?? source.durationMinutes),
      ruleLabel: text(source.durationRuleLabelSnapshot || source.ruleLabel),
      calculationMode: text(source.durationCalculationMode || source.calculationMode),
    };
  }

  root.BookingServiceSelection = {
    BOOKING_SERVICES_MIN,
    BOOKING_SERVICES_MAX,
    normalizeService,
    isSelected,
    add,
    remove,
    clear,
    ids,
    validate,
    label,
    catalogTotal,
    normalizeItems,
    interpretPreview,
  };
})(typeof window !== "undefined" ? window : globalThis);
