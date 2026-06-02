import json
import os
from pathlib import Path
from uuid import uuid4
from dotenv import load_dotenv

from flask import Flask, jsonify, render_template, request, session, redirect, url_for
from pymongo import MongoClient

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "goal_striver_secret")
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "problems_migrated.json"
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.environ.get("MONGO_DB", "striver")
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
problems_collection = db["problems"]
user_progress_collection = db["user_progress"]
users_collection = db["users"]
state_collection = db["ui_state"]
indexes_ready = False


def ensure_indexes():
    global indexes_ready
    if indexes_ready:
        return
    try:
        problems_collection.create_index("id", unique=True)
        user_progress_collection.create_index([("user_id", 1), ("problem_id", 1)], unique=True)
    except Exception:
        pass
    problems_collection.create_index("order")
    users_collection.create_index("username", unique=True)
    state_collection.create_index("user_id", unique=True)
    indexes_ready = True


def seed_mongo():
    ensure_indexes()
    # Seed default user rakesh
    if not users_collection.find_one({"username": "rakesh"}):
        users_collection.insert_one({"username": "rakesh", "password": "rakesh"})

    if problems_collection.count_documents({}) == 0 and DATA_FILE.exists():
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        problems = data.get("problems", [])
        if problems:
            try:
                problems_collection.insert_many(problems, ordered=False)
            except Exception:
                pass


def public_problem(problem):
    problem.pop("_id", None)
    if "author" not in problem:
        problem["author"] = "rakesh"
    return problem


def normalize_problem(raw, order):
    practice = raw.get("practice") or {}
    return {
        "id": str(raw.get("id") or f"custom-{uuid4().hex[:8]}"),
        "order": int(raw.get("order") or order),
        "step": (raw.get("step") or "Custom").strip(),
        "lecture": (raw.get("lecture") or "Custom").strip(),
        "title": (raw.get("title") or "").strip(),
        "article": (raw.get("article") or "").strip(),
        "youtube": (raw.get("youtube") or "").strip(),
        "difficulty": (raw.get("difficulty") or "").strip(),
        "practice": {
            "tuf": listify(practice.get("tuf") or raw.get("tuf")),
            "naukri": listify(practice.get("naukri") or raw.get("naukri")),
            "leetcode": listify(practice.get("leetcode") or raw.get("leetcode")),
            "gfg": listify(practice.get("gfg") or raw.get("gfg")),
            "other": listify(practice.get("other") or raw.get("other")),
        },
    }


def listify(value):
    if not value:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return [line.strip() for line in str(value).replace(",", "\n").splitlines() if line.strip()]


@app.get("/")
def index():
    if not session.get('user_id'):
        return redirect(url_for('login'))
    seed_mongo()
    return render_template("index.html", username=session['user_id'])


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get('user_id'):
        return redirect(url_for('index'))
    error = None
    if request.method == "POST":
        action = request.form.get("action")
        username = (request.form.get("username") or "").strip()
        password = (request.form.get("password") or "").strip()

        if action == "register":
            if not username or not password:
                error = "Username and password are required."
            elif users_collection.find_one({"username": username}):
                error = "Username already exists. Please sign in."
            else:
                users_collection.insert_one({"username": username, "password": password})
                session['user_id'] = username
                return redirect(url_for('index'))

        elif action == "signin":
            user = users_collection.find_one({"username": username, "password": password})
            if user:
                session['user_id'] = username
                return redirect(url_for('index'))
            else:
                error = "Invalid username or password."

    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.pop('user_id', None)
    return redirect(url_for('login'))


@app.get("/admin")
def admin():
    if not session.get('user_id'):
        return redirect(url_for('login'))
    return render_template("admin.html", username=session['user_id'])


@app.get("/api/problems")
def get_problems():
    if not session.get('user_id'):
        return jsonify({"error": "Unauthorized"}), 401
    seed_mongo()
    
    current_user = session['user_id']
    query = {"$or": [{"author": "rakesh"}, {"author": current_user}, {"author": {"$exists": False}}]}
    global_problems = list(problems_collection.find(query).sort("order", 1))
    user_progress = list(user_progress_collection.find({"user_id": current_user}))
    
    # Map progress by problem_id for fast lookup
    progress_map = {p["problem_id"]: p for p in user_progress}
    
    merged = []
    for gp in global_problems:
        p = dict(gp)
        prog = progress_map.get(p["id"], {})
        p["done"] = prog.get("done", False)
        p["revision"] = prog.get("revision", False)
        p["notes"] = prog.get("notes", "")
        merged.append(public_problem(p))
        
    return jsonify({"problems": merged})


