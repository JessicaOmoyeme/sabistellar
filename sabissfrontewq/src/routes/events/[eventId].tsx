import { useParams } from "@solidjs/router";

import { EventResourceScreen } from "~/components/public-browser/index.ts";

export default function EventResourceRoute() {
  const params = useParams<{ eventId: string }>();

  return <EventResourceScreen eventId={params.eventId} />;
}
