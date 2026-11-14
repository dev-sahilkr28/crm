// MCP client + a strict one-call-a-minute queue. Token only ever comes from the environment.
const MCP_URL = process.env.MCP_URL || "https://questathon.aihackerscollective.com/api/public/mcp";
const SPACING_MS = Number(process.env.CALL_SPACING_MS || 62000); // 1 call/min per token, with a margin

let lastCall = 0;
let chain = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rawCall(name, args = {}) {
  const token = process.env.AQ_TOKEN;
  if (!token) throw new Error("AQ_TOKEN is not set on the server");
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    // Server may answer as an event stream: take the last "data:" line.
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    if (!lines.length) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    body = JSON.parse(lines[lines.length - 1].slice(5));
  }
  const { result, error } = body;
  if (error || !result || result.isError) {
    throw new Error(error?.message ?? result?.content?.[0]?.text ?? `HTTP ${res.status}`);
  }
  const t = result.content?.[0]?.text;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

// All calls go through here, one at a time, spaced out.
export function callTool(name, args = {}) {
  const run = async () => {
    const wait = lastCall + SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      return await rawCall(name, args);
    } catch (e) {
      // Rate-limit error: back off a full minute so the next call is clean.
      if (/rate|limit|too many|429/i.test(String(e.message))) lastCall = Date.now() + 30000;
      throw e;
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

export const nextCallInMs = () => Math.max(0, lastCall + SPACING_MS - Date.now());
