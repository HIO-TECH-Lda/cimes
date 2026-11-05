// Verificação de licenças (G.12 / R-17): todas as dependências de produção devem
// ter licença MIT, Apache-2.0, BSD, ISC ou OFL. A ser corrido no CI.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = /^(MIT|Apache-2\.0|BSD-\d-Clause|BSD-\d-Clause-(OR-)?(GPL|MIT)|BSD|ISC|CC0-1\.0|0BSD|OFL-1\.\d|Unlicense|CC-BY-4\.0)/;

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const seen = new Set();
const failures = [];

function resolveModule(name) {
  const [scope, base] = name.startsWith("@") ? name.split("/") : [null, name];
  const baseDir = scope ? join(root, "node_modules", scope) : join(root, "node_modules");
  if (!existsSync(baseDir)) return null;
  if (scope) {
    const dir = join(baseDir, base);
    return existsSync(dir) ? dir : null;
  }
  return existsSync(join(baseDir, base)) ? join(baseDir, base) : null;
}

function visit(name, via) {
  if (seen.has(name)) return;
  seen.add(name);
  const dir = resolveModule(name);
  if (!dir) {
    failures.push(`${name} (via ${via}): pacote não resolvido`);
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    failures.push(`${name} (via ${via}): package.json ilegível`);
    return;
  }
  const license = typeof manifest.license === "string" ? manifest.license : manifest.licenses?.[0] ?? "(sem licença)";
  if (!ALLOWED.test(license)) {
    failures.push(`${name} (via ${via}): licença "${license}" não permitida`);
  }
  for (const dep of Object.keys(manifest.dependencies ?? {})) visit(dep, name);
}

for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, "package.json");

if (failures.length > 0) {
  console.error("Licenças não permitidas ou problemas:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${seen.size} dependências de produção verificadas — licenças OK.`);