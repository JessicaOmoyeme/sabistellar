import { normalizeApiBaseUrl, requestJson } from "../api.ts";
import type {
  ConfigClientOptions,
  PublicContractsConfigResponse,
} from "./types.ts";

function readViteEnv(key: "VITE_API_BASE_URL"): string | undefined {
  return import.meta.env?.[key];
}

export interface ConfigClient {
  fetchContractsConfig(): Promise<PublicContractsConfigResponse>;
}

export function createConfigClient(options: ConfigClientOptions = {}): ConfigClient {
  const baseUrl = normalizeApiBaseUrl(options.baseUrl);

  return {
    fetchContractsConfig() {
      return requestJson<PublicContractsConfigResponse>(baseUrl, "/config/contracts");
    },
  };
}

export const configClient = createConfigClient({
  baseUrl: readViteEnv("VITE_API_BASE_URL"),
});

export { ApiError } from "../api.ts";
