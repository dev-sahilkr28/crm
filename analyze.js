// Turns raw MCP data into the five answers per account.
// Schema-tolerant on purpose: field names are looked up from several likely spellings, and anything
// that cannot be backed by an id is shown apart rather than guessed. Nothing here invents ids.

const DAY = 86400000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ---------- small helpers ----------
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : isObj(x) ? Object.values(x) : []);
const pick = (o, ...keys) => {
  if (!isObj(o)) return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
const pickRe = (o, re) => {
  if (!isObj(o)) return undefined;
  for (const k of Object.keys(o)) if (re.test(k) && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};
const str = (x) => (x == null ? "" : typeof x === "string" ? x : JSON.stringify(x));
const idOf = (o) => (isObj(o) ? pick(o, "id", "ref", "file_id", "fileId", "key", "uid") : undefined);
const nameOf = (o) => str(pick(o, "name", "full_name", "fullName", "title", "label", "person") || idOf(o) || "");
const fmtDate = (t) => (t == null ? null : new Date(t).toISOString().slice(0, 10));
const daysBetween = (a, b) => Math.round((a - b) / DAY);

export function parseMoney(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { n: v, cur: null } : null;
  const s = String(v);
  const m = s.match(/([$£€₹]|USD|GBP|EUR|INR)?\s*([\d][\d,]*(?:\.\d+)?)\s*(k|m|mn|million|thousand)?\b/i);
  if (!m) return null;
  let n = parseFloat(m[2].replace(/,/g, ""));
  const suf = (m[3] || "").toLowerCase();
  if (suf === "k" || suf === "thousand") n *= 1e3;
  if (suf === "m" || suf === "mn" || suf === "million") n *= 1e6;
  return { n, cur: m[1] || null };
}

export function parseDate(v, ref = Date.now()) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v > 1e11 ? v : v * 1000;
  const s = String(v);
  const iso = Date.parse(s);
  if (!Number.isNaN(iso) && /\d{4}/.test(s)) return iso;
  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/i);
  if (m) return dateFromParts(+m[1], MONTHS.indexOf(m[2].toLowerCase()), m[3] ? +m[3] : null, ref);
  const m2 = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  if (m2) return dateFromParts(+m2[2], MONTHS.indexOf(m2[1].toLowerCase()), m2[3] ? +m2[3] : null, ref);
  return Number.isNaN(iso) ? null : iso;
}
function dateFromParts(d, mon, y, ref) {
  const now = new Date(ref);
  let year = y ?? now.getUTCFullYear();
  let t = Date.UTC(year, mon, d);
  if (y == null && t < ref - 45 * DAY) t = Date.UTC(year + 1, mon, d);
  return t;
}
function findDates(text, ref) {
  const out = [];
  const re = /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/gi;
  let m;
  while ((m = re.exec(text))) out.push({ t: dateFromParts(+m[1], MONTHS.indexOf(m[2].toLowerCase()), m[3] ? +m[3] : null, ref), raw: m[0] });
  return out;
}
const monthOnly = (text, ref) => {
  const m = text.match(/\b(?:in|from|by|until|end of)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  return { t: dateFromParts(1, mon, null, ref), raw: m[0] };
};
function endOfWeek(t) {
  const d = new Date(t);
  const add = (5 - d.getUTCDay() + 7) % 7; // Friday
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add);
}
const startOfDay = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// ---------- normalisation ----------
export function normaliseAccounts(data) {
  if (!data) return [];
  let list = [];
  const top = pick(data, "accounts", "my_accounts", "data") ?? data;
  if (Array.isArray(top)) list = top.map((a, i) => ({ key: str(pick(a, "account", "key", "code", "letter", "id") ?? "ABCDEFG"[i]), raw: a }));
  else if (isObj(top)) {
    const keys = Object.keys(top);
    const looksLikeSingle = keys.some((k) => /^(deals|people|contacts)$/i.test(k));
    if (looksLikeSingle) list = [{ key: str(pick(top, "account", "key", "id") ?? "A"), raw: top }];
    else list = keys.filter((k) => isObj(top[k])).map((k) => ({ key: k, raw: top[k] }));
  }
  return list.map((a) => ({ ...a, key: a.key.length > 8 ? a.key : a.key }));
}

