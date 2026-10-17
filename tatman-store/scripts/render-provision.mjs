#!/usr/bin/env node
/**
 * Creates/updates the Tatman Vet web service on Render via API.
 * Requires env: RENDER_API_KEY
 */
const KEY = process.env.RENDER_API_KEY;
if (!KEY) {
  console.error("Set RENDER_API_KEY first");
  process.exit(1);
}

const API = "https://api.render.com/v1";
const headers = {
  Authorization: `Bearer ${KEY}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function req(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    console.error(method, path, res.status, text.slice(0, 800));
    throw new Error(`Render API ${res.status}`);
  }
  return data;
}

const owner = process.env.RENDER_OWNER_ID;
const repoURL = "https://github.com/htoom47-cloud/rare-vet-lims";
const branch = "cursor/tatman-vet-store-8ce2";

const owners = await req("GET", "/owners");
const ownerId =
  owner ||
  owners.find((o) => o.owner?.email || o.email)?.owner?.id ||
  owners[0]?.owner?.id ||
  owners[0]?.id;
console.log("owner", ownerId, JSON.stringify(owners).slice(0, 400));

const services = await req("GET", "/services?limit=50");
const list = Array.isArray(services) ? services : services;
const existing = list
  .map((row) => row.service || row)
  .find((s) => s.name === "tatman-vet-store" || s.name === "tatman-vet-web");
console.log("existing", existing?.id, existing?.type, existing?.name);

const payload = {
  type: "web_service",
  name: "tatman-vet-web",
  ownerId,
  repo: repoURL,
  branch,
  rootDir: "tatman-store",
  autoDeploy: "yes",
  serviceDetails: {
    runtime: "node",
    buildCommand: "npm ci && npm run build",
    startCommand: "npm start",
    healthCheckPath: "/api/health",
    env: "node",
    plan: "starter",
    region: "frankfurt",
    numInstances: 1,
  },
  envVars: [
    { key: "NODE_VERSION", value: "22" },
    { key: "NODE_ENV", value: "production" },
    { key: "DATA_DIR", value: "/var/data" },
    { key: "ADMIN_PASSWORD", value: process.env.ADMIN_PASSWORD || "Tatman#2026" },
    { key: "SESSION_SECRET", generateValue: true },
  ],
};

if (existing && existing.type === "static_site") {
  console.log("Static site exists; creating separate web service tatman-vet-web");
}

const created = await req("POST", "/services", payload);
console.log("created", created.id || created.service?.id, created.service?.serviceDetails?.url || created.url);