@app.post("/api/problems")
def add_problem():
    if not session.get('user_id'):
        return jsonify({"error": "Unauthorized"}), 401
    seed_mongo()
    problem = normalize_problem(request.get_json() or request.form, problems_collection.count_documents({}) + 1)
    problem['author'] = session['user_id']
    problems_collection.insert_one(problem)
    
    # Check if they also sent progress data
    payload = request.get_json() or {}
    if payload.get("done") or payload.get("revision") or payload.get("notes"):
        user_progress_collection.update_one(
            {"user_id": session['user_id'], "problem_id": problem["id"]},
            {"$set": {
                "done": bool(payload.get("done")),
                "revision": bool(payload.get("revision")),
                "notes": payload.get("notes", "")
            }},
            upsert=True
        )
        problem["done"] = bool(payload.get("done"))
        problem["revision"] = bool(payload.get("revision"))
        problem["notes"] = payload.get("notes", "")
    else:
        problem["done"] = False
        problem["revision"] = False
        problem["notes"] = ""
        
    return jsonify(public_problem(problem)), 201


@app.patch("/api/problems/<problem_id>")
def update_problem(problem_id):
    if not session.get('user_id'):
        return jsonify({"error": "Unauthorized"}), 401
    seed_mongo()
    payload = request.get_json() or {}
    
    global_update = {}
    for key in ["step", "lecture", "title", "article", "youtube", "difficulty"]:
        if key in payload:
            global_update[key] = payload[key]
    if "practice" in payload:
        practice = payload["practice"] or {}
        global_update["practice"] = {
            "tuf": listify(practice.get("tuf")),
            "naukri": listify(practice.get("naukri")),
            "leetcode": listify(practice.get("leetcode")),
            "gfg": listify(practice.get("gfg")),
            "other": listify(practice.get("other")),
        }

    progress_update = {}
    for key in ["done", "revision"]:
        if key in payload:
            progress_update[key] = bool(payload[key])
    if "notes" in payload:
        progress_update["notes"] = payload["notes"]

    problem = problems_collection.find_one({"id": str(problem_id)})
    if not problem:
        return jsonify({"error": "Problem not found"}), 404
        
    author = problem.get("author", "rakesh")
    current_user = session['user_id']

    if global_update:
        if author != current_user and not (current_user == "rakesh" and author == "rakesh"):
            return jsonify({"error": "Forbidden: You do not have permission to edit this problem's details"}), 403
        problems_collection.update_one({"id": str(problem_id)}, {"$set": global_update})
        
    if progress_update:
        user_progress_collection.update_one(
            {"user_id": session['user_id'], "problem_id": str(problem_id)},
            {"$set": progress_update},
            upsert=True
        )

    problem = problems_collection.find_one({"id": str(problem_id)})
    if not problem:
        return jsonify({"error": "Problem not found"}), 404
        
    prog = user_progress_collection.find_one({"user_id": session['user_id'], "problem_id": str(problem_id)}) or {}
    problem["done"] = prog.get("done", False)
    problem["revision"] = prog.get("revision", False)
    problem["notes"] = prog.get("notes", "")
    
    return jsonify(public_problem(problem))


@app.delete("/api/problems/<problem_id>")
def delete_problem(problem_id):
    if not session.get('user_id'):
        return jsonify({"error": "Unauthorized"}), 401
    seed_mongo()
    
    problem = problems_collection.find_one({"id": str(problem_id)})
    if not problem:
        return jsonify({"error": "Problem not found"}), 404
        
    author = problem.get("author", "rakesh")
    current_user = session['user_id']
    
    if author != current_user and not (current_user == "rakesh" and author == "rakesh"):
        return jsonify({"error": "Forbidden: You do not have permission to delete this problem"}), 403
        
    result = problems_collection.delete_one({"id": str(problem_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Problem not found"}), 404
    # Optionally clean up progress, but not strictly necessary
    user_progress_collection.delete_many({"problem_id": str(problem_id)})
    return jsonify({"ok": True})


@app.get("/api/state")
def get_state():
    if not session.get('user_id'):
        return jsonify({"error": "Unauthorized"}), 401
    state = state_collection.find_one({"user_id": session['user_id']})
    if state:
        state.pop("_id", None)
        state.pop("user_id", None)
    return jsonify(state or {})


@app.patch("/api/state")
def save_state():
    if not session.get('user_id'):
        return jsonify({"error": "Unauthorized"}), 401
    payload = request.get_json() or {}
    # Only allow saving safe keys
    allowed = {"expandedSteps", "expandedLectures", "filters", "scrollY"}
    update = {k: v for k, v in payload.items() if k in allowed}
    state_collection.update_one(
        {"user_id": session['user_id']},
        {"$set": update},
        upsert=True
    )
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
