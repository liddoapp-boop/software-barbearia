import { pathToFileURL } from "node:url";
import {
  collectEvolutionDoctorSnapshot,
  evaluateEvolutionDoctorSnapshot,
  hashIncident,
  loadEvolutionLocalConfig,
} from "./evolution-common.mjs";

export function formatDoctorReport(snapshot, evaluation) {
  const lines = [
    `Evolution doctor: ${evaluation.ok ? "OK" : "FALHA"}`,
    `- containers: api=${snapshot.containers.api.status || "missing"}, postgres=${snapshot.containers.postgres.health}, redis=${snapshot.containers.redis.health}`,
    `- runtime: Evolution=${snapshot.runtimeVersions?.evolution || "indisponivel"}, Baileys=${snapshot.runtimeVersions?.baileys || "indisponivel"}`,
    `- imagem: tag=${snapshot.containers.api.configuredImage || "indisponivel"}, imageId=${snapshot.containers.api.imageId || "indisponivel"}`,
    `- base imutavel: ${snapshot.lock.baseDigest}`,
    `- instancia: ${snapshot.connectionState || "indisponivel"}`,
    `- backend 3334: ${snapshot.backendStatus || "indisponivel"}; container->backend: ${snapshot.containerConnectivityStatus || "indisponivel"}`,
    `- webhook: ${snapshot.webhook?.enabled ? "habilitado" : "indisponivel/desabilitado"}; MESSAGES_UPSERT=${snapshot.webhook?.events?.includes("MESSAGES_UPSERT") === true}`,
    `- erro conhecido desde o inicio: ${snapshot.knownOfflineQueueErrors}`,
    `- ultima recepcao persistida: ${snapshot.lastReceptionAt || "indisponivel"}`,
    `- ultimo webhook inferido: ${snapshot.lastWebhookAt || "indisponivel"} (a Evolution nao persiste o timestamp de sucesso; inferencia pelo MESSAGES_UPSERT persistido)`,
    "- nota: ausencia de mensagens por tempo decorrido nao prova travamento.",
  ];
  for (const issue of evaluation.issues) lines.push(`- [${issue.code}] ${issue.message}`);
  return lines.join("\n");
}

export async function runEvolutionDoctor({ env = process.env, print = console.log, bootstrap = false } = {}) {
  const config = loadEvolutionLocalConfig(env);
  let snapshot = await collectEvolutionDoctorSnapshot(config);
  let evaluation = evaluateEvolutionDoctorSnapshot(snapshot, config);

  if (bootstrap) {
    const ignoredBeforeBackendStart = new Set(["backend_unhealthy", "container_connectivity_failed"]);
    evaluation = {
      issues: evaluation.issues.filter((issue) => !ignoredBeforeBackendStart.has(issue.code)),
      ok: evaluation.issues.filter((issue) => !ignoredBeforeBackendStart.has(issue.code)).length === 0,
    };
  }

  if (
    !bootstrap
    &&
    config.autoRecoverEnabled
    && snapshot.knownOfflineQueueErrors > 0
    && !evaluation.issues.some((issue) => ["latest_forbidden", "runtime_tag_mismatch", "runtime_digest_mismatch"].includes(issue.code))
  ) {
    const { runEvolutionRecovery } = await import("./evolution-recover.mjs");
    const incidentId = hashIncident(`${snapshot.containers.api.startedAt}:known_offline_queue_error`);
    await runEvolutionRecovery({ env, reason: "known_offline_queue_error", incidentId, print });
    snapshot = await collectEvolutionDoctorSnapshot(config);
    evaluation = evaluateEvolutionDoctorSnapshot(snapshot, config);
  }

  print(formatDoctorReport(snapshot, evaluation));
  return { snapshot, evaluation };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runEvolutionDoctor({ bootstrap: process.argv.includes("--bootstrap") }).then(({ evaluation }) => {
    process.exitCode = evaluation.ok ? 0 : 1;
  }).catch((error) => {
    console.error(`Evolution doctor failed safely: ${error.message}`);
    process.exitCode = 1;
  });
}
