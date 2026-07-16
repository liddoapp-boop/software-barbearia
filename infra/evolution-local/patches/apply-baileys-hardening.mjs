import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const evolutionRoot = process.env.EVOLUTION_ROOT || "/evolution";
const processMessagePath = path.join(evolutionRoot, "node_modules/baileys/lib/Utils/process-message.js");
const messagesRecvPath = path.join(evolutionRoot, "node_modules/baileys/lib/Socket/messages-recv.js");

const expectedHashes = {
  [processMessagePath]: "91007a4b85a49198bf50d063d34a54d645c6bab6430b4f54eed5443c69fe4981",
  [messagesRecvPath]: "8b9329ddf95fa7a1785826d8861af236f5f055ff22a5ed1ce52afdf9565d873e",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readVerified(filePath) {
  const source = readFileSync(filePath, "utf8");
  const actual = sha256(source);
  if (actual !== expectedHashes[filePath]) {
    throw new Error(`Evolution patch refused: unexpected upstream file hash for ${path.basename(filePath)}.`);
  }
  return source;
}

let processMessage = readVerified(processMessagePath);
const processImportAnchor = "import { downloadAndProcessHistorySyncNotification } from './history.js';";
if (!processMessage.includes(processImportAnchor)) throw new Error("Evolution patch refused: process-message import anchor missing.");
processMessage = processMessage.replace(
  processImportAnchor,
  `${processImportAnchor}\nimport { safeParseMessageStubParameters } from './software-barbearia-hardening.js';`,
);

const unsafeParse = "message.messageStubParameters.map((a) => JSON.parse(a)) || []";
const unsafeParseCount = processMessage.split(unsafeParse).length - 1;
if (unsafeParseCount !== 5) throw new Error(`Evolution patch refused: expected 5 unsafe stub parsers, found ${unsafeParseCount}.`);
processMessage = processMessage.split(unsafeParse).join("safeParseMessageStubParameters(message.messageStubParameters)");

let messagesRecv = readVerified(messagesRecvPath);
const recvImportAnchor = "import { makeMutex } from '../Utils/make-mutex.js';";
if (!messagesRecv.includes(recvImportAnchor)) throw new Error("Evolution patch refused: messages-recv import anchor missing.");
messagesRecv = messagesRecv.replace(
  recvImportAnchor,
  `${recvImportAnchor}\nimport { makeSafeOfflineNodeProcessor } from '../Utils/software-barbearia-hardening.js';`,
);

const offlineProcessorPattern = /    const makeOfflineNodeProcessor = \(\) => \{[\s\S]*?    const offlineNodeProcessor = makeOfflineNodeProcessor\(\);/;
if (!offlineProcessorPattern.test(messagesRecv)) throw new Error("Evolution patch refused: offline processor anchor missing.");
messagesRecv = messagesRecv.replace(
  offlineProcessorPattern,
  `    const offlineNodeProcessor = makeSafeOfflineNodeProcessor(\n        new Map([\n            ['message', handleMessage],\n            ['call', handleCall],\n            ['receipt', handleReceipt],\n            ['notification', handleNotification]\n        ]),\n        {\n            isWsOpen: () => ws.isOpen,\n            onUnexpectedError\n        }\n    );`,
);

if (processMessage.includes(unsafeParse)) throw new Error("Evolution patch failed: unsafe stub parser remains.");
if (messagesRecv.includes("const makeOfflineNodeProcessor = () =>")) throw new Error("Evolution patch failed: unsafe offline processor remains.");

writeFileSync(processMessagePath, processMessage);
writeFileSync(messagesRecvPath, messagesRecv);

console.log("Evolution Baileys hardening applied: guarded stub parsing and fail-safe offline queue.");
