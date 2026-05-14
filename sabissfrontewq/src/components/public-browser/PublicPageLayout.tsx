import { Title } from "@solidjs/meta";
import type { JSX } from "solid-js";
import { Show, children, createMemo } from "solid-js";

import Navbar from "~/components/Navbar";

interface PublicPageLayoutProps {
  title: string;
  kicker?: string;
  heading: string;
  summary?: string | null;
  actions?: JSX.Element;
  children: JSX.Element;
}

export default function PublicPageLayout(props: PublicPageLayoutProps) {
  const resolvedActions = children(() => props.actions);
  const hasActions = createMemo(() => resolvedActions.toArray().length > 0);

  return (
    <div class="pm-page">
      <Title>{props.title}</Title>
      <Navbar />

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

          <Show when={hasActions()}>
            <div class="pm-browser__hero-actions">{resolvedActions()}</div>
          </Show>
        </section>

        {props.children}
      </main>
    </div>
  );
}
