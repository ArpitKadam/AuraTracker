"""Build the bundled exercise catalog.

Run (from repo root, needs Python 3.10+ and Pillow):
    git clone --depth 1 https://github.com/RepDB/exercise-dataset.git data/raw/repdb
    git clone --depth 1 https://github.com/yuhonas/free-exercise-db.git data/raw/fedb
    python -I scripts/build_catalog.py

Inputs (gitignored, never committed):
  data/raw/repdb  RepDB free tier. In-app use with attribution; no redistribution as a dataset.
  data/raw/fedb   free-exercise-db, Unlicense.
Outputs (gitignored, rebuilt locally):
  assets/catalog/catalog.json   one entry per unique exercise
  assets/catalog/media/*.webp   resized images
  assets/catalog/index.ts       typed catalog + static require() map for Metro

RepDB is primary. free-exercise-db entries whose normalised name matches a RepDB entry only add
their photos; the rest are added as new exercises. Muscles map onto react-native-body-highlighter
slugs so the body map and the muscle picker share one vocabulary.
"""

import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "assets" / "catalog"
MEDIA = OUT / "media"
MEDIA_PX = 320  # long edge; thumbnails render at ~56-200dp
WEBP_Q = 70

# Body-map slugs (react-native-body-highlighter) and the picker groups built on them.
GROUPS = {
    "chest": ["chest"],
    "back": ["upper-back", "lower-back", "trapezius"],
    "shoulders": ["deltoids"],
    "biceps": ["biceps"],
    "triceps": ["triceps"],
    "forearms": ["forearm"],
    "abs": ["abs", "obliques"],
    "legs": ["quadriceps", "hamstring", "gluteal", "calves", "adductors", "tibialis"],
}
SLUGS = {s for v in GROUPS.values() for s in v} | {"neck"}

REPDB_MUSCLE = {
    "pectoralis_major": "chest", "serratus_anterior": "obliques",
    "latissimus_dorsi": "upper-back", "rhomboids": "upper-back", "infraspinatus_teres_minor": "deltoids",
    "supraspinatus": "deltoids", "trapezius": "trapezius", "erector_spinae": "lower-back",
    "quadratus_lumborum": "lower-back",
    "anterior_deltoid": "deltoids", "lateral_deltoid": "deltoids", "posterior_deltoid": "deltoids",
    "biceps_brachii": "biceps", "brachialis": "biceps", "triceps_brachii": "triceps",
    "forearm_flexors": "forearm", "forearm_extensors": "forearm", "brachioradialis": "forearm", "forearms": "forearm",
    "rectus_abdominis": "abs", "transverse_abdominis": "abs", "obliques": "obliques",
    "quadriceps": "quadriceps", "hip_flexors": "quadriceps", "hamstrings": "hamstring",
    "gluteus_maximus": "gluteal", "gluteus_medius": "gluteal", "abductors": "gluteal",
    "adductors": "adductors", "gastrocnemius": "calves", "soleus": "calves", "tibialis_anterior": "tibialis",
}
FEDB_MUSCLE = {
    "chest": "chest", "lats": "upper-back", "middle back": "upper-back", "traps": "trapezius",
    "lower back": "lower-back", "shoulders": "deltoids", "biceps": "biceps", "triceps": "triceps",
    "forearms": "forearm", "abdominals": "abs", "quadriceps": "quadriceps", "hamstrings": "hamstring",
    "glutes": "gluteal", "abductors": "gluteal", "adductors": "adductors", "calves": "calves", "neck": "neck",
}
FEDB_EQUIPMENT = {
    "barbell": "barbell", "dumbbell": "dumbbell", "cable": "cable", "machine": "machine",
    "kettlebells": "kettlebell", "bands": "band", "body only": "bodyweight", "e-z curl bar": "ez-bar",
}
FEDB_LEVEL = {"beginner": "beginner", "intermediate": "intermediate", "expert": "advanced"}

STOP = {"with", "the", "on", "a", "an", "and", "to", "of"}
SYN = {"db": "dumbbell", "dumbbells": "dumbbell", "bb": "barbell", "tricep": "triceps", "bicep": "biceps",
       "flye": "fly", "flyes": "fly", "flys": "fly", "pushdown": "push down", "pulldown": "pull down",
       "pullup": "pull up", "pushup": "push up", "situp": "sit up", "ez": "ezbar", "ohp": "overhead press"}