function normaliseSignals(data) {
  const list = Array.isArray(data) ? data : arr(pick(data, "signals", "events", "items", "data") ?? data);
  return list.filter(isObj).map((s, i) => ({
    id: idOf(s) ?? null,
    pos: i,
    at: parseDate(pick(s, "at", "date", "when", "timestamp", "created_at", "occurred_at", "time")),
    atRaw: str(pick(s, "at", "date", "when", "timestamp", "created_at", "occurred_at", "time")),
    account: str(pick(s, "account", "account_id", "accountKey") ?? ""),
    title: str(pick(s, "title", "headline", "name", "subject", "summary") ?? ""),
    body: str(pick(s, "body", "details", "detail", "text", "description", "content", "message") ?? ""),
    raw: s,
  }));
}

function flattenPaperwork(data) {
  // Accept {records:[{path,...}]}, {path: content}, or arrays. Each record -> {path, kind, text}
  const out = [];
  const visit = (v, p) => {
    if (typeof v === "string") return out.push({ path: p, text: v });
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        if (isObj(x) && (x.path || x.id || x.name)) {
          const pth = str(x.path ?? x.id ?? x.name);
          const body = pick(x, "content", "text", "body", "data", "record") ?? x;
          out.push({ path: pth, text: str(body), obj: x });
        } else visit(x, `${p}[${i}]`);
      });
      return;
    }
    if (isObj(v)) {
      if ((v.path || v.id) && (v.content || v.text || v.body)) {
        return out.push({ path: str(v.path ?? v.id), text: str(v.content ?? v.text ?? v.body), obj: v });
      }
      for (const k of Object.keys(v)) visit(v[k], p ? `${p}/${k}` : k);
    }
  };
  visit(data, "");
  return out.map((r) => ({ ...r, kind: kindOfRecord(r.path, r.text) }));
}
function kindOfRecord(path, text) {
  const s = `${path}`.toLowerCase();
  if (/contract|agreement|order|quote|invoice|\bpo\b|msa|sow|usage|telemetry|licen[cs]e/.test(s)) return "hard";
  if (/call|email|mail|note|message|transcript|chat|meeting/.test(s)) return "claim";
  return "other";
}

// ---------- per-account analysis ----------
export function analyze(store, now = Date.now()) {
  const accountsData = store.fetched.get_my_accounts?.data;
  const accounts = normaliseAccounts(accountsData);
  const allSignals = normaliseSignals(store.signals?.length ? store.signals : store.fetched.get_signals?.data);
  const team = arr(pick(store.fetched.get_flytbase_team?.data ?? {}, "team", "people", "members") ?? store.fetched.get_flytbase_team?.data).filter(isObj);
  const features = arr(pick(store.fetched.get_feature_requests?.data ?? {}, "requests", "feature_requests", "items") ?? store.fetched.get_feature_requests?.data).filter(isObj);

  const out = accounts.map((acc, idx) => analyseAccount(acc, idx, { store, allSignals, team, features, now, count: accounts.length }));
  return {
    asOf: now,
    accounts: out,
    diagnostics: {
      accountsFound: accounts.length,
      signalsFound: allSignals.length,
      topLevelKeys: isObj(accountsData) ? Object.keys(accountsData) : Array.isArray(accountsData) ? ["<array>"] : [],
    },
  };
}

