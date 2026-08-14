// Granular subpath imports (not the top-level `jose` package) so the bundle
// only includes JWS sign/verify — the top-level export also pulls in JWE
// decrypt code that depends on CompressionStream/DecompressionStream,
// which aren't available in the Edge Runtime that middleware.ts runs in
// (and which this app never uses: no encryption, only signing).
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// jose (not next-auth) specifically because it works unmodified in both the
// Node runtime (the login route) and the Edge runtime (middleware.ts) —
// this app has no per-user accounts to justify a full auth library, just a
// single signed session cookie gating the one shared app password.
function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set — required to sign/verify the session cookie. " +
        "Generate one with `openssl rand -base64 32`.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ auth: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}
