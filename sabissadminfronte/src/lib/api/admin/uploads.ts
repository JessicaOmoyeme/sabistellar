import { apiRequest } from "~/lib/api/core";
import { resolveAdminToken } from "~/lib/auth/admin-session";

import type { AdminImageUploadResponse } from "./types";

interface UploadAdminImageOptions {
  file: File | Blob;
  token?: string | null;
  scope?: string;
  fileName?: string;
  signal?: AbortSignal;
}

export function uploadAdminImage({
  file,
  token,
  scope,
  fileName,
  signal,
}: UploadAdminImageOptions) {
  const formData = new FormData();
  const normalizedFileName = fileName ?? ("name" in file ? file.name : "upload");

  formData.append("file", file, normalizedFileName);

  if (scope) {
    formData.append("scope", scope);
  }

  return apiRequest<AdminImageUploadResponse>({
    method: "POST",
    path: "/admin/uploads/images",
    formData,
    token: resolveAdminToken(token),
    signal,
  });
}
