'use strict';
// Roster Exchange concept prototype. Vanilla JS, no storage, no network calls except data.json.
const DEMO_DATE = '2026-11-11', G1 = 'SYN-G-001';
const TYPE = { ADD: 'Add clinician', TERM: 'Terminate', UPDATE: 'Update', DUPLICATE: 'Duplicate', CONFLICT: 'Conflict' };
const STATUS = { draft: ['Not yet submitted', 'c-grey'], withdrawn: ['Excluded by provider', 'c-grey'], auto_applied: ['Auto-applied', 'c-green'], pending: ['Needs review', 'c-amber'], approved: ['Approved', 'c-green'], edited: ['Edited and approved', 'c-blue'], rejected: ['Rejected', 'c-red'] };
const MIN_MANUAL = 6, MIN_REVIEW = 2; // illustrative minutes per change (deck assumption A14)
let DATA = null, S = null, clock = 0;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const days = d => Math.round((Date.parse(DEMO_DATE) - Date.parse(d)) / 864e5);
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const chip = (t, c) => `<span class="chip ${c}">${esc(t)}</span>`;
const byId = id => S.changes.find(c => c.id === id);
const live = () => S.changes.filter(c => c.status !== 'draft' && c.status !== 'withdrawn');
function stamp() { clock += 3; const m = 9 * 60 + clock; return `${DEMO_DATE} ${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function log(actor, action, c) { const e = { t: stamp(), actor, action, id: c ? c.id : '' }; S.audit.unshift(e); if (c) c.history.push(e); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }

function reset() {
  clock = 0;
  S = { view: 'start', roster: clone(DATA.roster), changes: clone(DATA.changes), audit: [], uploaded: false, submitted: false, attested: false, sel: null, mode: '', f: { type: '', status: '', q: '' }, seen: false };
  S.changes.forEach(c => { c.history = c.status === 'draft' ? [] : [{ t: c.submitted + ' 08:00', actor: 'AI validation', id: c.id, action: c.status === 'auto_applied' ? `Scored ${c.confidence}; all checks passed; auto-applied` : `Scored ${c.confidence}; routed to review` }]; });
  log('System', 'Demo reset to the seeded synthetic dataset');
  go('start');
}
function apply(c) {
  const r = S.roster.find(x => x.id === c.practitioner_id);
  if (c.type === 'ADD') { if (!r) S.roster.push({ id: c.practitioner_id, npi: c.npi, name: c.practitioner, specialty: c.new, group: c.group, location: '', phone: '', status: 'active', last_verified: DEMO_DATE }); return; }
  if (!r) return;
  if (c.type === 'TERM') r.status = 'termed';
  else if (c.type === 'UPDATE' || c.type === 'CONFLICT') r[c.field] = c.new;
  r.last_verified = DEMO_DATE;
}
function metrics() {
  const ch = live(), n = ch.length, cnt = s => ch.filter(c => c.status === s).length;
  const act = a => a.filter(r => r.status === 'active');
  const fresh = a => pct(act(a).filter(r => days(r.last_verified) <= 90).length, act(a).length);
  const auto = cnt('auto_applied'), pend = cnt('pending');
  return { n, auto, pend, decided: cnt('approved') + cnt('edited') + cnt('rejected'), autoPct: pct(auto, n), freshBefore: fresh(DATA.roster), freshAfter: fresh(S.roster), minBefore: n * MIN_MANUAL, minAfter: (n - auto) * MIN_REVIEW };
}

const MAP = [['Provider Name', 'Clinician name', 99], ['NPI #', 'NPI', 100], ['Speciality', 'Specialty', 97], ['Practice Addr', 'Location address', 94], ['Ste', 'Suite', 91], ['Office Ph', 'Phone', 98], ['Start Dt', 'Effective date', 93], ['Term Dt', 'Termination date', 95], ['TIN', 'Group tax ID', 100]];
const MAPPING = `<details class="map"><summary>View how the 9 columns were mapped</summary><div class="tw"><table><thead><tr><th>Column in your file</th><th>Mapped to</th><th>Confidence</th></tr></thead><tbody>${MAP.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}%</td></tr>`).join('')}</tbody></table></div><p class="muted">Simulated. In the product you could correct any mapping before the diff is built.</p></details>`;
function download(name, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Downloaded ' + name);
}
function tabs(m) {
  const t = [['', 'All', m.n], ['pending', 'Needs review', m.pend], ['auto_applied', 'Applied automatically', m.auto], ['decided', 'Decided by a reviewer', m.decided]];
  return `<div class="tabs">${t.map(x => `<button data-act="tab" data-id="${x[0]}" id="tab-${x[0] || 'all'}" class="${S.f.status === x[0] ? 'on' : ''}">${x[1]} <span>${x[2]}</span></button>`).join('')}</div>`;
}
function rosterRows() {
  const q = (S.rq || '').trim().toLowerCase(), gn = Object.fromEntries(DATA.groups.map(g => [g.id, g.name]));
  const list = S.roster.filter(r => !q || (r.name + r.npi + r.specialty + gn[r.group]).toLowerCase().includes(q));
  if (!list.length) return '<tr><td colspan="6" class="muted">No clinicians match this search.</td></tr>';
  return list.slice(0, 40).map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.npi)}</td><td>${esc(r.specialty)}</td><td>${esc(gn[r.group])}</td><td>${r.status === 'active' ? chip('Active', 'c-green') : chip('Terminated', 'c-grey')}</td><td>${esc(r.last_verified)} ${days(r.last_verified) > 90 ? chip('Over 90 days', 'c-amber') : chip('Current', 'c-green')}</td></tr>`).join('') + (list.length > 40 ? `<tr><td colspan="6" class="muted">Showing 40 of ${list.length}. Search to narrow.</td></tr>` : '');
}
function vRoster() {
  const act = S.roster.filter(r => r.status === 'active'), fresh = act.filter(r => days(r.last_verified) <= 90).length;
  return `<div class="card"><h1>Roster on demand</h1><p class="muted">Synthetic Plan A · the latest validated roster, with when each record was last confirmed by the provider</p></div>
  <div class="tiles"><div class="card tile"><div class="v">${act.length}</div><div class="l">Active clinicians</div></div><div class="card tile"><div class="v">${pct(fresh, act.length)}%</div><div class="l">Confirmed in the last 90 days</div></div><div class="card tile"><div class="v">${act.length - fresh}</div><div class="l">Due for confirmation</div></div><div class="card tile"><div class="v">${S.roster.length - act.length}</div><div class="l">Terminated in this session</div></div></div>
  <div class="card"><div class="filters"><label class="f">Search clinician, NPI, specialty or group<input type="text" id="r-q" data-rq="1" value="${esc(S.rq || '')}" placeholder="Type to search"></label></div>
  <div class="tw" style="margin-top:10px"><table><thead><tr><th>Clinician</th><th>NPI (synthetic)</th><th>Specialty</th><th>Group</th><th>Status</th><th>Last verified</th></tr></thead><tbody id="rbody">${rosterRows()}</tbody></table></div></div>`;
}

// ---------- charts ----------
function charts(m) {
  const a1 = 360 * m.auto / m.n, a2 = a1 + 360 * m.pend / m.n, by = {};
  live().filter(c => c.status === 'pending').forEach(c => by[c.type] = (by[c.type] || 0) + 1);
  const max = Math.max(1, ...Object.values(by));
  const bars = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="hb"><span>${esc(TYPE[k])}</span><div class="bar after" style="width:${Math.max(6, 100 * v / max)}%"></div><b>${v}</b></div>`).join('') || '<p class="muted">Nothing is waiting for review.</p>';
  return `<div class="grid2"><div class="card"><h2>Changes by status</h2><p class="insight">${m.autoPct}% needed no payer review; a person decides the rest.</p><div class="row"><div class="donut" role="img" aria-label="${m.auto} auto-applied, ${m.pend} need review, ${m.decided} decided" style="background:conic-gradient(#73b124 0 ${a1}deg,#f0b818 ${a1}deg ${a2}deg,#0a399e ${a2}deg 360deg)"><div><small>Total Count</small><b>${m.n}</b></div></div>
  <ul class="plain legend"><li><i style="background:#73b124"></i>Applied automatically <b>${m.auto}</b></li><li><i style="background:#f0b818"></i>Needs review <b>${m.pend}</b></li><li><i style="background:#0a399e"></i>Decided by a reviewer <b>${m.decided}</b></li></ul></div></div>
  <div class="card"><h2>Waiting for review, by type</h2><p class="insight">Adds and terminations always come to a person.</p>${bars}</div></div>`;
}
function funnel(m) {
  const st = [['Received', m.n], ['Mapped and matched', m.n], ['Applied automatically', m.auto], ['Decided by a reviewer', m.decided], ['Waiting for review', m.pend]];
  return `<div class="card"><h2>Processing status</h2><div class="funnel">${st.map((x, i) => `<div class="f${i}"><span>${x[0]}</span><b>${x[1]} changes</b></div>`).join('')}</div></div>`;
}