def name_key(name: str) -> str:
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower().replace("-", " ").replace("/", " ")).split()
    words = " ".join(SYN.get(w, w) for w in words).split()
    words = [w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith("ss") else w for w in words]
    words = {w for w in words if w not in STOP and w not in {"medium", "grip"} or w == "grip" and "close" in words}
    # Barbell is the implied default ("Bench Press" == "Barbell Bench Press"), other equipment words stay.
    words.discard("barbell")
    return " ".join(sorted(words))


EQ_PRIORITY = ["machine", "cable", "barbell", "ez-bar", "dumbbell", "kettlebell", "band", "bodyweight", "other"]
ICON_EQUIPMENT = {
    "cable": "cable", "barbell": "barbell", "trap-bar": "barbell", "ez-bar": "ez-bar", "dumbbell": "dumbbell",
    "kettlebell": "kettlebell", "loop-band": "band", "resistance-band": "band", "pull-up-bar": "bodyweight",
    "dip-station": "bodyweight", "rings": "bodyweight", "suspension-trainer": "bodyweight", "flat-bench": "bodyweight",
}


def repdb_equipment(exercise_id: str):
    """Equipment from the icons on RepDB's own exercise page; None if the page lists none."""
    page = RAW / "repdb" / "exercise" / exercise_id / "index.html"
    if not page.exists():
        return None
    icons = set(re.findall(r"images/equipment/([a-z0-9-]+)\.webp", page.read_text(encoding="utf8", errors="ignore")))
    found = {"machine" if i.endswith("machine") or i in {"leg-press", "leg-curl", "leg-extension", "hack-squat", "pec-deck",
             "glute-ham-developer"} else ICON_EQUIPMENT.get(i, "other") for i in icons}
    return next((e for e in EQ_PRIORITY if e in found), None)


def infer_equipment(name: str, bodyweight: bool) -> str:
    # ponytail: name heuristics for the few RepDB pages without equipment icons.
    n = name.lower()
    for word, eq in (("smith", "machine"), ("machine", "machine"), ("leg press", "machine"), ("pec deck", "machine"),
                     ("cable", "cable"), ("rope", "cable"), ("pushdown", "cable"), ("pulldown", "cable"),
                     ("kettlebell", "kettlebell"), ("band", "band"), ("ez-bar", "ez-bar"), ("ez bar", "ez-bar"),
                     ("dumbbell", "dumbbell"), ("db ", "dumbbell"), ("barbell", "barbell"), ("landmine", "barbell")):
        if word in n:
            return eq
    if bodyweight:
        return "bodyweight"
    if re.search(r"\b(bench press|deadlift|squat|ohp|overhead press|good morning|hip thrust)\b", n):
        return "barbell"
    return "other"


def muscles(raw, table):
    out = []
    for m in raw or []:
        s = table.get(m)
        if s and s not in out:
            out.append(s)
    return out


def groups_for(primary):
    return [g for g, slugs in GROUPS.items() if any(s in slugs for s in primary)]


def save_image(src: Path, name: str) -> str:
    dst = MEDIA / f"{name}.webp"
    with Image.open(src) as im:
        im = im.convert("RGB")
        im.thumbnail((MEDIA_PX, MEDIA_PX))
        im.save(dst, "WEBP", quality=WEBP_Q, method=6)
    return dst.name


