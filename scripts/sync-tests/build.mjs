// Gera um bundle ESM único (sem chunks partilhados) de src/lib/* para os testes de sync.
// Cada `import(bundle + "?pc=X")` cria uma instância independente do store (= outro PC / separador).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { rolldown } from "rolldown";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
export const OUT_DIR = process.env.ECC_SYNC_BUNDLE_DIR || "/tmp/ecc-sync-tests";
export const OUT_FILE = path.join(OUT_DIR, "bundle.mjs");

export async function buildBundle() {
  mkdirSync(OUT_DIR, { recursive: true });
  const bundle = await rolldown({
    input: path.join(here, "entry.ts"),
    platform: "node",
    resolve: { alias: { "@": path.join(root, "src") } },
    logLevel: "silent",
  });
  await bundle.write({ file: OUT_FILE, format: "esm", codeSplitting: false });
  await bundle.close?.();
  return OUT_FILE;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildBundle().then((f) => console.log("bundle:", f));
}
