#!/usr/bin/env python3
"""Generates data.json: a fully synthetic roster dataset for the concept prototype.
Seeded, so the output is reproducible. No real people, practices, plans or identifiers."""
import json, random
from datetime import date, timedelta

random.seed(42)
DEMO = date(2026, 11, 11)
FIRST = ["Avery", "Rowan", "Jules", "Mika", "Tamsin", "Corin", "Ilse", "Bram", "Noor", "Elio", "Saskia", "Devi",
         "Orla", "Kip", "Leda", "Marek", "Yara", "Soren", "Wren", "Anouk"]
LAST = ["Aldermoor", "Brindlecott", "Quillon", "Vantress", "Marrowby", "Thistlewick", "Ostrander", "Fennimore",
        "Hawksley", "Lorimount", "Pemberfell", "Rookhaven", "Sablewood", "Tindermere", "Wexcombe", "Yarrowby"]
SPEC = ["Family Medicine", "Internal Medicine", "Pediatrics", "Cardiology", "Orthopaedic Surgery", "Dermatology",
        "Obstetrics and Gynaecology", "Psychiatry", "Nurse Practitioner", "Physician Assistant"]
PLANS = ["Synthetic Plan A", "Synthetic Plan B", "Synthetic Plan C"]
GROUPS = [("SYN-G-001", "Northfield Synthetic Medical Group", 28, 0.40), ("SYN-G-002", "Harborline Synthetic Health Partners", 34, 0.55),
          ("SYN-G-003", "Cedar Vale Synthetic Clinic", 12, 0.35), ("SYN-G-004", "Summit Ridge Synthetic Physicians", 40, 0.50),
          ("SYN-G-005", "Lakeshore Synthetic Pediatrics", 16, 0.45), ("SYN-G-006", "Ironwood Synthetic Orthopaedics", 20, 0.60)]


def addr(i):
    return f"{100 + i * 7 % 800} Example Street, Suite {1 + i % 40}, Sampletown ZZ 000{10 + i % 80}"


def phone(i):
    return f"(555) 010-{1000 + i * 37 % 9000}"


def name(i):
    return f"Dr. {FIRST[i % len(FIRST)]} {LAST[(i * 7 + i // len(FIRST)) % len(LAST)]}"


roster, groups, n = [], [], 0
for gid, gname, size, fresh_share in GROUPS:
    groups.append({"id": gid, "name": gname, "plans": PLANS if gid == "SYN-G-001" else PLANS[: 1 + n % 3], "clinicians": size})
    for _ in range(size):
        n += 1
        age = random.randint(10, 85) if random.random() < fresh_share else random.randint(95, 330)
        roster.append({"id": f"SYN-P-{n:04d}", "npi": str(1000000000 + n), "name": name(n), "specialty": random.choice(SPEC),
                       "group": gid, "location": addr(n), "phone": phone(n), "status": "active",
                       "last_verified": (DEMO - timedelta(days=age)).isoformat()})

CHECKS = {
    "ADD": ["NPI format and check digit (synthetic registry)", "Name matches registry entry", "Licence active (synthetic state board)", "Credentialing on file with the plan"],
    "TERM": ["Termination date present and not in the future", "Clinician exists on the plan record", "No members assigned as primary care clinician"],
    "UPDATE": ["Value format valid", "Agrees with synthetic registry or address standard", "No competing submission in the last 30 days"],
    "DUPLICATE": ["Same NPI appears once in the file", "Name variants resolve to one person"],
    "CONFLICT": ["Value format valid", "No competing submission in the last 30 days"],
}


def checks(kind, fail=None, warn=None, detail=""):
    out = []
    for i, c in enumerate(CHECKS[kind]):
        res = "fail" if fail == i else "warn" if warn == i else "pass"
        out.append({"name": c, "result": res, "detail": detail if res != "pass" else ""})
    return out


def change(cid, r, kind, field, old, new, conf, tier, rec, reason, chk, status, edge=None, sub_days=0, pid=None, pname=None, npi=None):
    g = next(x for x in GROUPS if x[0] == (r["group"] if r else "SYN-G-001"))
    return {"id": f"SYN-C-{cid:03d}", "group": g[0], "group_name": g[1], "practitioner_id": pid or r["id"],
            "practitioner": pname or r["name"], "npi": npi or r["npi"], "type": kind, "field": field, "old": old, "new": new,
            "confidence": conf, "tier": tier, "recommend": rec, "reason": reason, "checks": chk, "edge": edge,
            "submitted": (DEMO - timedelta(days=sub_days)).isoformat(), "status": status, "include": True}


