import { Show } from "solid-js";

interface PublicStateProps {
  title: string;
  copy: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function PublicState(props: PublicStateProps) {
  return (
    <section class="pm-detail__state">
      <h2 class="pm-detail__state-title">{props.title}</h2>
      <p class="pm-home__state-copy">{props.copy}</p>
      <Show when={props.actionLabel && props.onAction}>
        <button type="button" class="pm-button pm-button--primary" onClick={() => props.onAction?.()}>
          {props.actionLabel}
        </button>
      </Show>
    </section>
  );
}
