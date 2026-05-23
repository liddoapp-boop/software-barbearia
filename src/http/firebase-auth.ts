import crypto from "node:crypto";
import https from "node:https";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "";
const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCerts: Record<string, string> | null = null;
let certsExpiry = 0;

async function fetchGoogleCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < certsExpiry) return cachedCerts;

  return new Promise((resolve, reject) => {
    https
      .get(GOOGLE_CERTS_URL, (res) => {
        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => {
          try {
            const certs = JSON.parse(data) as Record<string, string>;
            cachedCerts = certs;
            certsExpiry = Date.now() + 3_600_000;
            resolve(certs);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

export interface FirebaseTokenPayload {
  uid: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
}

export async function verifyFirebaseIdToken(token: string): Promise<FirebaseTokenPayload> {
  if (!FIREBASE_PROJECT_ID) throw new Error("FIREBASE_PROJECT_ID nao configurado");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Token invalido");

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = JSON.parse(
    Buffer.from(headerB64, "base64url").toString(),
  ) as { alg?: string; kid?: string };

  if (header.alg !== "RS256" || !header.kid) throw new Error("Token invalido");

  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString(),
  ) as {
    iss?: string;
    aud?: string;
    sub?: string;
    email?: string;
    name?: string;
    email_verified?: boolean;
    exp?: number;
    iat?: number;
  };

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error("Token invalido");
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error("Token invalido");
  }
  if (!payload.exp || payload.exp <= now) throw new Error("Token expirado");
  if (!payload.iat || payload.iat > now + 300) throw new Error("Token invalido");
  if (!payload.sub) throw new Error("Token invalido");

  const certs = await fetchGoogleCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("Token invalido");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${headerB64}.${payloadB64}`);
  const valid = verifier.verify(cert, Buffer.from(signatureB64, "base64url"));
  if (!valid) throw new Error("Token invalido");

  return {
    uid: payload.sub,
    email: payload.email,
    name: payload.name,
    email_verified: payload.email_verified,
  };
}

export function isFirebaseToken(token: string): boolean {
  try {
    const [headerB64] = token.split(".");
    if (!headerB64) return false;
    const header = JSON.parse(
      Buffer.from(headerB64, "base64url").toString(),
    ) as { alg?: string };
    return header.alg === "RS256";
  } catch {
    return false;
  }
}
