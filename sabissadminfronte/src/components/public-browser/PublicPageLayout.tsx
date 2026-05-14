import { Title } from "@solidjs/meta";
import type { JSX } from "solid-js";
import { Show } from "solid-js";

import AdminNavbar from "~/components/AdminNavbar";

interface PublicPageLayoutProps {
  title: string;
  kicker?: string;
  heading: string;
  summary?: string | null;
  actions?: JSX.Element;
  children: JSX.Element;
}

export default function PublicPageLayout(props: PublicPageLayoutProps) {
  return (
    <div class="pm-page">
      <Title>{props.title}</Title>
      <AdminNavbar />

      <main class="pm-detail">
        <section class="pm-home__hero pm-browser__hero">
          <div class="pm-home__hero-copy">
            <Show when={props.kicker}>
              <p class="pm-home__hero-kicker">{props.kicker}</p>
            </Show>
            <h1 class="pm-home__hero-title">{props.heading}</h1>
            <Show when={props.summary}>
              <p class="pm-home__hero-text">{props.summary}</p>
            </Show>
          </div>

          <Show when={props.actions}>
            <div class="pm-browser__hero-actions">{props.actions}</div>
          </Show>
        </section>

        {props.children}
      </main>
    </div>
  );
}