def safe(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def build():
    repdb = json.loads((RAW / "repdb" / "exercises.json").read_text(encoding="utf8"))["exercises"]
    fedb = json.loads((RAW / "fedb" / "dist" / "exercises.json").read_text(encoding="utf8"))
    if MEDIA.exists():
        shutil.rmtree(MEDIA)
    MEDIA.mkdir(parents=True)

    catalog, by_key, skipped = [], {}, []
    for e in repdb:
        primary = muscles(e.get("primary_muscles"), REPDB_MUSCLE)
        if not primary:
            continue
        if name_key(e["name_en"]) in by_key:  # RepDB variant that only differs by implied barbell/grip words
            skipped.append(e["name_en"])
            continue
        flat = (e.get("images") or {}).get("flat") or {}
        media = [save_image(RAW / "repdb" / flat[k], f"r-{safe(e['id'])}-{k}") for k in ("start", "peak", "main") if k in flat]
        if not media:
            continue
        item = {
            "id": f"r:{e['id']}",
            "name": e["name_en"],
            "primary": primary,
            "secondary": [m for m in muscles(e.get("secondary_muscles"), REPDB_MUSCLE) if m not in primary],
            "groups": groups_for(primary),
            "equipment": repdb_equipment(e["id"]) or infer_equipment(e["name_en"], bool(e.get("is_bodyweight"))),
            "mechanic": e.get("mechanic"),
            "level": e.get("difficulty"),
            "category": e.get("category"),
            "instructions": e.get("instructions_en") or [],
            "tips": e.get("tips_en") or [],
            "media": media,
            "sources": ["repdb"],
        }
        catalog.append(item)
        by_key.setdefault(name_key(item["name"]), item)

    merged = 0
    for e in fedb:
        imgs = [RAW / "fedb" / "exercises" / p for p in e.get("images") or []]
        imgs = [p for p in imgs if p.exists()]
        hit = by_key.get(name_key(e["name"]))
        if hit:
            if imgs:
                hit["media"] += [save_image(p, f"f-{safe(e['id'])}-{i}") for i, p in enumerate(imgs)]
            hit["sources"].append("fedb")
            merged += 1
            continue
        primary = muscles(e.get("primaryMuscles"), FEDB_MUSCLE)
        if not primary or not imgs:
            continue
        item = {
            "id": f"f:{e['id']}",
            "name": e["name"],
            "primary": primary,
            "secondary": [m for m in muscles(e.get("secondaryMuscles"), FEDB_MUSCLE) if m not in primary],
            "groups": groups_for(primary),
            "equipment": FEDB_EQUIPMENT.get(e.get("equipment"), "other"),
            "mechanic": e.get("mechanic"),
            "level": FEDB_LEVEL.get(e.get("level")),
            "category": e.get("category"),
            "instructions": e.get("instructions") or [],
            "tips": [],
            "media": [save_image(p, f"f-{safe(e['id'])}-{i}") for i, p in enumerate(imgs)],
            "sources": ["fedb"],
        }
        catalog.append(item)
        by_key.setdefault(name_key(item["name"]), item)

    catalog.sort(key=lambda x: x["name"].lower())
    check(catalog)
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    write_index(catalog)

    size = sum(f.stat().st_size for f in MEDIA.iterdir())
    print(f"skipped {len(skipped)} near-duplicate RepDB entries: {', '.join(skipped)}")
    print(f"{len(catalog)} exercises ({len(repdb)} RepDB, {merged} free-exercise-db merged into them), "
          f"{sum(len(c['media']) for c in catalog)} images, {size / 1e6:.1f} MB media")


def check(catalog):
    ids = [c["id"] for c in catalog]
    assert len(ids) == len(set(ids)), "duplicate ids"
    keys = [name_key(c["name"]) for c in catalog]
    dupes = {k for k in keys if keys.count(k) > 1}
    assert not dupes, f"duplicate names after merge: {sorted(dupes)[:5]}"
    for c in catalog:
        assert c["media"], f"{c['id']} has no media"
        assert all((MEDIA / m).exists() for m in c["media"]), f"{c['id']} media missing on disk"
        assert c["primary"] and all(s in SLUGS for s in c["primary"] + c["secondary"]), f"{c['id']} bad muscle"
        assert c["groups"] or c["primary"] == ["neck"], f"{c['id']} maps to no picker group"
    for g in GROUPS:
        assert any(g in c["groups"] for c in catalog), f"group {g} is empty"


def write_index(catalog):
    lines = [
        "// Generated by scripts/build_catalog.py. Do not edit, do not commit (RepDB licence).",
        "import type { CatalogExercise } from '@/fitness/catalog-types';",
        "",
        "import data from './catalog.json';",
        "",
        "export const CATALOG = data as CatalogExercise[];",
        "",
        "export const MEDIA: Record<string, number> = {",
        *[f"  {json.dumps(m)}: require('./media/{m}')," for c in catalog for m in c["media"]],
        "};",
        "",
    ]
    (OUT / "index.ts").write_text("\n".join(lines), encoding="utf8")


if __name__ == "__main__":
    if "--keys" in sys.argv:  # debug: python -I scripts/build_catalog.py --keys "Barbell Bench Press"
        print(name_key(sys.argv[-1]))
    else:
        build()
