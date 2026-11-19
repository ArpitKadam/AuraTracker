"""Build the bundled exercise catalog.

Run (from repo root, needs Python 3.10+, Pillow, ffmpeg and ffprobe on PATH):
    git clone --depth 1 https://github.com/RepDB/exercise-dataset.git data/raw/repdb
    git clone --depth 1 https://github.com/yuhonas/free-exercise-db.git data/raw/fedb
    python -I scripts/build_catalog.py

Inputs (gitignored, never committed):
  data/raw/repdb          RepDB free tier. In-app use with attribution; no redistribution as a dataset.
  data/raw/fedb           free-exercise-db, Unlicense.
  exercises/videos/*.mp4  the owner's demo videos, one per slug (third-party, not ours to publish).
  scripts/curated.json    hand-made list (committed): the owner's must-have exercises in order, each
                          mapped to an existing catalog id (or null = new entry) and a video slug (or null).
Outputs (gitignored, rebuilt locally):
  assets/catalog/catalog.json   one entry per unique exercise
  assets/catalog/videos/*.mp4   640 px wide, silent, faststart re-encodes of the demo videos
  assets/catalog/media/*.webp   one poster frame per video
  assets/catalog/index.ts       typed catalog + static require() maps for Metro
  missing-videos.txt            curated exercises that still have no video (repo root)

RepDB is primary. free-exercise-db entries whose normalised name matches a RepDB entry merge into it;
the rest are added as new exercises. Their images are not shipped any more: the demo videos replace
them, and exercises without a video have no media. curated.json entries rename/regroup their catalog
entry (ids never change, workout history points at them) or add `a:` entries. Every other video joins
the existing entry with the same name, or becomes a `v:` entry. Muscles map onto
react-native-body-highlighter slugs so the body map and the muscle picker share one vocabulary.
"""

import io
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
CURATED = ROOT / "scripts" / "curated.json"
VIDEO_SRC = ROOT / "exercises" / "videos"
MISSING = ROOT / "missing-videos.txt"
OUT = ROOT / "assets" / "catalog"
MEDIA = OUT / "media"
VIDEOS = OUT / "videos"
MEDIA_PX = 320  # long edge; thumbnails render at ~56-200dp
WEBP_Q = 70
VIDEO_PX = 640
VIDEO_MAX = 250_000  # bytes; crf steps up until a clip fits
CRFS = (30, 33, 36, 39)

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
EQUIPMENT = {"barbell", "dumbbell", "cable", "machine", "kettlebell", "band", "bodyweight", "ez-bar", "other"}

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


