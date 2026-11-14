// Background sync: one MCP call at a time, spaced for the 1-call-a-minute limit.
// Reads once and stores; afterwards spends calls on what changes (get_signals, whoami),
// and writes the CRM's own conclusions back with write_note (deduped).
import crypto from "node:crypto";
import { callTool, nextCallInMs } from "./mcp.js";
import { load, save } from "./store.js";
import { analyze, normaliseAccounts, notesToWrite } from "./analyze.js";

export const store = load();
const status = { running: false, busy: null, lastError: null, started: Date.now() };
const MIN = 60000;
const MAX_NOTES = Number(process.env.MAX_NOTES || 40);

const log = (msg) => {
  store.log.push({ at: Date.now(), msg });
  store.log = store.log.slice(-60);
  console.log(new Date().toISOString(), msg);
};
const age = (name) => (store.fetched[name] ? Date.now() - store.fetched[name].at : Infinity);
const failedAt = {};
const backedOff = (k) => failedAt[k] && Date.now() - failedAt[k] < 5 * MIN;

function accountKeys() {
  return normaliseAccounts(store.fetched.get_my_accounts?.data).map((a) => a.key);
}

// Jobs in priority order (lower prio number wins when due).
function dueJobs() {
  const jobs = [];
  const add = (name, args, every, prio, fetchedKey = name) => age(fetchedKey) > every && !backedOff(fetchedKey) && jobs.push({ name, args, prio, fetchedKey, age: age(fetchedKey) });
  add("get_my_accounts", {}, 20 * MIN, 1);
  add("get_signals", {}, 2.5 * MIN, 2);
  for (const k of accountKeys()) add("get_all_paperwork", { account: k }, 20 * MIN, 3, `paperwork_${k}`);
  add("get_flytbase_team", {}, 60 * MIN, 5);
  add("get_feature_requests", {}, 60 * MIN, 5);
  add("get_release_notes", {}, 60 * MIN, 6);
  add("whoami", {}, 10 * MIN, 7);
  add("get_data_format", {}, 6 * 60 * MIN, 8);
  return jobs.sort((a, b) => a.prio - b.prio || b.age - a.age);
}

const hash = (n) => crypto.createHash("sha1").update(`${n.account}|${n.kind}|${n.title}`).digest("hex").slice(0, 16);

function pendingNote() {
  if (!store.fetched.get_my_accounts || accountKeys().some((k) => !store.fetched[`paperwork_${k}`])) return null; // wait for full picture
  if (Object.keys(store.notesWritten).length >= MAX_NOTES) return null;
  const notes = notesToWrite(analyze(store));
  return notes.find((n) => !store.notesWritten[hash(n)] && !backedOff(`note_${hash(n)}`)) ?? null;
}

async function step() {
  if (status.busy) return;
  if (nextCallInMs() > 0) return;
  const jobs = dueJobs();
  const nonEssential = jobs.filter((j) => j.prio >= 5);
  const essential = jobs.filter((j) => j.prio < 5);
  let job = essential[0];
  let note = null;
  if (!job) {
    note = pendingNote();
    if (!note) job = nonEssential[0];
  }
  if (!job && !note) return;
  try {
    if (note) {
      status.busy = `write_note ${note.kind}`;
      await callTool("write_note", note);
      store.notesWritten[hash(note)] = { at: Date.now(), account: note.account, kind: note.kind, title: note.title };
      log(`wrote ${note.kind} note on ${note.account}: ${note.title.slice(0, 70)}`);
    } else {
      status.busy = job.name + (job.args.account ? `(${job.args.account})` : "");
      const data = await callTool(job.name, job.args);
      const prev = store.fetched[job.fetchedKey]?.data;
      store.fetched[job.fetchedKey] = { at: Date.now(), data };
      if (job.name === "get_signals") store.signals = data;
      const changed = JSON.stringify(prev) !== JSON.stringify(data);
      log(`${status.busy} ok${job.name === "get_signals" && prev !== undefined && changed ? " — NEW SIGNALS" : ""}`);
    }
    status.lastError = null;
    save(store);
  } catch (e) {
    status.lastError = { at: Date.now(), call: status.busy, message: String(e.message).slice(0, 300) };
    log(`${status.busy} FAILED: ${e.message.slice(0, 120)}`);
    // Back off this job for 5 minutes so one failing call cannot starve the others.
    if (job) failedAt[job.fetchedKey] = Date.now();
    else if (note) failedAt[`note_${hash(note)}`] = Date.now();
  } finally {
    status.busy = null;
  }
}

export function start() {
  if (status.running) return;
  status.running = true;
  if (!process.env.AQ_TOKEN) log("AQ_TOKEN not set: serving stored data only");
  setInterval(() => step().catch((e) => console.error(e)), 3000);
}

export function getStatus() {
  return {
    tokenConfigured: !!process.env.AQ_TOKEN,
    busy: status.busy,
    lastError: status.lastError,
    nextCallInSec: Math.ceil(nextCallInMs() / 1000),
    fetched: Object.fromEntries(Object.entries(store.fetched).map(([k, v]) => [k, v.at])),
    notesWritten: Object.keys(store.notesWritten).length,
    log: store.log.slice(-15).reverse(),
    uptimeSec: Math.round((Date.now() - status.started) / 1000),
  };
}