g1 = [r for r in roster if r["group"] == "SYN-G-001"]
pcp = next(r for r in g1 if r["specialty"] in ("Family Medicine", "Internal Medicine", "Pediatrics"))
others = [r for r in g1 if r is not pcp]
ch = [
    change(1, None, "ADD", "record", "Not on plan record", "Cardiology", 0.96, "auto", "Approve", "All checks passed; credentialed through the group's delegated agreement.", checks("ADD"), "draft", pid="SYN-P-0901", pname="Dr. Imre Castellane", npi="1000000901"),
    change(2, None, "ADD", "record", "Not on plan record", "Family Medicine", 0.88, "review", "Review", "New clinician is not yet credentialed with the plan: route to credentialing before activation.", checks("ADD", warn=3, detail="No credentialing file found"), "draft", edge="not_credentialed", pid="SYN-P-0902", pname="Dr. Petra Vollmarsh", npi="1000000902"),
    change(3, None, "ADD", "record", "Not on plan record", "Dermatology", 0.41, "review", "Reject", "Licence shows as expired in the synthetic state board check.", checks("ADD", fail=2, detail="Licence expired 2026-06-30"), "draft", edge="failed_check", pid="SYN-P-0903", pname="Dr. Odran Feathersby", npi="1000000903"),
    change(4, others[0], "TERM", "status", "active", "terminated 2026-10-31", 0.97, "auto", "Approve", "All checks passed; no members assigned.", checks("TERM"), "draft"),
    change(5, pcp, "TERM", "status", "active", "terminated 2026-11-30", 0.93, "review", "Review", "Primary care clinician with assigned members: member reassignment is needed before termination.", checks("TERM", warn=2, detail="214 synthetic members assigned"), "draft", edge="high_risk"),
    change(6, others[1], "UPDATE", "phone", others[1]["phone"], "(555) 010-4410", 0.98, "auto", "Approve", "All checks passed.", checks("UPDATE"), "draft"),
    change(7, others[2], "UPDATE", "location", others[2]["location"], "22 Example Parkway, Suite 300, Sampletown ZZ 00042", 0.95, "auto", "Approve", "Address standardised and matches the group's other clinicians at this site.", checks("UPDATE"), "draft"),
    change(8, others[3], "UPDATE", "phone", others[3]["phone"], "(555) 010-4411", 0.97, "auto", "Approve", "All checks passed.", checks("UPDATE"), "draft"),
    change(9, others[4], "UPDATE", "specialty", others[4]["specialty"], "Sports Medicine", 0.58, "review", "Review", "Low confidence: new specialty does not match the registry taxonomy on file.", checks("UPDATE", warn=1, detail="Registry shows " + others[4]["specialty"]), "draft", edge="low_confidence"),
    change(10, others[5], "DUPLICATE", "name", others[5]["name"] + " (listed twice)", "Merge into one record", 0.82, "review", "Approve", "Duplicate match: the same NPI appears twice in the file with a name variant.", checks("DUPLICATE", fail=0, detail="Rows 14 and 22 share NPI " + others[5]["npi"]), "draft", edge="duplicate"),
    change(11, others[6], "CONFLICT", "location", others[6]["location"], "9 Example Square, Suite 12, Sampletown ZZ 00017", 0.64, "review", "Review", "Conflicting records: a submission to Synthetic Plan B six days ago gave a different address.", checks("CONFLICT", fail=1, detail="Plan B submission: 31 Example Row, Suite 4"), "draft", edge="conflict"),
    change(12, others[7], "UPDATE", "phone", others[7]["phone"], "(555) 010-4412", 0.99, "auto", "Approve", "All checks passed.", checks("UPDATE"), "draft"),
]
REVIEW_REASONS = [("ADD", "New clinician is not yet credentialed with the plan: route to credentialing before activation.", 3, "No credentialing file found"),
                  ("UPDATE", "Low confidence: value disagrees with the synthetic registry.", 1, "Registry shows a different value"),
                  ("TERM", "Primary care clinician with assigned members: member reassignment is needed before termination.", 2, "Synthetic members assigned"),
                  ("UPDATE", "A competing submission arrived in the last 30 days.", 2, "Second submission on file")]
pool = [r for r in roster if r["group"] != "SYN-G-001"]
random.shuffle(pool)
for i in range(36):
    r, cid = pool[i], 13 + i
    if i < 28:
        kind = random.choices(["UPDATE", "TERM"], [0.8, 0.2])[0]
        if kind == "UPDATE":
            f = random.choice(["phone", "location"])
            new = phone(900 + i) if f == "phone" else addr(900 + i)
            ch.append(change(cid, r, "UPDATE", f, r[f], new, round(random.uniform(0.91, 0.99), 2), "auto", "Approve", "All checks passed.", checks("UPDATE"), "auto_applied", sub_days=random.randint(1, 20)))
        else:
            ch.append(change(cid, r, "TERM", "status", "active", "terminated 2026-10-31", round(random.uniform(0.92, 0.98), 2), "auto", "Approve", "All checks passed; no members assigned.", checks("TERM"), "auto_applied", sub_days=random.randint(1, 20)))
    else:
        kind, reason, w, d = REVIEW_REASONS[i % 4]
        if kind == "ADD":
            ch.append(change(cid, None, "ADD", "record", "Not on plan record", random.choice(SPEC), round(random.uniform(0.80, 0.89), 2), "review", "Review", reason, checks("ADD", warn=w, detail=d), "pending", edge="not_credentialed", sub_days=random.randint(1, 9), pid=f"SYN-P-09{i:02d}", pname=name(400 + i), npi=str(1000000900 + i)))
            ch[-1]["group"], ch[-1]["group_name"] = r["group"], next(x[1] for x in GROUPS if x[0] == r["group"])
        elif kind == "TERM":
            ch.append(change(cid, r, "TERM", "status", "active", "terminated 2026-11-30", round(random.uniform(0.90, 0.95), 2), "review", "Review", reason, checks("TERM", warn=w, detail=d), "pending", edge="high_risk", sub_days=random.randint(1, 9)))
        else:
            f = "specialty" if w == 1 else "location"
            new = random.choice([s for s in SPEC if s != r["specialty"]]) if f == "specialty" else addr(700 + i)
            ch.append(change(cid, r, "UPDATE", f, r[f], new, round(random.uniform(0.52, 0.74), 2), "review", "Review", reason, checks("UPDATE", warn=w, detail=d), "pending", edge="low_confidence" if w == 1 else "conflict", sub_days=random.randint(1, 9)))

out = {"meta": {"note": "Fully synthetic. Generated by gen_data.py with seed 42.", "demo_date": DEMO.isoformat()},
       "plans": PLANS, "groups": groups, "roster": roster, "changes": ch}
json.dump(out, open("data.json", "w"), indent=1)
print(len(roster), "roster records,", len(ch), "changes")
