#!/usr/bin/env bun
/**
 * TT Players — Deployment Health Check
 *
 * Reads docs/deployment.md as the source of truth, then runs a full
 * deployment health check against the production stack and prints a
 * structured report.
 *
 * Usage:
 *   bun run .agents/skills/deployment-check/scripts/check-deployment.ts
 *   # or, read deployment doc from a path:
 *   DEPLOY_DOC=docs/deployment.md bun run <script>
 */

import { $ } from "bun";

// ── helpers ──────────────────────────────────────────────────────────

type CheckResult = { label: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
function add(label: string, ok: boolean, detail: string) {
  results.push({ label, ok, detail });
}

async function http(
  label: string,
  url: string,
  opts?: { maxTime?: number; checkBody?: (body: string) => string }
): Promise<void> {
  const maxTime = opts?.maxTime ?? 30;
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(maxTime * 1000) });
    const body = await res.text();
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    if (res.ok) {
      const detail = opts?.checkBody ? opts.checkBody(body) : `HTTP ${res.status}`;
      console.log(`  ${label.padEnd(32)} ${detail.padEnd(14)} ✅  (${elapsed}s)`);
      add(label, true, detail);
    } else {
      console.log(`  ${label.padEnd(32)} HTTP ${res.status}`.padEnd(50) + ` ❌  (${elapsed}s)`);
      add(label, false, `HTTP ${res.status} — ${body.slice(0, 120)}`);
    }
  } catch (e: any) {
    console.log(`  ${label.padEnd(32)} ${(e.cause?.message ?? e.message ?? String(e)).slice(0, 40)} ❌`);
    add(label, false, e.cause?.message ?? e.message ?? String(e));
  }
}

