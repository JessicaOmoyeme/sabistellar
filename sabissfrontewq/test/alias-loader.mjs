import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const loaderDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(loaderDir, "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("~/")) {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(projectRoot, "src", specifier.slice(2))).href,
    };
  }

  return nextResolve(specifier, context);
}