def safe(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# --- Leftover videos (not in curated.json) -------------------------------------------------------
# A video curated.json already uses only also joins its ALIAS entry. A leftover video joins the catalog entry ALIAS names, else the entry with the same name_key and
# compatible equipment; otherwise it becomes a new `v:<slug>` entry described by the heuristics below.
ALIAS = {
    "assisted-dip": "r:assisted-dips", "assisted-pull-up": "r:assisted-pull-ups",
    "barbell-forward-lunge": "r:barbell-lunge", "bench-dip": "r:bench-dips",
    "bench-tricep-extension": "f:Body_Tricep_Press", "cable-crossover-reverse-fly": "r:cable-reverse-fly",
    "cable-hip-extension": "r:cable-kickback", "cable-lying-chest-fly": "f:Flat_Bench_Cable_Flyes",
    "cable-row-2": "f:Seated_Cable_Rows", "cable-row-with-lat-bar": "r:wide-grip-seated-cable-row",
    "chair-calf-raise": "r:bodyweight-calf-raise", "clap-push-up": "r:clap-push-ups",
    "close-grip-push-up": "r:close-grip-push-ups", "decline-dumbbell-chest-fly": "r:decline-db-fly",
    "diamond-push-up": "r:diamond-push-ups", "dumbbell-backwards-lunge": "f:Dumbbell_Rear_Lunge",
    "dumbbell-concentration-curl": "r:concentration-curl", "elliptical": "r:elliptical-trainer",
    "hack-squat-machine": "r:hack-squat", "high-row-machine": "f:Leverage_High_Row",
    "hip-adduction-machine": "r:hip-adduction", "hyperextension": "r:back-extension",
    "jump-lunge": "r:plyo-lunge", "lateral-raise-machine": "r:plate-loaded-lateral-raise",
    "leg-press-calf-raise": "f:Calf_Press_On_The_Leg_Press_Machine", "leg-press-machine": "r:horizontal-leg-press",
    "narrow-grip-pull-up": "r:close-grip-pull-ups", "one-arm-cable-chest-fly": "f:Single-Arm_Cable_Crossover",
    "one-arm-cable-curl": "f:Standing_One-Arm_Cable_Curl", "one-arm-cable-tricep-kickback": "r:cable-tricep-kickback",
    "one-arm-cable-underhand-tricep-extension": "f:Cable_One_Arm_Tricep_Extension",
    "one-arm-tricep-extension": "r:single-arm-dumbbell-overhead-tricep-extension",
    "prone-incline-barbell-curl": "f:Barbell_Curls_Lying_Against_An_Incline", "reverse-hyper": "f:Reverse_Hyperextension",
    "row": "r:rowing-machine", "seated-leg-curl-machine": "r:seated-leg-curl",
    "single-leg-dumbbell-deadlift": "r:single-leg-romanian-deadlift",
    "single-leg-squat": "r:pistol-squat",
    # clips a curated entry also uses: keep them on their own catalog exercise too
    "close-grip-lat-pulldown": "r:close-grip-lat-pulldown", "stiff-legged-barbell-deadlift": "f:Stiff-Legged_Barbell_Deadlift",
    "spin-bike": "r:stationary-bike", "stepmill": "f:Step_Mill", "straight-leg-kickback": "r:glute-kickback",
    "t-bar-row-machine": "f:Lying_T-Bar_Row", "wide-grip-barbell-curl": "f:Wide-Grip_Standing_Barbell_Curl",
}
# Explicit fields for new `v:` entries where the slug alone says too little or the heuristic is wrong.
VIDEO_NEW = {
    "cable-hip-adduction-2": {"name": "Cable Hip Adduction (Variation)"},
    "hip-thrust": {"name": "Bodyweight Hip Thrust"},
    "olympic-parallel-bar-hammer-curl": {"name": "Parallel Bar Hammer Curl", "equipment": "other"},
    "preacher-curl": {"name": "EZ-Bar Preacher Curl", "equipment": "ez-bar"},
    "dumbbell-pylo-squat": {"name": "Dumbbell Plyo Squat"},
    "push-up-with-back-extension": {"primary": ["chest", "lower-back"], "secondary": ["triceps", "gluteal"],
                                    "mechanic": "compound"},
    "front-foot-elevated-goblet-split-squat": {"equipment": "kettlebell"},
    "front-squat-with-crossed-arms": {"equipment": "barbell"},
    "kneeling-diamond-push": {"name": "Kneeling Diamond Push-Up", "primary": ["triceps", "chest"], "secondary": ["deltoids"]},
    "battle-ropes": {"category": "cardio"},
}
EQUIPMENT_WORDS = (("ez-bar", "ez-bar"), ("band", "band"), ("cable", "cable"), ("smith", "machine"), ("machine", "machine"),
                   ("barbell", "barbell"), ("t-bar", "barbell"), ("dumbbell", "dumbbell"), ("kettlebell", "kettlebell"),
                   ("stability-ball", "other"), ("plate", "other"), ("bike", "machine"), ("elliptical", "machine"),
                   ("stepmill", "machine"), ("sled", "other"), ("battle-ropes", "other"), ("rope", "cable"),
                   ("bodyweight", "bodyweight"))
# ponytail: first matching slug fragment decides muscles/mechanic for a new `v:` entry; reviewed against
# the 2026-11 video set. Add a VIDEO_NEW override when a new clip lands in the wrong bucket.
MUSCLE_RULES = (
    ("calf", ["calves"], [], "isolation"),
    ("wrist", ["forearm"], [], "isolation"),
    ("nordic|bridge-curl|leg-curl", ["hamstring"], ["calves"], "isolation"),
    ("curl", ["biceps"], ["forearm"], "isolation"),
    ("glute|hip-thrust|hip-extension|leg-kickback", ["gluteal"], ["hamstring"], "isolation"),
    ("abduction", ["gluteal"], [], "isolation"),
    ("adduction", ["adductors"], [], "isolation"),
    ("dip", ["triceps"], ["chest", "deltoids"], "compound"),
    ("tricep", ["triceps"], [], "isolation"),
    ("deadlift|good-morning|clean", ["hamstring", "gluteal"], ["lower-back", "trapezius"], "compound"),
    ("hyper|back-extension|superman-hold", ["lower-back"], ["gluteal", "hamstring"], "isolation"),
    ("squat|lunge|leg-press|burpee", ["quadriceps", "gluteal"], ["hamstring"], "compound"),
    ("leg-extension", ["quadriceps"], [], "isolation"),
    ("bike|elliptical|stepmill|sled", ["quadriceps", "gluteal"], ["calves", "hamstring"], "compound"),
    ("battle-ropes", ["deltoids"], ["abs", "forearm"], "compound"),
    ("shrug", ["trapezius"], [], "isolation"),
    ("face-pull|reverse-fly|rear-lateral", ["deltoids"], ["upper-back", "trapezius"], "isolation"),
    ("raise|iron-cross", ["deltoids"], ["trapezius"], "isolation"),
    ("upright-row", ["deltoids"], ["trapezius", "biceps"], "compound"),
    ("shoulder-press|seesaw-press|angled-press|halo", ["deltoids"], ["triceps"], "compound"),
    ("pullover", ["upper-back", "chest"], ["triceps"], "isolation"),
    ("row|pulldown|pull-up|chin-up", ["upper-back"], ["biceps", "deltoids"], "compound"),
    ("fly", ["chest"], ["deltoids"], "isolation"),
    ("press|push|bench", ["chest"], ["triceps", "deltoids"], "compound"),
)
NAME_FIX = (("Ez Bar", "EZ-Bar"), ("T Bar", "T-Bar"), ("V Bar", "V-Bar"), ("Push Up", "Push-Up"), ("Pull Up", "Pull-Up"),
            ("Chin Up", "Chin-Up"), ("Sit Up", "Sit-Up"), ("One Arm", "One-Arm"), ("Single Leg", "Single-Leg"),
            (" With ", " with "), (" On ", " on "), (" Over ", " over "), (" To ", " to "))


def slug_equipment(slug: str):
    return next((eq for word, eq in EQUIPMENT_WORDS if word in slug), None)


def video_entry(slug: str) -> dict:
    over = VIDEO_NEW.get(slug, {})
    name = " ".join(w.capitalize() for w in slug.split("-"))
    for a, b in NAME_FIX:
        name = name.replace(a, b)
    _, primary, secondary, mechanic = next(r for r in MUSCLE_RULES if re.search(r[0], slug))
    primary = over.get("primary", primary)
    cardio = re.search(r"bike|elliptical|stepmill", slug)
    return {
        "id": f"v:{slug}",
        "name": over.get("name", name),
        "primary": primary,
        "secondary": over.get("secondary", secondary),
        "groups": groups_for(primary),
        "equipment": over.get("equipment", slug_equipment(slug) or "bodyweight"),
        "mechanic": over.get("mechanic", mechanic),
        "level": None,
        "category": over.get("category", "cardio" if cardio else "strength"),
        "instructions": [],
        "tips": [],
        "media": [],
        "sources": ["curated"],
        "video": None,
        "curated": None,
    }


def build():
    repdb = json.loads((RAW / "repdb" / "exercises.json").read_text(encoding="utf8"))["exercises"]
    fedb = json.loads((RAW / "fedb" / "dist" / "exercises.json").read_text(encoding="utf8"))
    curated = json.loads(CURATED.read_text(encoding="utf8"))

    # The source images are no longer shipped, but an entry still needs them to be included: that keeps
    # the catalog (and every id workout history may reference) exactly as it was.
    catalog, by_key, skipped = [], {}, []
    for e in repdb:
        primary = muscles(e.get("primary_muscles"), REPDB_MUSCLE)
        if not primary:
            continue
        if name_key(e["name_en"]) in by_key:  # RepDB variant that only differs by implied barbell/grip words
            skipped.append(e["name_en"])
            continue
        if not any(k in ((e.get("images") or {}).get("flat") or {}) for k in ("start", "peak", "main")):
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
            "media": [],
            "sources": ["repdb"],
        }
        catalog.append(item)
        by_key.setdefault(name_key(item["name"]), item)

    merged = 0
    for e in fedb:
        has_img = any((RAW / "fedb" / "exercises" / p).exists() for p in e.get("images") or [])
        hit = by_key.get(name_key(e["name"]))
        if hit:
            hit["sources"].append("fedb")
            merged += 1
            continue
        primary = muscles(e.get("primaryMuscles"), FEDB_MUSCLE)
        if not primary or not has_img:
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
            "media": [],
            "sources": ["fedb"],
        }
        catalog.append(item)
        by_key.setdefault(name_key(item["name"]), item)
    for c in catalog:
        c["video"] = c["curated"] = None

    by_id = {c["id"]: c for c in catalog}
    for i, e in enumerate(curated):
        if e["catalog"]:
            assert e["catalog"] in by_id, f"curated.json: unknown catalog id {e['catalog']}"
            item = by_id[e["catalog"]]
            assert item["curated"] is None, f"curated.json: {e['catalog']} mapped twice"
        else:
            item = {
                "id": f"a:{safe(e['name'])}", "name": e["name"], "primary": e["primary"], "secondary": e["secondary"],
                "groups": groups_for(e["primary"]), "equipment": e["equipment"], "mechanic": e["mechanic"],
                "level": None, "category": "strength", "instructions": [], "tips": [], "media": [],
                "sources": ["curated"], "video": None, "curated": None,
            }
            catalog.append(item)
            by_id[item["id"]] = item
        item["name"] = e["name"]
        if e["group"] not in item["groups"]:
            item["groups"].append(e["group"])
        item["video"] = e["video"] and f"{e['video']}.mp4"
        item["curated"] = i

    sources = sorted(p.stem for p in VIDEO_SRC.glob("*.mp4"))
    taken = {c["video"][:-4] for c in catalog if c["video"]}
    free = {}  # name_key -> entry that can still take a video
    for c in catalog:
        if c["curated"] is None:
            free.setdefault(name_key(c["name"]), c)
    for slug in sources:
        if slug in taken and slug not in ALIAS:
            continue
        target = by_id.get(ALIAS.get(slug))
        if target is None:
            hit = free.get(name_key(slug))
            if hit and not hit["video"] and slug_equipment(slug) in (None, hit["equipment"]):
                target = hit
        if target is None and slug in taken:
            continue
        assert target is None or (not target["video"] and target["curated"] is None), f"{slug}: target taken"
        if target is None:
            target = video_entry(slug)
            catalog.append(target)
            by_id[target["id"]] = target
        target["video"] = f"{slug}.mp4"

    MEDIA.mkdir(parents=True, exist_ok=True)
    VIDEOS.mkdir(parents=True, exist_ok=True)
    used = list(dict.fromkeys(c["video"][:-4] for c in catalog if c["video"]))
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(encode, used))
    for c in catalog:
        c["media"] = [f"v-{c['video'][:-4]}.webp"] if c["video"] else []
    keep = {m for c in catalog for m in c["media"]} | {c["video"] for c in catalog if c["video"]}
    for stale in [p for d in (MEDIA, VIDEOS) for p in d.iterdir() if p.name not in keep]:
        stale.unlink()  # old RepDB/fedb images and dropped videos

    catalog.sort(key=lambda x: x["name"].lower())
    check(catalog, curated, sources)
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    write_index(catalog)
    write_missing(curated)

    vsize = sum(f.stat().st_size for f in VIDEOS.iterdir())
    msize = sum(f.stat().st_size for f in MEDIA.iterdir())
    print(f"skipped {len(skipped)} near-duplicate RepDB entries: {', '.join(skipped)}")
    print(f"{len(catalog)} exercises ({len(repdb)} RepDB, {merged} free-exercise-db merged into them), "
          f"{len(curated)} curated, {len(used)} videos {vsize / 1e6:.1f} MB, posters {msize / 1e6:.1f} MB")


