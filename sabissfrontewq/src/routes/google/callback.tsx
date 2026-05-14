import { Title } from "@solidjs/meta";
import { onMount } from "solid-js";

import {
  GOOGLE_AUTH_POPUP_MESSAGE_TYPE,
  parseGoogleAuthPopupHash,
} from "~/lib/auth/google.ts";

export default function GoogleAuthCallback() {
  onMount(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload = parseGoogleAuthPopupHash(window.location.hash);

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          ...payload,
          type: GOOGLE_AUTH_POPUP_MESSAGE_TYPE,
        },
        window.location.origin,
      );
    }

    window.setTimeout(() => {
      window.close();
    }, 60);
  });

  return (
    <main class="pm-auth-callback">
      <Title>Google Sign-In</Title>
      <p class="pm-auth-callback__message">Completing Google sign-in…</p>
    </main>
  );
}
