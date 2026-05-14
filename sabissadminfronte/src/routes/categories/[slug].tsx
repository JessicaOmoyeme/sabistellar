import { useParams } from "@solidjs/router";

import { CategoryDetailScreen } from "~/components/public-browser/index.ts";

export default function CategoryDetailRoute() {
  const params = useParams<{ slug: string }>();

  return <CategoryDetailScreen slug={params.slug} />;
}
