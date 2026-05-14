const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_AUTH_CALLBACK_PATH = "/google/callback";
export const GOOGLE_AUTH_POPUP_MESSAGE_TYPE = "sabi:google-auth-result";
const GOOGLE_POPUP_TIMEOUT_MS = 2 * 60 * 1000;

export interface GooglePopupSignInResult {
  credential: string;
}

export interface GoogleAuthPopupMessage {
  type: typeof GOOGLE_AUTH_POPUP_MESSAGE_TYPE;
  state: string | null;
  idToken: string | null;
  error: string | null;
  errorDescription: string | null;
}

function generateRandomToken(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function readTokenNonce(idToken: string): string | null {
  try {
    const parts = idToken.split(".");

    if (parts.length < 2) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

function buildPopupFeatures(width: number, height: number): string {
  const outerWidth =
    typeof window.outerWidth === "number" && window.outerWidth > 0
      ? window.outerWidth
      : window.innerWidth;
  const outerHeight =
    typeof window.outerHeight === "number" && window.outerHeight > 0
      ? window.outerHeight
      : window.innerHeight;
  const left = Math.max(0, window.screenX + Math.round((outerWidth - width) / 2));
  const top = Math.max(0, window.screenY + Math.round((outerHeight - height) / 2));

  return [
    "popup=yes",
    "toolbar=no",
    "menubar=no",
    "width=" + width,
    "height=" + height,
    "left=" + left,
    "top=" + top,
  ].join(",");
}

export function buildGoogleAuthRedirectUri(origin: string): string {
  return new URL(GOOGLE_AUTH_CALLBACK_PATH, origin).toString();
}

export function parseGoogleAuthPopupHash(hash: string): GoogleAuthPopupMessage {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  return {
    type: GOOGLE_AUTH_POPUP_MESSAGE_TYPE,
    state: params.get("state"),
    idToken: params.get("id_token"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
  };
}

export async function startGooglePopupSignIn(
  clientId: string,
): Promise<GooglePopupSignInResult> {
  if (typeof window === "undefined") {
    throw new Error("Google sign-in is only available in the browser.");
  }

  const normalizedClientId = clientId.trim();

  if (!normalizedClientId) {
    throw new Error("Google sign-in is not configured.");
  }

  const redirectUri = buildGoogleAuthRedirectUri(window.location.origin);
  const state = generateRandomToken();
  const nonce = generateRandomToken();
  const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);

  authUrl.searchParams.set("client_id", normalizedClientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("response_mode", "fragment");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);

  const popup = window.open(
    authUrl.toString(),
    "sabi-google-auth",
    buildPopupFeatures(520, 640),
  );

  if (!popup) {
    throw new Error("Google sign-in popup was blocked.");
  }

  popup.focus();

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google sign-in timed out."));
    }, GOOGLE_POPUP_TIMEOUT_MS);

    const cleanup = () => {
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);

      try {
        popup.close();
      } catch {
        // Ignore popup close failures after cross-origin redirects.
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as Partial<GoogleAuthPopupMessage> | null;

      if (!payload || payload.type !== GOOGLE_AUTH_POPUP_MESSAGE_TYPE) {
        return;
      }

      cleanup();

      if (payload.state !== state) {
        reject(new Error("Invalid Google sign-in state."));
        return;
      }

      if (payload.error) {
        reject(
          new Error(payload.errorDescription || payload.error.replace(/_/g, " ")),
        );
        return;
      }

      if (typeof payload.idToken !== "string" || payload.idToken.length === 0) {
        reject(new Error("Google sign-in did not return a credential."));
        return;
      }

      const tokenNonce = readTokenNonce(payload.idToken);

      if (tokenNonce !== nonce) {
        reject(new Error("Google sign-in returned an invalid nonce."));
        return;
      }

      resolve({
        credential: payload.idToken,
      });
    };

    window.addEventListener("message", onMessage);
  });
}