function analyseAccount(acc, idx, ctx) {
  const { store, allSignals, team, features, now } = ctx;
  const raw = acc.raw;
  const key = acc.key;
  const S = (p) => `get_my_accounts › ${key} › ${p}`;

  const deals = arr(pick(raw, "deals", "opportunities", "pipeline")).filter(isObj);
  const people = arr(pick(raw, "people", "contacts", "stakeholders")).filter(isObj);
  const deadlinesRaw = arr(pick(raw, "deadlines", "milestones", "dates", "key_dates")).filter(isObj);
  const files = arr(pick(raw, "files", "documents")).filter(isObj);
  const offers = arr(pick(raw, "offers", "proposals", "quotes")).filter(isObj);
  const facts = pick(raw, "facts", "notes") ?? null;
  const accountName = str(pick(raw, "name", "account_name", "company", "customer", "org") ?? `Account ${key}`);

  // paperwork for this account
  const pw = store.fetched[`paperwork_${key}`]?.data ?? store.fetched[`paperwork_${accountName}`]?.data;
  const records = pw ? flattenPaperwork(pw) : [];
  const knownIds = new Set([...files, ...offers, ...deals, ...people, ...deadlinesRaw].map(idOf).filter(Boolean).map(String));
  records.forEach((r) => knownIds.add(r.path));

  // signals for this account (explicit account field, or text mentions the account / its people)
  const personNames = people.map(nameOf).filter(Boolean);
  const signals = allSignals.filter((s) => {
    const a = s.account.toLowerCase();
    if (a) return a === key.toLowerCase() || a.includes(accountName.toLowerCase()) || a === `account ${key}`.toLowerCase();
    const t = `${s.title} ${s.body}`.toLowerCase();
    return t.includes(accountName.toLowerCase()) || personNames.some((n) => n && t.includes(n.toLowerCase()));
  });
  const src = (id, fallback) => ({ id: id ?? null, where: fallback });

  // ===== people (used by Q2, Q4, Q5) =====
  const departing = [];
  const signalText = (s) => `${s.title}. ${s.body}`;
  const recText = (r) => r.text;

  const P = people.map((p, i) => {
    const role = str(pick(p, "role", "buying_role", "buyer_role", "influence", "title", "job_title", "position") ?? "");
    const roleAll = Object.entries(p).filter(([k]) => /role|title|position|influence|decision|budget|use|block/i.test(k)).map(([, v]) => str(v)).join(" ").toLowerCase();
    const stand = str(pick(p, "stance", "sentiment", "standing", "relationship", "attitude", "support", "status", "temperature") ?? pickRe(p, /stance|sentiment|relationship|support|attitude/i) ?? "");
    const lastTouch = parseDate(pick(p, "last_contact", "lastContact", "last_contacted", "last_touch", "last_interaction", "last_spoke"));
    const nm = nameOf(p);
    const classes = [];
    if (/decision|decid|sign[- ]?off|approv|economic|sponsor|authority|director|head of|chief|commander|superintendent|chief constable|\bcto\b|\bcfo\b|\bceo\b/.test(roleAll)) classes.push("decides");
    if (/budget|pay|financ|procure|purchas|\bcfo\b|commercial|contract/.test(roleAll)) classes.push("pays");
    if (/user|operator|pilot|daily|day[- ]to[- ]day|programme lead|program lead|champion/.test(roleAll)) classes.push("uses");
    if (/block|veto|legal|security|compliance|risk|procure|sceptic|skeptic|oppos|resist|\bit\b|data protection|dpo/.test(roleAll + " " + stand.toLowerCase())) classes.push("blocks");
    const linkedDeals = [].concat(pick(p, "deals", "deal", "deal_id", "dealId", "deal_ids") ?? []).map(String);
    return { i, id: idOf(p) ?? null, name: nm, role, stand, lastTouch, classes, linkedDeals, raw: p, cite: src(idOf(p), S(`people[${i}]`)) };
  });

  // leaving contacts, from signals + paperwork
  const leaveRe = /(leav(?:e|es|ing)|moving on|stepping down|resign|departing|last day|retir)/i;
  for (const p of P) {
    const first = p.name.split(/\s+/).slice(-1)[0]?.toLowerCase();
    const hits = [];
    for (const s of signals) {
      const t = signalText(s);
      if (leaveRe.test(t) && p.name && (t.toLowerCase().includes(p.name.toLowerCase()) || (first && first.length > 3 && t.toLowerCase().includes(first)))) hits.push({ kind: "signal", s, t });
    }
    for (const r of records) {
      if (r.kind === "claim" && leaveRe.test(r.text) && p.name && r.text.toLowerCase().includes(p.name.toLowerCase())) hits.push({ kind: "record", r, t: r.text });
    }
    if (hits.length) {
      const h = hits[0];
      const dt = monthOnly(h.t, now) ?? findDates(h.t, now)[0] ?? null;
      const succ = /no successor|successor (?:not|isn't|is not)|not (?:yet )?named/i.test(h.t) ? false : /successor|replac(?:ed|ement)|handing over to/i.test(h.t) ? null : false;
      departing.push({ person: p, at: dt?.t ?? null, atRaw: dt?.raw ?? null, successorNamed: succ === null ? null : false, cite: h.kind === "signal" ? src(h.s.id, `get_signals › #${h.s.pos}`) : src(h.r.path, `paperwork › ${h.r.path}`) });
      p.leaving = departing[departing.length - 1];
    }
  }
  // single-threading: share of call/email records that mention each person
  const callRecs = records.filter((r) => r.kind === "claim");
  for (const p of P) {
    const m = callRecs.filter((r) => p.name && r.text.toLowerCase().includes(p.name.toLowerCase()));
    p.mentions = m.map((r) => r.path);
  }
  const maxMentions = Math.max(0, ...P.map((p) => p.mentions.length));
  const singleThreaded = callRecs.length >= 2 ? P.filter((p) => p.mentions.length === callRecs.length) : [];

  // ===== Q1: value =====
  const dealRows = deals.map((d, i) => {
    const id = idOf(d);
    const stage = str(pick(d, "stage", "status", "phase") ?? "");
    const name = nameOf(d) || `Deal ${i + 1}`;
    const valKey = Object.keys(d).find((k) => /^(value|amount|arr|acv|tcv|price|worth|total|deal_value|contract_value|annual_value)/i.test(k) && parseMoney(d[k]));
    const claimed = valKey ? parseMoney(d[valKey]) : null;
    const claimedBy = str(pick(d, "claimed_by", "said_by", "source_person", "champion", "stated_by") ?? "");
    const evidenceRefs = [];

    // explicit references in the deal to files / offers / paperwork
    for (const [k, v] of Object.entries(d)) {
      if (!/source|file|evidence|document|contract|offer|proposal|quote|ref/i.test(k)) continue;
      for (const x of [].concat(v)) {
        const s = str(isObj(x) ? idOf(x) : x);
        if (s && knownIds.has(s)) evidenceRefs.push(s);
      }
    }
    // offers tied to this deal
    const linkedOffers = offers.filter((o) => id != null && [pick(o, "deal", "deal_id", "dealId")].map(str).includes(String(id)));
    for (const o of linkedOffers) if (idOf(o)) evidenceRefs.push(String(idOf(o)));
    // hard records that state the same number
    const hard = [];
    if (claimed) {
      const digits = String(Math.round(claimed.n));
      const grouped = Number(digits).toLocaleString("en-US");
      for (const r of records) {
        if (r.kind !== "hard") continue;
        const flat = r.text.replace(/\s/g, "");
        if (flat.includes(grouped) || flat.includes(digits)) hard.push(r.path);
      }
    }
    hard.forEach((h) => evidenceRefs.push(h));
    const uniq = [...new Set(evidenceRefs)];
    const offerValue = linkedOffers.map((o) => parseMoney(pick(o, "value", "amount", "total", "price"))).find(Boolean);
    let status = "claim_only";
    let value = claimed;
    if (offerValue) {
      value = offerValue;
      status = "backed";
    } else if (hard.length || (uniq.length && claimed)) status = "backed";
    if (!claimed && !offerValue) status = "no_value";
    const claimRecs = claimed ? records.filter((r) => r.kind === "claim" && r.text.replace(/\s/g, "").includes(String(Math.round(claimed.n)))).map((r) => r.path) : [];
    // other figures people stated about this deal in calls/emails that differ from the number we use
    const conflicts = [];
    const nameKey = name.toLowerCase();
    if (nameKey.length > 3) {
      for (const r of records) {
        if (r.kind !== "claim" || !r.text.toLowerCase().includes(nameKey)) continue;
        for (const m of r.text.matchAll(/[$£€₹]\s?[\d][\d,]*(?:\.\d+)?\s?(?:k|m)?/gi)) {
          const v = parseMoney(m[0]);
          if (v && value && Math.abs(v.n - value.n) > 1 && !conflicts.some((c) => c.path === r.path && c.n === v.n)) conflicts.push({ n: v.n, text: m[0].trim(), path: r.path });
        }
      }
    }
    return {
      i, id: id ?? null, name, stage, value: value?.n ?? null, currency: value?.cur ?? claimed?.cur ?? null, status,
      evidence: uniq, claimedIn: claimRecs, claimedBy, conflicts,
      reason:
        status === "backed" ? "Value matches a document or offer on file." :
        status === "claim_only" ? (claimRecs.length ? "Number appears only in calls/emails — someone's claim, not a document." : "Number is on the deal record with no file, offer or paperwork behind it.") :
        "No value on the deal record.",
      cite: src(id, S(`deals[${i}]`)), raw: d,
    };
  });
  const sum = (rows) => rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const q1 = {
    cur: dealRows.find((r) => r.currency)?.currency ?? "",
    backedTotal: sum(dealRows.filter((r) => r.status === "backed")),
    claimedTotal: sum(dealRows.filter((r) => r.status === "claim_only")),
    deals: dealRows,
    offers: offers.map((o, i) => ({ id: idOf(o) ?? null, label: nameOf(o), value: parseMoney(pick(o, "value", "amount", "total", "price"))?.n ?? null, cite: src(idOf(o), S(`offers[${i}]`)) })),
    files: files.map((f, i) => ({ id: idOf(f) ?? null, label: nameOf(f), cite: src(idOf(f), S(`files[${i}]`)) })),
  };

  // ===== Q2: who holds the power, per deal =====
  const peopleFor = (d) => {
    const linked = P.filter((p) => d.id != null && p.linkedDeals.includes(String(d.id)));
    const dealPeople = [].concat(pick(d.raw, "people", "contacts", "stakeholders") ?? []).map((x) => str(isObj(x) ? idOf(x) ?? nameOf(x) : x));
    const viaDeal = P.filter((p) => dealPeople.includes(String(p.id)) || dealPeople.includes(p.name));
    const set = new Map([...linked, ...viaDeal].map((p) => [p.i, p]));
    return set.size ? { list: [...set.values()], linked: true } : { list: P, linked: false };
  };
  const q2 = dealRows.map((d) => {
    const { list, linked } = peopleFor(d);
    const role = (c) => list.filter((p) => p.classes.includes(c));
    const slim = (p) => ({ name: p.name, role: p.role, stand: p.stand || null, leaving: !!p.leaving, cite: p.cite });
    return {
      deal: { id: d.id, name: d.name, cite: d.cite },
      linkedInData: linked,
      decides: role("decides").map(slim), pays: role("pays").map(slim), uses: role("uses").map(slim), blocks: role("blocks").map(slim),
      unclassified: list.filter((p) => !p.classes.length).map(slim),
    };
  });
  const q2people = P.map((p) => ({ name: p.name, role: p.role, stand: p.stand || null, classes: p.classes, lastTouch: p.lastTouch ? fmtDate(p.lastTouch) : null, leaving: p.leaving ? { at: p.leaving.at ? fmtDate(p.leaving.at) : p.leaving.atRaw, cite: p.leaving.cite } : null, cite: p.cite }));

  // ===== deadlines (account + signal-derived) =====
  const deadlines = [];
  deadlinesRaw.forEach((d, i) => {
    const at = parseDate(pick(d, "date", "due", "due_date", "deadline", "on", "by", "at", "expires", "ends"), now);
    if (at == null) return;
    deadlines.push({ id: idOf(d) ?? null, label: str(pick(d, "label", "title", "name", "what", "description", "event") ?? "Deadline"), at, dealId: str(pick(d, "deal", "deal_id", "dealId") ?? ""), cite: src(idOf(d), S(`deadlines[${i}]`)), origin: "account" });
  });
  const asks = []; // signal-derived asks
  for (const s of signals) {
    const t = signalText(s);
    const when = findDates(t, s.at ?? now);
    const futureDate = when.find((w) => w.t >= now - DAY);
    if (futureDate && /event|deadline|before|by |renew|expire|audit|launch|go-live|tender|deliver/i.test(t)) {
      deadlines.push({ id: null, label: s.title || "Dated event in signal", at: futureDate.t, dealId: "", cite: src(s.id, `get_signals › #${s.pos}`), origin: "signal", signal: s });
    }
    if (/nobody has replied|no reply|unanswered|awaiting (?:a )?(?:reply|response)|asks? for|wants|needs? (?:an )?answer/i.test(t)) {
      const wk = /this week/i.test(t) ? endOfWeek(Math.max(s.at ?? now, now)) : null;
      asks.push({ signal: s, due: wk, unreplied: /nobody has replied|no reply|unanswered/i.test(t), text: t });
    }
  }
  const dealOfDeadline = (dl) => dealRows.find((d) => (dl.dealId && (String(d.id) === dl.dealId || d.name === dl.dealId)) || (dl.label && d.name && dl.label.toLowerCase().includes(d.name.toLowerCase()))) ?? null;

  // ===== Q4: risks =====
  const risks = [];
  const today = startOfDay(now);
  for (const dl of deadlines) {
    const days = daysBetween(dl.at, today);
    const ask = asks.find((a) => a.signal === dl.signal);
    const bad = ask?.due ?? dl.at - 14 * DAY; // turns bad when the written answer slips, else 2 weeks out
    const toBad = daysBetween(Math.min(bad, dl.at), today);
    const sev = days < 0 ? "overdue" : days <= 14 || toBad <= 7 ? "at risk" : days <= 45 ? "watch" : "later";
    risks.push({
      kind: "deadline", sev, turnsBadOn: Math.max(Math.min(bad, dl.at), today),
      title: `${dl.label} — ${fmtDate(dl.at)} (${days >= 0 ? `${days}d away` : `${-days}d ago`})`,
      why: ask ? `${ask.unreplied ? "Nobody has replied. " : ""}Needs settling by ${fmtDate(ask.due ?? dl.at)}; after that the ${fmtDate(dl.at)} date has no room.` : `Fixed date; prep must start inside ${Math.max(days - 14, 0)} days.`,
      deal: dealOfDeadline(dl)?.name ?? null, cite: [dl.cite],
    });
  }
  for (const p of P) {
    if (p.lastTouch) {
      const idle = daysBetween(today, startOfDay(p.lastTouch));
      if (idle >= 21) risks.push({ kind: "going cold", sev: idle >= 45 ? "at risk" : "watch", turnsBadOn: p.lastTouch + 45 * DAY, title: `${p.name} untouched for ${idle} days`, why: `Last contact ${fmtDate(p.lastTouch)}. Goes cold on ${fmtDate(p.lastTouch + 45 * DAY)}.`, deal: null, cite: [p.cite] });
    }
    if (p.leaving) {
      const when = p.leaving.at ?? null;
      risks.push({ kind: "key person leaving", sev: when && daysBetween(when, today) < 60 ? "at risk" : "watch", turnsBadOn: when ? Math.max(when - 30 * DAY, today) : today, title: `${p.name} leaves${p.leaving.atRaw ? ` (${p.leaving.atRaw})` : ""}${p.leaving.successorNamed === false ? " — no successor named" : ""}`, why: p.mentions.length ? `Appears in ${p.mentions.length} of ${callRecs.length} calls/emails on file; relationship goes with them.` : "Relationship goes with them.", deal: null, cite: [p.leaving.cite, p.cite] });
    }
  }
  for (const p of singleThreaded) {
    risks.push({ kind: "single-threaded", sev: "watch", turnsBadOn: p.leaving?.at ? p.leaving.at - 30 * DAY : today + 30 * DAY, title: `Every call/email on file is with ${p.name} alone`, why: `${callRecs.length} of ${callRecs.length} records.`, deal: null, cite: callRecs.map((r) => src(r.path, `paperwork › ${r.path}`)).slice(0, 6) });
  }
  for (const d of dealRows) {
    const since = parseDate(pick(d.raw, "stage_since", "stage_entered", "last_activity", "last_activity_at", "updated_at", "last_touch", "last_contact"));
    if (since) {
      const idle = daysBetween(today, startOfDay(since));
      if (idle >= 30) risks.push({ kind: "stuck", sev: idle >= 60 ? "at risk" : "watch", turnsBadOn: since + 60 * DAY, title: `${d.name} stuck in "${d.stage || "stage unknown"}" for ${idle} days`, why: `No movement since ${fmtDate(since)}.`, deal: d.name, cite: [d.cite] });
    }
  }
  for (const a of asks) {
    if (a.unreplied && !risks.some((r) => r.cite.some((c) => c.where === `get_signals › #${a.signal.pos}`))) {
      risks.push({ kind: "unanswered", sev: "at risk", turnsBadOn: a.due ?? today, title: a.signal.title || "Unanswered request", why: a.text.slice(0, 220), deal: null, cite: [src(a.signal.id, `get_signals › #${a.signal.pos}`)] });
    }
  }
  const sevRank = { overdue: 0, "at risk": 1, watch: 2, later: 3 };
  risks.sort((a, b) => sevRank[a.sev] - sevRank[b.sev] || a.turnsBadOn - b.turnsBadOn);
  const risksOut = risks.map((r) => ({ ...r, turnsBadOn: fmtDate(r.turnsBadOn) }));

  // ===== Q3: first moves =====
  const me = str(pick(raw, "owner", "account_owner", "rep", "am", "csm") ?? "You");
  const maxVal = Math.max(1, ...dealRows.map((d) => d.value ?? 0));
  const cands = [];
  for (const dl of deadlines) {
    const days = daysBetween(dl.at, today);
    if (days < -7) continue;
    const ask = asks.find((a) => a.signal === dl.signal);
    const d = dealOfDeadline(dl);
    const due = Math.max(Math.min(ask?.due ?? dl.at - 7 * DAY, dl.at - DAY), today);
    const who = ask ? (P.find((p) => p.name && ask.text.toLowerCase().includes(p.name.toLowerCase()))?.name ?? ask.text.match(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/)?.[0] ?? "the sender") : null;
    const wants = ask ? [/train/i.test(ask.text) && "training dates", /who answers|who covers|who supports/i.test(ask.text) && "who answers if it fails on the day"].filter(Boolean) : [];
    cands.push({
      score: 100 - Math.min(days, 90) + (ask?.unreplied ? 40 : 0) + 20 * ((d?.value ?? 0) / maxVal),
      title: ask ? `Reply in writing to ${who}${wants.length ? `: ${wants.join(" and ")}` : ` about ${dl.label}`}` : `Prepare for ${dl.label}`,
      owner: me, due, deadline: dl.at, deal: d?.name ?? null,
      why: ask ? `${ask.unreplied ? "Unreplied. " : ""}Written answer is needed before ${fmtDate(dl.at)}.` : `Fixed date ${fmtDate(dl.at)}.`,
      cite: [dl.cite],
    });
  }
  for (const dep of departing) {
    const when = dep.at ?? today + 60 * DAY;
    const due = Math.max(Math.min(today + 2 * DAY, when - DAY), today);
    cands.push({
      score: 80 + (dep.successorNamed === false ? 10 : 0) + (dep.person.mentions.length ? 5 : 0),
      title: `Ask ${dep.person.name} to name a successor and introduce you before they leave`,
      owner: me, due, deadline: dep.at, deal: null,
      why: `${dep.person.name} is leaving${dep.atRaw ? ` (${dep.atRaw})` : ""}; ${singleThreaded.includes(dep.person) ? "every call on file is with them." : "the relationship is theirs."}`,
      cite: [dep.cite, dep.person.cite],
    });
  }
  for (const d of dealRows.filter((x) => x.status === "claim_only")) {
    cands.push({ score: 40 + 30 * ((d.value ?? 0) / maxVal), title: `Get a document behind the ${d.name} number (${d.value?.toLocaleString("en-US") ?? "?"})`, owner: me, due: Math.max(today + 5 * DAY, today), deadline: null, deal: d.name, why: d.reason, cite: [d.cite] });
  }
  for (const r of risks.filter((r) => r.kind === "going cold")) cands.push({ score: 45, title: `Re-open contact: ${r.title}`, owner: me, due: today + 3 * DAY, deadline: null, deal: r.deal, why: r.why, cite: r.cite });
  for (const r of risks.filter((r) => r.kind === "stuck")) cands.push({ score: 50, title: `Unstick: ${r.title}`, owner: me, due: today + 4 * DAY, deadline: null, deal: r.deal, why: r.why, cite: r.cite });
  cands.sort((a, b) => b.score - a.score);
  const moves = cands.map((c, i) => ({ rank: i + 1, title: c.title, owner: c.owner, due: fmtDate(c.due), deadline: c.deadline ? fmtDate(c.deadline) : null, insideDeadline: c.deadline ? c.due < c.deadline : true, deal: c.deal, why: c.why, cite: c.cite }));

  // ===== Q5: gaps =====
  const gaps = [];
  const findTeam = (re) => team.filter((t) => re.test(Object.values(t).map(str).join(" "))).map(nameOf).filter(Boolean);
  for (const d of q2) {
    const dd = dealRows.find((r) => r.cite === d.deal.cite);
    if (!d.decides.length) gaps.push({ gap: `Nobody identified who decides ${d.deal.name}`, matters: "Without the decider the forecast is a guess.", ask: [...personNames.slice(0, 3), "your champion"].filter(Boolean), cite: [d.deal.cite] });
    if (!d.pays.length) gaps.push({ gap: `Nobody identified who pays for ${d.deal.name}`, matters: "Budget owner controls timing.", ask: ["the champion", ...findTeam(/finance|commercial|sales/i)].slice(0, 3), cite: [d.deal.cite] });
    if (!d.linkedInData) gaps.push({ gap: `The data does not say which contacts belong to ${d.deal.name}`, matters: "Roles above are account-wide, not deal-specific.", ask: ["account owner"], cite: [d.deal.cite] });
  }
  for (const d of dealRows) {
    if (d.status === "claim_only") gaps.push({ gap: `${d.name}: value ${d.value?.toLocaleString("en-US")} is unbacked`, matters: "Counted outside the book until a file or offer supports it.", ask: [d.claimedBy || "the person who quoted it"], cite: [d.cite] });
    if (d.status === "no_value") gaps.push({ gap: `${d.name}: no value on record`, matters: "Cannot be sized.", ask: ["account owner"], cite: [d.cite] });
  }
  for (const dep of departing) if (dep.successorNamed === false) gaps.push({ gap: `Who replaces ${dep.person.name}`, matters: "Every relationship on file runs through them.", ask: [dep.person.name], cite: [dep.cite] });
  for (const a of asks) {
    if (/who answers|who (?:is|will be) responsible|who covers|who supports/i.test(a.text)) gaps.push({ gap: "Who answers if a dock fails on the day", matters: "The customer wants this in writing; we have no owner on file.", ask: findTeam(/support|customer success|field|reliab|service|ops/i).slice(0, 3).concat(["your manager"]), cite: [src(a.signal.id, `get_signals › #${a.signal.pos}`)] });
    if (/training|train more|operators/i.test(a.text)) gaps.push({ gap: "Dates available to train more operators", matters: "Needs real dates before the event, not an intention.", ask: findTeam(/training|enablement|onboard|success/i).slice(0, 3).concat(["your manager"]), cite: [src(a.signal.id, `get_signals › #${a.signal.pos}`)] });
  }
  if (!records.length) gaps.push({ gap: "Paperwork for this account has not been loaded yet", matters: "Values and roles cannot be checked against calls, emails or the contract.", ask: ["wait for the next sync"], cite: [] });
  if (!P.some((p) => p.lastTouch)) gaps.push({ gap: "No last-contact dates on people", matters: "Cannot tell who is going cold.", ask: ["your own activity log"], cite: [] });
  // feature requests that name this account or its people
  const hay = [accountName, ...personNames].filter((x) => x && x.length > 3).map((x) => x.toLowerCase());
  const fr = features.filter((f) => hay.some((h) => str(f).toLowerCase().includes(h))).map((f, i) => ({ id: idOf(f) ?? null, label: nameOf(f) || str(f).slice(0, 80), cite: src(idOf(f), `get_feature_requests › #${i}`) }));

  return {
    key, name: accountName, facts, owner: me,
    counts: { deals: deals.length, people: people.length, files: files.length, records: records.length, signals: signals.length },
    q1, q2, q2people, q3: { moves }, q4: { risks: risksOut }, q5: { gaps }, featureRequests: fr,
    signals: signals.map((s) => ({ id: s.id, pos: s.pos, at: s.atRaw, title: s.title, body: s.body })),
    knownIds: [...knownIds].slice(0, 400),
  };
}

// notes worth writing back (top moves + top risks), deduped by the caller via hash
export function notesToWrite(result) {
  const notes = [];
  for (const a of result.accounts) {
    a.q3.moves.slice(0, 3).forEach((m) => notes.push({ account: a.key, kind: "next_step", title: `#${m.rank} ${m.title}`.slice(0, 120), text: `${m.title}. Owner: ${m.owner}. Due: ${m.due}${m.deadline ? ` (deadline ${m.deadline})` : ""}. Why: ${m.why}` }));
    a.q4.risks.filter((r) => r.sev === "overdue" || r.sev === "at risk").slice(0, 2).forEach((r) => notes.push({ account: a.key, kind: "risk", title: r.title.slice(0, 120), text: `${r.title}. Turns bad on ${r.turnsBadOn}. ${r.why}` }));
  }
  return notes;
}