def fresh(dst: Path, src: Path) -> bool:
    return dst.exists() and dst.stat().st_mtime > src.stat().st_mtime


def encode(slug: str):
    src, dst, poster = VIDEO_SRC / f"{slug}.mp4", VIDEOS / f"{slug}.mp4", MEDIA / f"v-{slug}.webp"
    if not fresh(dst, src):
        for crf in CRFS:
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-an", "-vf", f"scale={VIDEO_PX}:-2",
                            "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", str(crf),
                            "-preset", "slow", "-movflags", "+faststart", dst], check=True)
            if dst.stat().st_size <= VIDEO_MAX:
                break
    if not fresh(poster, src):
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src],
                                   capture_output=True, text=True, check=True).stdout)
        png = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{dur * 0.45:.2f}", "-i", src, "-frames:v", "1",
                              "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True).stdout
        with Image.open(io.BytesIO(png)) as im:
            im = im.convert("RGB")
            im.thumbnail((MEDIA_PX, MEDIA_PX))
            im.save(poster, "WEBP", quality=WEBP_Q, method=6)


def check(catalog, curated, sources):
    ids = [c["id"] for c in catalog]
    assert len(ids) == len(set(ids)), "duplicate ids"
    # Name clashes are only a merge bug among dataset entries; curated and video entries may shadow one.
    keys = [name_key(c["name"]) for c in catalog if c["curated"] is None and c["id"][0] in "rf"]
    dupes = {k for k in keys if keys.count(k) > 1}
    assert not dupes, f"duplicate names after merge: {sorted(dupes)[:5]}"
    for c in catalog:
        assert c["media"] == ([f"v-{c['video'][:-4]}.webp"] if c["video"] else []), f"{c['id']} media/video mismatch"
        assert c["primary"] and all(s in SLUGS for s in c["primary"] + c["secondary"]), f"{c['id']} bad muscle"
        assert c["groups"] or c["primary"] == ["neck"], f"{c['id']} maps to no picker group"
        assert c["equipment"] in EQUIPMENT, f"{c['id']} bad equipment {c['equipment']}"
    for g in GROUPS:
        assert any(g in c["groups"] for c in catalog), f"group {g} is empty"

    by_curated = {}
    for c in catalog:
        if c["curated"] is not None:
            assert c["curated"] not in by_curated, f"curated index {c['curated']} used twice"
            by_curated[c["curated"]] = c
    assert sorted(by_curated) == list(range(len(curated))), "curated.json entries missing from the catalog"
    for i, e in enumerate(curated):
        c = by_curated[i]
        assert c["name"] == e["name"] and e["group"] in c["groups"], f"curated {e['name']} not applied"
        assert c["video"] == (e["video"] and f"{e['video']}.mp4"), f"curated {e['name']} video mismatch"
        assert e["catalog"] in (None, c["id"]), f"curated {e['name']} id mismatch"
    for g in ("abs", "forearms"):
        assert sum(e["group"] == g for e in curated) >= 5, f"fewer than 5 curated {g} exercises"

    videos = {c["video"] for c in catalog if c["video"]}
    assert {v[:-4] for v in videos} == set(sources), f"unattached videos: {sorted(set(sources) - {v[:-4] for v in videos})}"
    for v in videos:
        assert (VIDEOS / v).exists() and (MEDIA / f"v-{v[:-4]}.webp").exists(), f"{v} or its poster missing on disk"


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
        *[f"  {json.dumps(m)}: require('./media/{m}')," for m in sorted({m for c in catalog for m in c["media"]})],
        "};",
        "",
        "export const VIDEOS: Record<string, number> = {",
        *[f"  {json.dumps(v)}: require('./videos/{v}')," for v in sorted({c["video"] for c in catalog if c["video"]})],
        "};",
        "",
    ]
    (OUT / "index.ts").write_text("\n".join(lines), encoding="utf8")


def write_missing(curated):
    lines = ["Must-have exercises with no demo video yet. Add exercises/videos/<slug>.mp4, set its \"video\" "
             "in scripts/curated.json, then rerun: python -I scripts/build_catalog.py"]
    last = None
    for e in curated:
        if e["video"]:
            continue
        if e["group"] != last:
            lines.append("")
            last = e["group"]
        lines.append(f"{e['group'].capitalize()}: {e['name']}")
    MISSING.write_text("\n".join(lines) + "\n", encoding="utf8")


if __name__ == "__main__":
    if "--keys" in sys.argv:  # debug: python -I scripts/build_catalog.py --keys "Barbell Bench Press"
        print(name_key(sys.argv[-1]))
    else:
        build()
