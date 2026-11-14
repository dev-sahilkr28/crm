# Thinking doc (paste into a Google Doc)

## What it does, and for whom
A live CRM for a sales or account owner who has to walk into Monday with a clear picture of two accounts. For each account it answers five questions from the MCP data: what the book is worth, who holds the power on each deal, the first three moves, what is about to go wrong, and what is still unknown. It refreshes by itself as new events arrive and writes its conclusions back as notes.

## How it decides: the rules
- **Book value.** A deal counts only if an offer, file or contract record states the same number. Figures that appear only in calls or emails are shown apart as claims, with the record where they were said. A different figure someone quoted is flagged as a conflict, not averaged in.
- **Power.** Each person is classed as decides, pays, uses or could block from their title and role fields, with their stance shown. If the data does not link contacts to a deal, the page says the view is account-wide.
- **First moves.** Candidates come from dated deadlines, unanswered requests in live events, key people leaving, unbacked values, stale deals and cold contacts. Score rises with nearness of the deadline, an unreplied request, and value at stake. Each move has an owner and a due date, and the due date is always before the deadline it serves.
- **What goes wrong.** Deadlines, people untouched for 21+ days, deals idle for 30+ days, people leaving, and requests nobody has answered. Each shows the date it turns bad. Nothing is green by default; if no dates exist the page says it could not assess.
- **Unknowns.** Missing decider or payer, unbacked values, no successor for a departing contact, questions a customer asked that we cannot yet answer. Each names who could fill it.
- **Sources.** Every figure cites a record id. Where the data has no id, the position is shown and marked as such.

## What it does not do yet
- Field matching is heuristic: unusual field names may not be recognised, and role classification from free-text titles can be wrong. The Raw data tab exists so this is checkable.
- Dates written in prose are parsed with simple patterns; relative phrases other than "this week" are not understood.
- No login on the page, so it should hold nothing beyond what the judges may see.
- It does not send replies; it proposes the move and records it as a note.
- Written notes are deduplicated by title, so a changed ranking can add a new note rather than update the old one.

## How I used AI
Claude wrote the first version of the server, the analysis rules and the page from the brief, and I reviewed the rules against the real data. The rules are plain code, not model calls, so every output can be traced to an input. I checked the rate-limit behaviour, the token handling and the figures against the stored raw records myself. (Edit this paragraph to say what you actually changed.)
