export function safeParseMessageStubParameters(parameters) {
  if (!Array.isArray(parameters)) return [];

  return parameters.flatMap((value) => {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return parsed && typeof parsed === "object" ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

export function makeSafeOfflineNodeProcessor(nodeProcessorMap, deps) {
  const nodes = [];
  let isProcessing = false;
  let idlePromise = Promise.resolve();

  const report = (error, context) => {
    try {
      deps.onUnexpectedError(error instanceof Error ? error : new Error(String(error)), context);
    } catch {
      // Observability must never stop the receive queue.
    }
  };

  const start = () => {
    if (isProcessing) return;
    isProcessing = true;

    idlePromise = (async () => {
      try {
        while (nodes.length && deps.isWsOpen()) {
          const { type, node } = nodes.shift();
          const nodeProcessor = nodeProcessorMap.get(type);

          if (!nodeProcessor) {
            report(new Error(`unknown offline node type: ${type}`), "processing offline node");
            continue;
          }

          try {
            await nodeProcessor(node);
          } catch (error) {
            report(error, `processing offline ${type}`);
          }
        }
      } finally {
        isProcessing = false;
        if (nodes.length && deps.isWsOpen()) queueMicrotask(start);
      }
    })();

    idlePromise.catch((error) => report(error, "processing offline nodes"));
  };

  return {
    enqueue(type, node) {
      nodes.push({ type, node });
      start();
    },
    whenIdle() {
      return idlePromise;
    },
    diagnosticState() {
      return { isProcessing, queued: nodes.length };
    },
  };
}
