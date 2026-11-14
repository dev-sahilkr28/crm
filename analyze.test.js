// Offline sanity test on invented data shaped like the brief (field names are guesses; the analyzer is tolerant).
import assert from "node:assert";
import { analyze, notesToWrite, parseDate } from "../lib/analyze.js";

const now = Date.UTC(2026, 10, 14);
const store = {
  fetched: {
    get_my_accounts: { at: now, data: { accounts: [{
      account: "A", name: "Eastern Counties",
      deals: [
        { id: "d1", name: "Westmere dock expansion", stage: "Negotiation", value: "£120,000", stage_since: "2026-09-01" },
        { id: "d2", name: "Training pack", stage: "Proposal", value: 30000 },
      ],
      people: [
        { id: "p1", name: "Rhys Calder", title: "Drone programme lead", role: "champion, user", last_contact: "2026-11-01" },
        { id: "p2", name: "Karen Mbeki", title: "Inspector, approves operations", stance: "supportive but anxious", last_contact: "2026-09-20" },
        { id: "p3", name: "Dan Ortiz", title: "Procurement and budget holder" },
      ],
      offers: [{ id: "o1", deal: "d2", value: 30000 }],
      deadlines: [{ id: "dl1", label: "Contract renewal", date: "2026-12-20", deal: "d1" }],
      files: [{ id: "f1", name: "Order form" }],
    }] } },
    paperwork_A: { at: now, data: { records: [
      { path: "calls/2026-10-02.md", content: "Call with Rhys Calder. He said the Westmere expansion is worth £150,000." },
      { path: "calls/2026-10-20.md", content: "Call with Rhys Calder about training." },
      { path: "contract/order-form.md", content: "Order form: Westmere dock expansion total £120,000." },
    ] } },
    get_signals: { at: now, data: { signals: [
      { id: "s2", at: "2026-11-17", title: "Rhys Calder is moving on", body: "Rhys Calder has emailed to say he leaves the drone programme in January. No successor is named. Every call on file before the handover was with him alone." },
      { id: "s1", at: "2026-11-18", account: "A", title: "Westmere needs an answer before a public event", body: "Insp. Karen Mbeki has written directly, and logged a ticket, ahead of a large public event on 5 December. She wants two things settled in writing this week: dates for training more operators before the day, and who answers if a dock fails on the day. Nobody has replied." },
    ] } },
    get_flytbase_team: { at: now, data: { team: [{ name: "Priya Shah", role: "Customer support lead" }] } },
  },
  signals: [], notesWritten: {}, log: [],
};

const r = analyze(store, now);
const a = r.accounts[0];
assert.equal(r.accounts.length, 1);
assert.equal(a.q1.backedTotal, 150000, "d1 backed by order form (120k) + d2 backed by offer (30k)");
const d1 = a.q1.deals[0];
assert.equal(d1.status, "backed");
assert.ok(d1.evidence.includes("contract/order-form.md"));
assert.ok(a.q4.risks.some((x) => /leaves/.test(x.title)), "departure risk");
assert.ok(a.q4.risks.some((x) => /5 December|public event/i.test(x.title) || /Westmere/.test(x.title)), "public event deadline risk");
const m = a.q3.moves;
assert.ok(m.length >= 3, "three moves");
for (const x of m) if (x.deadline) assert.ok(x.insideDeadline, `move inside deadline: ${x.title}`);
assert.ok(m[0].due <= "2026-12-05", "first move due before the event");
assert.ok(a.q5.gaps.some((g) => /dock fails/.test(g.gap)), "gap on dock failure");
assert.ok(a.q5.gaps.some((g) => /replaces Rhys/.test(g.gap)), "gap on successor");
assert.ok(notesToWrite(r).length > 0);
assert.equal(new Date(parseDate("5 December", now)).toISOString().slice(0, 10), "2026-12-05");
console.log(JSON.stringify({ moves: m.slice(0, 3).map((x) => `${x.rank}. ${x.title} | by ${x.due} | deadline ${x.deadline}`), risks: a.q4.risks.map((x) => `${x.sev}: ${x.title} -> bad ${x.turnsBadOn}`), gaps: a.q5.gaps.map((g) => g.gap), q1: { backed: a.q1.backedTotal, claimed: a.q1.claimedTotal } }, null, 1));
console.log("OK");
