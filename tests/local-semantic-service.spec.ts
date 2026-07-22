import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const MODEL = "google_gemma-3-4b-it-Q4_K_M.gguf";

async function loadService() {
  return await import(pathToFileURL(path.join(process.cwd(), "scripts/local-semantic-service.mjs")).href) as {
    LOCAL_SEMANTIC_HOST: string;
    LOCAL_SEMANTIC_PORT: number;
    requiredHelpFlags: string[];
    validateHelpText: (help: string) => boolean;
    buildLlamaArgs: (modelPath: string, modelName?: string) => string[];
    isOwnedProcess: (state: unknown, processInfo: unknown) => boolean;
  };
}

describe("launcher semantico local", () => {
  it("usa somente flags confirmadas e fixa loopback, porta, contexto e concorrencia", async () => {
    const service = await loadService();
    const modelPath = path.resolve("fixtures", MODEL);
    const args = service.buildLlamaArgs(modelPath, MODEL);

    expect(args).toEqual([
      "--model", modelPath,
      "--alias", MODEL,
      "--ctx-size", "4096",
      "--parallel", "1",
      "--host", "127.0.0.1",
      "--port", "11435",
      "--no-ui",
    ]);
    expect(service.LOCAL_SEMANTIC_HOST).toBe("127.0.0.1");
    expect(service.LOCAL_SEMANTIC_PORT).toBe(11435);
  });

  it("reprova executavel cujo --help nao confirma todas as flags", async () => {
    const service = await loadService();
    const completeHelp = service.requiredHelpFlags.map((flag) => `${flag} VALUE`).join("\n");
    expect(service.validateHelpText(completeHelp)).toBe(true);
    expect(() => service.validateHelpText(completeHelp.replace("--parallel VALUE", ""))).toThrow(/--parallel/);
  });

  it("reconhece somente o PID com executavel e marcadores exatos do launcher", async () => {
    const service = await loadService();
    const executablePath = path.resolve("llama", "llama-server.exe");
    const modelPath = path.resolve("models", MODEL);
    const state = { pid: 321, executablePath, modelPath, model: MODEL };
    const commandLine = `\"${executablePath}\" --model \"${modelPath}\" --alias ${MODEL} --host 127.0.0.1 --port 11435`;

    expect(service.isOwnedProcess(state, { pid: 321, executablePath, commandLine })).toBe(true);
    expect(service.isOwnedProcess(state, { pid: 322, executablePath, commandLine })).toBe(false);
    expect(service.isOwnedProcess(state, { pid: 321, executablePath: path.resolve("other.exe"), commandLine })).toBe(false);
    expect(service.isOwnedProcess(state, { pid: 321, executablePath, commandLine: commandLine.replace("11435", "8080") })).toBe(false);
  });
});
