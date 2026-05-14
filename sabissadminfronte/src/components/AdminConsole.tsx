import { Show, createSignal } from "solid-js";

import { useAdminAuth } from "~/lib/admin-auth-context";

import AdminNavbar from "./AdminNavbar";
import AdminWorkspace from "./AdminWorkspace";

export default function AdminConsole() {
  const auth = useAdminAuth();
  const [adminDrawerOpen, setAdminDrawerOpen] = createSignal(false);

  return (
    <div class="pm-admin-page">
      <AdminNavbar
        adminDrawerOpen={adminDrawerOpen()}
        onToggleAdminDrawer={() => setAdminDrawerOpen(open => !open)}
      />

      <main class={`pm-admin-main${auth.profile() ? " pm-admin-main--workspace" : ""}`}>
        <Show
          when={auth.profile()}
          fallback={
            <section class="pm-admin-panel">
              <button
                class="pm-button pm-button--primary pm-button--large"
                type="button"
                disabled={auth.pending()}
                onClick={auth.openAuthDialog}
              >
                {auth.pending() ? "Checking session..." : "Connect wallet"}
              </button>

              <Show when={auth.error()}>
                {message => <p class="pm-admin-inline-error">{message()}</p>}
              </Show>
            </section>
          }
        >
          {profile => (
            <AdminWorkspace
              profile={profile()}
              open={adminDrawerOpen()}
              onClose={() => setAdminDrawerOpen(false)}
            />
          )}
        </Show>
      </main>
    </div>
  );
}