function banner(text: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${"─".repeat(60)}`);
}

// ── parse deployment.md ──────────────────────────────────────────────

function parseDeployDoc(path: string) {
  const text = require("fs").readFileSync(path, "utf8");

  // Anchor to section headers so we target the right service block.
  const staticSection = text.match(/### Render Static Site([\s\S]*?)(?=### Render API Service)/)?.[1] ?? "";
  const apiSection = text.match(/### Render API Service([\s\S]*?)(?=###)/)?.[1] ?? "";

  const staticServiceId = staticSection.match(/Service ID:\s*`([^`]+)`/)?.[1] ?? "";
  const apiServiceId = apiSection.match(/Service ID:\s*`([^`]+)`/)?.[1] ?? "";
  // URLs are inside fenced code blocks: "```text\n<url>\n```"
  const staticUrl = staticSection.match(/Render URL:[\s\S]*?https:\/\/([^\s]+?\.onrender\.com)/)?.[1] ?? "";
  const apiUrl = apiSection.match(/Direct Render URL:[\s\S]*?https:\/\/([^\s]+?\.onrender\.com)/)?.[1] ?? "";

  // Fallback: try body-wide matches for url if section extraction missed them
  const staticUrlFallback = text.match(/Render URL:[\s\S]*?https:\/\/([^\s]+?\.onrender\.com)/)?.[1] ?? "";
  const apiUrlFallback = text.match(/Direct Render URL:[\s\S]*?https:\/\/([^\s]+?\.onrender\.com)/)?.[1] ?? "";

  const customDomain = text.match(/custom domain:\s*`([^`]+)`/)?.[1] ?? "tt-players.graceliu.uk";

  const rewriteMatch = text.match(/source:\s*\/api\/\*[\s\S]*?destination:\s*(https:\/\/[^\s`]+)/);
  const expectedRewriteDest = rewriteMatch?.[1] ?? (apiUrl || apiUrlFallback ? `${apiUrl || apiUrlFallback}/api/*` : "");

  return {
    apiServiceId: apiServiceId,
    staticServiceId: staticServiceId,
    apiUrl: apiUrl || apiUrlFallback,
    staticUrl: staticUrl || staticUrlFallback,
    customDomain,
    expectedRewriteDest,
  };
}

// ── main ─────────────────────────────────────────────────────────────

const deployDocPath = process.env.DEPLOY_DOC ?? "docs/deployment.md";
let cfg: ReturnType<typeof parseDeployDoc>;
try {
  cfg = parseDeployDoc(deployDocPath);
} catch (e) {
  console.error(`Failed to read ${deployDocPath}: ${e}`);
  process.exit(1);
}

const { apiServiceId, staticServiceId, apiUrl: apiHost, staticUrl: staticHost, customDomain, expectedRewriteDest } = cfg;
const apiUrl = apiHost ? `https://${apiHost}` : "";
const staticUrl = staticHost ? `https://${staticHost}` : "";

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  TT Players — Deployment Health Report");
console.log(`  ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

// ── 1. Render services ───────────────────────────────────────────────

banner("Render Services");
try {
  const svcRaw = await $`render services --output json`.quiet();
  const services = JSON.parse(svcRaw.stdout.toString()) as any[];

  for (const svc of services) {
    const s = svc.service;
    const suspended = s.suspended !== "not_suspended";
    const icon = suspended ? "❌" : "✅";
    console.log(`  ${s.name} (${s.type})  ${icon} LIVE`);
    if (suspended) add(s.name, false, `suspended: ${s.suspended}`);
    else add(s.name, true, s.type);
  }
} catch (e: any) {
  console.log("  ⚠️  Render CLI unavailable");
  add("render-cli", false, e.message ?? String(e));
}

// ── 2. Deploy status ─────────────────────────────────────────────────

banner("Latest Deploys");
for (const [name, sid] of [
  ["tt-players (static)", staticServiceId],
  ["tt-players-api (web)", apiServiceId],
]) {
  try {
    const dRaw = await $`render deploys list ${sid} --output json`.quiet();
    const deploys = JSON.parse(dRaw.stdout.toString()) as any[];
    const latest = deploys[0];
    const statusIcon = latest.status === "live" ? "✅" : "⚠️";
    console.log(`  ${name}  ${statusIcon} ${latest.status}`);
    console.log(`    ID:     ${latest.id}`);
    console.log(`    Commit: ${latest.commit.message.slice(0, 72)}`);
    console.log(`    Done:   ${latest.finishedAt}`);
    add(`deploy/${name}`, latest.status === "live", latest.id);
  } catch (e: any) {
    console.log(`  ${name}  ❌ failed to fetch`);
    add(`deploy/${name}`, false, e.message ?? String(e));
  }
}

// ── 3. DNS ────────────────────────────────────────────────────────────

banner("DNS");
try {
  const digRaw = await $`dig +short ${customDomain}`.quiet();
  const digOut = digRaw.stdout.toString().trim();
  const hasRender = digOut.includes(".onrender.com");
  console.log(`  ${customDomain} → ${digOut.split("\n")[0]}  ${hasRender ? "✅" : "❌"}`);
  add("dns", hasRender, digOut.split("\n")[0]);
} catch (e: any) {
  add("dns", false, e.message ?? String(e));
}

// ── 4. Health endpoints ──────────────────────────────────────────────

banner("Endpoints");

// First API call gets a longer timeout for cold starts
await http("health.json (frontend)", `https://${customDomain}/health.json`, {
  checkBody: (b) => {
    try { JSON.parse(b); return "200"; } catch { return `invalid json`; }
  },
});

await http("api/health (API direct)", `${apiUrl}/api/health`, {
  maxTime: 90,
  checkBody: (b) => {
    try { const j = JSON.parse(b); return `200 ${j.status}`; } catch { return `200`; }
  },
});

await http("api/health/db (API direct)", `${apiUrl}/api/health/db`, {
  checkBody: (b) => {
    try { const j = JSON.parse(b); return j.database === "ok" ? "200 db=ok" : `200 db=${j.database}`; } catch { return `200`; }
  },
});

await http("api/health (static rewrite)", `${staticUrl}/api/health`);

await http("api/health (custom domain)", `https://${customDomain}/api/health`);

await http("api/leagues (custom domain)", `https://${customDomain}/api/leagues`, {
  checkBody: (b) => {
    try { const j = JSON.parse(b); return `200 items=${Array.isArray(j.data) ? j.data.length : "?"}`; } catch { return `200`; }
  },
});

// ── 5. Rewrite route ─────────────────────────────────────────────────

banner("Rewrite Route");
try {
  const apiKey = (await $`awk '/key:/ {print $2; exit}' ~/.render/cli.yaml`.quiet()).stdout.toString().trim();
  const routesRaw = await fetch(`https://api.render.com/v1/services/${staticServiceId}/routes`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const routes = (await routesRaw.json()) as any[];
  for (const r of routes) {
    const rt = r.route;
    if (rt.source === "/api/*") {
      const match = rt.destination === expectedRewriteDest;
      console.log(`  /api/* → ${rt.destination}  ${match ? "✅ MATCHES API URL" : "❌ MISMATCH"}`);
      add("rewrite/api", match, rt.destination);
    } else if (rt.source === "/*") {
      console.log(`  /*     → ${rt.destination}  ✅`);
      add("rewrite/spa", rt.destination === "/index.html", rt.destination);
    }
  }
} catch (e: any) {
  console.log("  ⚠️  Could not check rewrite routes");
  add("rewrite/api", false, e.message ?? String(e));
}

// ── 6. Data sanity ───────────────────────────────────────────────────

banner("Data");
try {
  const pcRaw = await fetch(`https://${customDomain}/api/players/count`, {
    signal: AbortSignal.timeout(30_000),
  });
  const pc = await pcRaw.json() as any;
  console.log(`  players: ${pc.players ?? "?"}`);
  console.log(`  matches: ${pc.matches ?? "?"}`);
  add("data/players", !!pc.players, `${pc.players ?? "?"}`);
} catch (e: any) {
  add("data/players", false, e.message ?? String(e));
}

// ── 7. Aiven database ────────────────────────────────────────────────

banner("Database");
try {
  const avnRaw = await $`avn service get tt-players-db --project ${process.env.AIVEN_PROJECT ?? ""}`.quiet();
  const avnOut = avnRaw.stdout.toString();
  const running = avnOut.includes("RUNNING");
  console.log(`  Aiven tt-players-db  ${running ? "✅ RUNNING" : "❌"}`);
  add("aiven", running, avnOut.split("\n").slice(0, 3).join(" | "));
} catch (e: any) {
  console.log("  ⚠️  Aiven CLI not available — skip");
  add("aiven", false, "cli unavailable");
}

// ── 8. JS bundle audit ───────────────────────────────────────────────

banner("JS Bundle Audit");
try {
  const htmlRes = await fetch(`https://${customDomain}`, { signal: AbortSignal.timeout(30_000) });
  const html = await htmlRes.text();
  const jsMatch = html.match(/\/assets\/index-[^" ]+\.js/);
  if (!jsMatch) {
    add("js-bundle", false, "could not find JS bundle in HTML");
  } else {
    const jsRes = await fetch(`https://${customDomain}${jsMatch[0]}`, {
      signal: AbortSignal.timeout(30_000),
    });
    const js = await jsRes.text();
    const apiHost = apiUrl.replace("https://", "");
    const hasApiSubdomain = apiHost ? js.includes(apiHost) : false;
    const hasSlashApi = js.includes("/api");
    console.log(`  hasApiSubdomain: ${hasApiSubdomain}  ${hasApiSubdomain ? "❌" : "✅"}`);
    console.log(`  hasSlashApi:     ${hasSlashApi}  ${hasSlashApi ? "✅" : "❌"}`);
    add("js-bundle", !hasApiSubdomain && hasSlashApi, `subdomain=${hasApiSubdomain} slash-api=${hasSlashApi}`);
  }
} catch (e: any) {
  add("js-bundle", false, e.message ?? String(e));
}

// ── summary ──────────────────────────────────────────────────────────

banner("Issues Found");
const failures = results.filter((r) => !r.ok);
if (failures.length === 0) {
  console.log("  None ✅");
} else {
  for (const f of failures) {
    console.log(`  ❌ ${f.label} — ${f.detail}`);
  }
}

console.log("\n" + "━".repeat(60));
