// Mirrors https://campgroundless.com/site-config.json into site/site-config.json so
// older iPhone builds that still fetch the github.io address get current policy.
// Writes only a structurally valid schemaVersion 1 config; prints "changed" or "unchanged".
import { readFile, writeFile } from "node:fs/promises";

const source = "https://campgroundless.com/site-config.json";
const target = new URL("../site/site-config.json", import.meta.url);
const allowed = new Set(["schemaVersion", "updatedAt", "integrations", "features", "defaults"]);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const response = await fetch(source, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error(`${source} returned ${response.status}`);
const config = await response.json();
if (!isObject(config) || config.schemaVersion !== 1) throw new Error("Unexpected schemaVersion.");
for (const key of Object.keys(config)) if (!allowed.has(key)) throw new Error(`Unexpected key ${key}.`);
for (const key of ["integrations", "features", "defaults"]) if (!isObject(config[key])) throw new Error(`${key} must be an object.`);
for (const group of ["integrations", "features"]) {
  for (const [id, value] of Object.entries(config[group])) {
    if (!isObject(value) || Object.keys(value).join() !== "enabled" || typeof value.enabled !== "boolean") {
      throw new Error(`${group}.${id} must be exactly {"enabled": boolean}.`);
    }
  }
}

const next = `${JSON.stringify(config, null, 2)}\n`;
const current = await readFile(target, "utf8").catch(() => "");
const same = current && JSON.stringify(JSON.parse(current)) === JSON.stringify(config);
if (!same) await writeFile(target, next);
console.log(same ? "unchanged" : "changed");