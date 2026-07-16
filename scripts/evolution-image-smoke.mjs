import { pathToFileURL } from "node:url";
import path from "node:path";
import { projectRoot, runCommand } from "./evolution-common.mjs";

const compose = path.join(projectRoot, "infra", "evolution-local", "docker-compose.smoke.yml");
const project = "software-barbearia-evolution-smoke";

export function runEvolutionImageSmoke() {
  const base = ["compose", "-p", project, "-f", compose];
  try {
    runCommand("docker", [...base, "up", "-d", "--wait"], { timeoutMs: 120_000, maxBuffer: 64 * 1024 * 1024 });
    const result = runCommand("docker", [...base, "exec", "-T", "api", "node", "--input-type=module", "-e", [
      "import fs from 'node:fs'",
      "import {safeParseMessageStubParameters,makeSafeOfflineNodeProcessor} from '/evolution/node_modules/baileys/lib/Utils/software-barbearia-hardening.js'",
      "const source=fs.readFileSync('/evolution/node_modules/baileys/lib/Utils/process-message.js','utf8')",
      "const persisted=[];const webhook=[]",
      "const q=makeSafeOfflineNodeProcessor(new Map([['notification',async n=>{if(safeParseMessageStubParameters(n.params).length)throw new Error('unsafe')}],['message',async n=>{persisted.push(n.id);webhook.push(n.id)}]]),{isWsOpen:()=>true,onUnexpectedError:()=>{}})",
      "q.enqueue('notification',{params:['{\\\"lid\\\":\\\"ok\\\"} trailing']});q.enqueue('message',{id:'valid'});await q.whenIdle()",
      "const ok=!source.includes('message.messageStubParameters.map((a) => JSON.parse(a))')&&persisted[0]==='valid'&&webhook[0]==='valid'&&!q.diagnosticState().isProcessing",
      "console.log(JSON.stringify({imageSmoke:ok,queue:q.diagnosticState()}));if(!ok)process.exit(1)",
    ].join(";")], { timeoutMs: 30_000 });
    process.stdout.write(result.stdout);
  } finally {
    runCommand("docker", [...base, "down", "--remove-orphans"], { allowFailure: true, timeoutMs: 60_000 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runEvolutionImageSmoke();
  } catch (error) {
    console.error(`Evolution image smoke failed: ${error.message}`);
    process.exitCode = 1;
  }
}