// ---------- views ----------
function vStart() {
  const d1 = S.submitted, d2 = S.audit.some(e => e.actor === 'Plan reviewer (demo)'), d3 = S.seen;
  const step = (n, done, h, p, id, label) => `<div class="card step ${done ? 'done' : ''}"><h2><span class="n">${done ? '✓' : n}</span>${h}</h2><p>${p}</p><button class="btn" data-act="go" data-id="${id}" id="start-${id}">${label}</button></div>`;
  return `<div class="card"><h1>Update a roster once, review only the exceptions</h1>
  <p>This prototype shows the proposed version 1 workflow from both sides: a provider group uploads the roster file it already has, AI maps it and shows a diff against the plan's record, the group confirms, and plan staff see only the changes that need a human decision.</p>
  <p class="muted">Follow the three steps. Use <b>Reset demo</b> at any time to start again. Demo date is fixed at ${DEMO_DATE}.</p></div>
  <div class="steps">
  ${step(1, d1, 'Provider group', 'Act as the roster administrator at Northfield Synthetic Medical Group. Upload the sample file, check the diff and confirm.', 'provider', 'Open provider view')}
  ${step(2, d2, 'Plan review queue', 'Act as a plan operations analyst. Open a flagged change, read the evidence, then approve, edit or reject it.', 'queue', 'Open review queue')}
  ${step(3, d3, 'Outcomes', 'See how the numbers move: share applied without payer review, roster freshness, and the audit trail.', 'outcomes', 'Open outcomes')}
  </div>`;
}
function changeText(c) { return `<span class="old">${esc(c.old)}</span> → <b>${esc(c.new)}</b>`; }
function vProvider() {
  const g = DATA.groups.find(x => x.id === G1), mine = S.roster.filter(r => r.group === G1 && r.status === 'active');
  const stale = mine.filter(r => days(r.last_verified) > 90).length, drafts = S.changes.filter(c => c.group === G1 && DATA.changes.find(d => d.id === c.id).status === 'draft');
  let body;
  if (!S.uploaded) body = `<div class="card"><h2>Step 1: send the roster you already keep</h2><p>Try the synthetic sample file. Production would support validated CSV/XLSX layouts, with mapping reviewed before submission.</p>
    <button class="btn" data-act="upload" id="upload">Upload sample roster file (simulated)</button></div>
    <div class="card"><h2>What the plans have on file for your group today</h2><div class="tw"><table><thead><tr><th>Clinician</th><th>NPI (synthetic)</th><th>Specialty</th><th>Phone</th><th>Last verified</th></tr></thead><tbody>
    ${mine.slice(0, 8).map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.npi)}</td><td>${esc(r.specialty)}</td><td>${esc(r.phone)}</td><td>${esc(r.last_verified)} ${days(r.last_verified) > 90 ? chip('Over 90 days', 'c-amber') : chip('Current', 'c-green')}</td></tr>`).join('')}
    </tbody></table></div><p class="muted">Showing 8 of ${mine.length} clinicians.</p></div>`;
  else if (!S.submitted) {
    const inc = drafts.filter(c => c.include).length;
    body = `<div class="card ai"><b>File read:</b> northfield_roster_nov.xlsx (synthetic) · 30 rows · 9 of 9 columns mapped · 27 rows matched to clinicians already on the plan record · ${drafts.length} differences found. Nothing is sent until you confirm.${MAPPING}</div>
    <div class="card"><h2>Step 2: check the ${drafts.length} differences</h2><div class="tw"><table><thead><tr><th>Include</th><th>Clinician</th><th>Type</th><th>Change</th><th>What happens next</th></tr></thead><tbody>
    ${drafts.map(c => `<tr><td><input type="checkbox" id="inc-${c.id}" data-inc="${c.id}" ${c.include ? 'checked' : ''} aria-label="Include change for ${esc(c.practitioner)}"></td><td>${esc(c.practitioner)}</td><td>${esc(TYPE[c.type])}</td><td>${changeText(c)}</td><td>${c.tier === 'auto' ? chip('Applies automatically', 'c-green') : chip('Plan will review', 'c-amber')}<div class="muted">${esc(c.reason)}</div></td></tr>`).join('')}
    </tbody></table></div>
    <details class="attestation"><summary>Review unchanged records before attesting</summary><ul>${mine.filter(r => !drafts.some(c => c.practitioner_id === r.id)).map(r => `<li>${esc(r.name)} · ${esc(r.location)} · ${esc(r.phone)}</li>`).join('')}</ul></details>
    <label class="attestation"><input type="checkbox" id="attest" data-attest="1" ${S.attested ? 'checked' : ''}> I am authorized for this group and have reviewed the unchanged records above. Excluded or unresolved changes are not marked verified.</label>
    <button class="btn navy" data-act="submit" id="submit" ${!S.attested ? 'disabled' : ''}>Confirm ${inc} changes and send to ${g.plans.length} plans</button></div>`;
  } else body = `<div class="card"><div class="row" style="justify-content:space-between"><h2>Sent to ${g.plans.map(esc).join(', ')}</h2><button class="btn outline small" data-act="exportReceipt" id="export-receipt">Download receipt (CSV)</button></div><p>Submission simulated for the three authorized demo plans. Status below represents the shared demo provider record; claims and public-directory delivery are not connected or confirmed.</p><div class="tw"><table><thead><tr><th>Clinician</th><th>Type</th><th>Change</th><th>Demo record status</th></tr></thead><tbody>
    ${drafts.map(c => `<tr><td>${esc(c.practitioner)}</td><td>${esc(TYPE[c.type])}</td><td>${changeText(c)}</td><td>${chip(...STATUS[c.status])}</td></tr>`).join('')}
    </tbody></table></div><button class="btn" data-act="go" data-id="queue" id="to-queue">Next: see the plan review queue</button></div>`;
  return `<div class="card"><h1>${esc(g.name)}</h1><p class="muted">${esc(g.id)} · roster administrator view · sends rosters to ${g.plans.length} plans</p></div>
  <div class="tiles"><div class="card tile"><div class="v">${mine.length}</div><div class="l">Clinicians on the plan record</div></div>
  <div class="card tile"><div class="v">${stale}</div><div class="l">Not verified in the last 90 days</div></div>
  <div class="card tile"><div class="v">${S.submitted ? 'Today' : days(mine.map(r => r.last_verified).sort().pop()) + ' days ago'}</div><div class="l">Last roster confirmation</div></div></div>${body}`;
}
function rows() {
  const f = S.f, q = f.q.trim().toLowerCase();
  const list = live().filter(c => (!f.type || c.type === f.type) && (!f.status || c.status === f.status || (f.status === 'decided' && ['approved', 'edited', 'rejected'].includes(c.status))) && (!q || (c.practitioner + c.group_name + c.id).toLowerCase().includes(q)));
  if (!list.length) return '<tr><td colspan="8" class="muted">No changes match these filters.</td></tr>';
  return list.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(c.group_name)}</td><td>${esc(c.practitioner)}</td><td>${esc(TYPE[c.type])}</td><td>${changeText(c)}</td><td>${Math.round(c.confidence * 100)}%</td><td>${chip(...STATUS[c.status])}</td><td><button class="btn outline small" data-act="open" data-id="${c.id}" id="open-${c.id}">Open</button></td></tr>`).join('');
}
function vDetail(c) {
  const res = { pass: 'c-green', warn: 'c-amber', fail: 'c-red' };
  let actions = `<p>${chip(...STATUS[c.status])} ${c.status === 'rejected' ? 'Rejected. Nothing was written to the plan record.' : 'Written to the plan record.'}</p>${c.status === 'rejected' ? '' : '<button class="btn outline" data-act="rollback" id="rollback">Roll back this change</button>'}`;
  if (c.status === 'pending') {
    if (S.mode === 'edit') actions = `<label class="f">Corrected value<input type="text" id="editval" value="${esc(c.new)}"></label><div class="row" style="margin-top:8px"><button class="btn" data-act="saveedit" id="saveedit">Save and approve</button><button class="btn outline" data-act="cancel" id="cancel">Cancel</button></div>`;
    else if (S.mode === 'reject') actions = `<label class="f">Reason for rejection<select id="rejreason"><option>Failed licence or credential check</option><option>Conflicts with a more recent submission</option><option>Not authorised for this group</option><option>Other</option></select></label><div class="row" style="margin-top:8px"><button class="btn danger" data-act="savereject" id="savereject">Confirm rejection</button><button class="btn outline" data-act="cancel" id="cancel">Cancel</button></div>`;
    else actions = `<div class="row"><button class="btn" data-act="approve" id="approve">Approve</button><button class="btn outline" data-act="edit" id="edit">Edit</button><button class="btn danger" data-act="reject" id="reject">Reject</button></div>`;
  }
  return `<div class="card detail" id="detail"><div class="row" style="justify-content:space-between"><h2 id="detail-h" tabindex="-1">${esc(c.id)} · ${esc(TYPE[c.type])} · ${esc(c.practitioner)}</h2><button class="btn outline small" data-act="close" id="close">Close</button></div>
  <p class="muted">${esc(c.group_name)} · NPI (synthetic) ${esc(c.npi)} · received ${esc(c.submitted)}</p>
  <div class="grid2"><div><div class="cmp2"><div><small>Plan record today (${esc(c.field)})</small><b>${esc(c.old)}</b></div><span aria-hidden="true">→</span><div class="new"><small>Submitted by the group</small><b>${esc(c.new)}</b></div></div>
  <div class="ai"><b>AI suggestion: ${esc(c.recommend)}</b><p>${esc(c.reason)}</p><div class="meter" role="img" aria-label="Confidence ${Math.round(c.confidence * 100)} percent"><i style="width:${c.confidence * 100}%"></i></div><p class="muted">Confidence ${Math.round(c.confidence * 100)}% (only contact-detail updates at 90% or more with all checks passed apply automatically; adds, terminations and specialty changes always go to a person)</p></div>
  <h2 style="margin-top:12px">Decision</h2>${actions}</div>
  <div><h2>Evidence</h2><ul class="plain">${c.checks.map(k => `<li>${chip(k.result, res[k.result])} ${esc(k.name)}${k.detail ? `<div class="muted">${esc(k.detail)}</div>` : ''}</li>`).join('')}</ul>
  <h2 style="margin-top:12px">Audit trail</h2><ul class="plain">${c.history.map(h => `<li><span class="muted">${esc(h.t)}</span> · <b>${esc(h.actor)}</b>: ${esc(h.action)}</li>`).join('')}</ul></div></div></div>`;
}
function vQueue() {
  const m = metrics(), opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(Array.isArray(l) ? l[0] : l)}</option>`).join('');
  const st = Object.fromEntries(Object.entries(STATUS).filter(([k]) => k !== 'draft' && k !== 'withdrawn'));
  return `<div class="card"><h1>Plan review queue</h1><p class="muted">Synthetic Plan A · operations analyst view · only changes that need a human decision wait here</p></div>
  <div class="tiles">
  <div class="card tile"><div class="v">${m.n}</div><div class="l">Roster changes received</div><div class="b muted">Illustrative manual baseline</div></div>
  <div class="card tile"><div class="v">${m.autoPct}%</div><div class="l">Applied without payer review</div><div class="b muted">Before: 0%</div></div>
  <div class="card tile"><div class="v">${m.pend}</div><div class="l">Waiting for review</div><div class="b muted">${m.decided} decided in this session</div></div>
  <div class="card tile"><div class="v">${m.freshAfter}%</div><div class="l">Roster verified in the last 90 days</div><div class="b muted">Before: ${m.freshBefore}%</div></div></div>
  ${charts(m)}
  ${S.sel ? vDetail(byId(S.sel)) : ''}
  <div class="card">${tabs(m)}<div class="filters">
  <label class="f">Type<select id="f-type" data-f="type"><option value="">All types</option>${opt(TYPE, S.f.type)}</select></label>
  <label class="f">Status<select id="f-status" data-f="status"><option value="">All statuses</option>${opt(st, S.f.status)}</select></label>
  <label class="f">Search clinician, group or ID<input type="text" id="f-q" data-q="1" value="${esc(S.f.q)}" placeholder="Type to search"></label>
  <button class="btn outline" data-act="needs" id="needs" style="align-self:end">Show only needs review</button></div>
  <div class="tw" style="margin-top:10px"><table><thead><tr><th>ID</th><th>Group</th><th>Clinician</th><th>Type</th><th>Change</th><th>Confidence</th><th>Status</th><th></th></tr></thead><tbody id="qbody">${rows()}</tbody></table></div></div>`;
}
function vOutcomes() {
  S.seen = true; const m = metrics(), w = (a, b) => Math.max(2, Math.round(100 * a / Math.max(b, 1)));
  const cmp = (label, b, a, unit) => `<div class="card"><h2>${label}</h2><div class="muted">Before (manual): ${b}${unit}</div><div class="bar" style="width:${w(b, Math.max(a, b))}%"></div><div>With the exchange: <b>${a}${unit}</b></div><div class="bar after" style="width:${w(a, Math.max(a, b))}%"></div></div>`;
  return `<div class="card"><h1>Outcomes</h1><p class="muted">These numbers update as you submit, approve, edit and reject. They are computed from the synthetic dataset and illustrate the metrics in the deck; they are not forecasts. Time estimates exclude preparation, provider review, support and downstream processing. Recent confirmation is not proof of accuracy.</p></div>
  <div class="tiles">${cmp('Changes needing a manual touch', m.n, m.n - m.auto, '')}${cmp('Estimated review minutes', m.minBefore, m.minAfter, ' min')}${cmp('Roster verified in the last 90 days', m.freshBefore, m.freshAfter, '%')}</div>
  ${funnel(m)}
  <div class="card"><h2>How these map to the deck's launch metrics</h2><div class="tw"><table><thead><tr><th>On screen</th><th>Value now</th><th>Deck metric and threshold</th></tr></thead><tbody>
  <tr><td>Applied without payer review</td><td>${m.autoPct}% (${m.auto} of ${m.n})</td><td>Changes applied without payer review: 40% or more at pilot day 90</td></tr>
  <tr><td>Roster verified in the last 90 days</td><td>${m.freshAfter}% (was ${m.freshBefore}%)</td><td>North star: 80% or more for pilot groups</td></tr>
  <tr><td>Waiting for review / decided</td><td>${m.pend} / ${m.decided}</td><td>Cycle time: 2 business days or less from submission to plan record</td></tr>
  <tr><td>Staff minutes</td><td>${m.minBefore} → ${m.minAfter} min</td><td>Assumes ${MIN_MANUAL} min to key a change by hand and ${MIN_REVIEW} min to review an exception (assumption A14, to be measured)</td></tr></tbody></table></div></div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2>Audit log (most recent first)</h2><button class="btn outline small" data-act="exportAudit" id="export-audit">Export CSV</button></div><ul class="plain">${S.audit.slice(0, 40).map(h => `<li><span class="muted">${esc(h.t)}</span> · <b>${esc(h.actor)}</b>${h.id ? ' · ' + esc(h.id) : ''}: ${esc(h.action)}</li>`).join('')}</ul></div>`;
}
function vHow() {
  const s = [['Send', 'The group uploads or emails the roster file it already keeps. No template.', 'Slide 8'], ['Map and match', 'AI maps columns to a standard roster layout and matches each row to a clinician on the plan record.', 'Slide 12'], ['Diff', 'Only differences are shown: adds, terminations, updates, duplicates, conflicts.', 'Slide 8'], ['Confirm', 'The group confirms the changes and attests that everything else is correct.', 'Slide 8'], ['Validate and route', 'Each change gets checks and a confidence score. Only contact-detail updates (phone, suite) apply automatically, and only at a simulated score of 90% or more with every check passed. Adds, terminations, specialty changes and conflicts always go to a person.', 'Slide 12'], ['Review exceptions', 'Plan staff approve, edit or reject with a reason. New clinicians are never loaded as participating automatically: delegated-group adds need a reviewer to confirm the effective date, others go to credentialing. A clinician missing from a file is never treated as a termination.', 'Slides 8 and 12'], ['Record and measure', 'Every step is written to an audit trail, and the launch metrics are computed from those events.', 'Slide 13']];
  return `<div class="card"><h1>How it works</h1><p class="muted">The flow this prototype demonstrates, and where each part is explained in the deck.</p></div>
  <div class="card"><div class="tw"><table><thead><tr><th>Step</th><th>What happens</th><th>Deck</th></tr></thead><tbody>${s.map((x, i) => `<tr><td><b>${i + 1}. ${x[0]}</b></td><td>${x[1]}</td><td>${x[2]}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><h2>What this prototype demonstrates</h2><ul><li><b>Shows:</b> the proposed task sequence, exception review and decision history. User effort and production accuracy still need measurement.</li><li><b>Does not show:</b> real model accuracy (scores and checks are simulated), real provider willingness to use it, or integration with plan systems.</li><li><b>Data:</b> ${DATA.roster.length} synthetic clinicians in ${DATA.groups.length} synthetic groups and ${DATA.changes.length} synthetic roster changes, generated by a seeded script. Edge cases included: low confidence, conflicting records, duplicate match, failed licence check, primary care termination with assigned members.</li></ul></div>`;
}

// ---------- rendering and actions ----------
const VIEWS = { start: vStart, provider: vProvider, queue: vQueue, outcomes: vOutcomes, roster: vRoster, how: vHow };
function render(focusId) {
  const keep = focusId || (document.activeElement && document.activeElement.id);
  $('#view').innerHTML = VIEWS[S.view]();
  document.querySelectorAll('nav button').forEach(b => b.dataset.id === S.view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  const el = keep && document.getElementById(keep); if (el) el.focus();
}
function go(v) { S.view = v; S.sel = null; S.mode = ''; render(); window.scrollTo(0, 0); }
function decide(status, text) { const c = byId(S.sel); if (!c || c.status !== 'pending') return; if (status !== 'rejected' && c.checks.some(k => k.result === 'fail' && /licen[cs]e|credential/i.test(k.name))) { toast('Cannot approve: resolve the failed credential or licence check first'); return; } c.status = status; if (status !== 'rejected') apply(c); log('Plan reviewer (demo)', text, c); S.mode = ''; toast(`${c.id}: ${STATUS[status][0]}`); render('detail-h'); }
const ACT = {
  go: id => go(id),
  reset: () => { reset(); toast('Demo reset'); },
  upload: () => { S.uploaded = true; log('Group roster admin (demo)', 'Uploaded roster file; AI mapped 9 columns and found 12 differences'); render('submit'); },
  submit: () => {
    if (!S.attested) { toast('Review and attest the unchanged records first'); return; }
    const mine = S.changes.filter(c => c.group === G1 && c.status === 'draft');
    mine.forEach(c => { if (!c.include) { c.status = 'withdrawn'; return; } c.submitted = DEMO_DATE; log('Group roster admin (demo)', 'Confirmed change', c); if (c.tier === 'auto') { c.status = 'auto_applied'; apply(c); log('AI validation', `Scored ${c.confidence}; all checks passed; auto-applied`, c); } else { c.status = 'pending'; log('AI validation', `Scored ${c.confidence}; routed to review`, c); } });
    S.roster.filter(r => r.group === G1 && r.status === 'active' && !mine.some(c => c.practitioner_id === r.id)).forEach(r => r.last_verified = DEMO_DATE);
    log('Group roster admin (demo)', 'Attested reviewed unchanged records; unresolved and excluded changes remain unverified');
    S.submitted = true; toast('Submitted once, sent to 3 plans'); render('to-queue');
  },
  open: id => { S.sel = id; S.mode = ''; render('detail-h'); $('#detail').scrollIntoView({ block: 'start' }); },
  close: () => { const id = S.sel; S.sel = null; S.mode = ''; render('open-' + id); },
  needs: () => { S.f = { type: '', status: 'pending', q: '' }; render('needs'); },
  approve: () => decide('approved', 'Approved as submitted'),
  edit: () => { S.mode = 'edit'; render('editval'); },
  reject: () => { S.mode = 'reject'; render('rejreason'); },
  cancel: () => { S.mode = ''; render('approve'); },
  saveedit: () => { const v = $('#editval').value.trim(); if (!v) { toast('Enter a value first'); return; } const c = byId(S.sel); const was = c.new; c.new = v; decide('edited', `Edited value from "${was}" to "${v}" and approved`); },
  savereject: () => decide('rejected', 'Rejected: ' + $('#rejreason').value),
  tab: id => { S.f.status = id || ''; render('tab-' + (id || 'all')); },
  rollback: () => {
    const c = byId(S.sel); if (!c || !['approved', 'edited', 'auto_applied'].includes(c.status)) return;
    const r = S.roster.find(x => x.id === c.practitioner_id);
    if (c.type === 'ADD') S.roster = S.roster.filter(x => x.id !== c.practitioner_id);
    else if (r) { if (c.type === 'TERM') r.status = 'active'; else if (c.type === 'UPDATE' || c.type === 'CONFLICT') r[c.field] = c.old; }
    c.status = 'pending'; log('Plan reviewer (demo)', 'Rolled back to the previous version and returned to review', c); toast(`${c.id}: rolled back`); render('detail-h');
  },
  exportAudit: () => download('roster-exchange-audit-log-synthetic.csv', [['time', 'actor', 'change_id', 'action'], ...S.audit.map(e => [e.t, e.actor, e.id, e.action])]),
  exportReceipt: () => download('roster-exchange-receipt-synthetic.csv', [['change_id', 'clinician', 'type', 'field', 'old', 'new', 'status', 'scope', 'downstream_confirmation'], ...S.changes.filter(c => c.group === G1 && DATA.changes.find(d => d.id === c.id).status === 'draft').map(c => [c.id, c.practitioner, TYPE[c.type], c.field, c.old, c.new, STATUS[c.status][0], 'Synthetic demo provider record', 'Not connected / not confirmed'])]),
};
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && S) ACT[b.dataset.act](b.dataset.id); });
document.addEventListener('change', e => { const t = e.target; if (t.dataset.attest) { S.attested = t.checked; render('attest'); } else if (t.dataset.f) { S.f[t.dataset.f] = t.value; render(); } else if (t.dataset.inc) { byId(t.dataset.inc).include = t.checked; render(); } });
document.addEventListener('input', e => { if (e.target.dataset.q) { S.f.q = e.target.value; $('#qbody').innerHTML = rows(); } else if (e.target.dataset.rq) { S.rq = e.target.value; $('#rbody').innerHTML = rosterRows(); } });
fetch('data.json?v=9').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => { DATA = d; reset(); })
  .catch(err => { $('#view').innerHTML = `<div class="card err">The synthetic dataset could not be loaded (${esc(err.message)}). Reload the page to try again.</div>`; });

