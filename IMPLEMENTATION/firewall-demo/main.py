import os
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from starlette.middleware.sessions import SessionMiddleware
from authlib.integrations.starlette_client import OAuth
import hashlib
import secrets

from guards import (injection_check, jailbreak_check, hallucination_check,
                    safety_check, sensitive_data_check, risk_score, decide_action)
from db import (init_db, migrate, log_request, get_recent,
                create_user, get_user_by_email, count_users)


load_dotenv()

@asynccontextmanager
async def lifespan(app):
    init_db()
    migrate()
    yield

app = FastAPI(title="Mini LLM Firewall", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=os.environ["SESSION_SECRET"],
)

oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

app.mount("/static", StaticFiles(directory="static"), name="static")

_client = Groq(api_key=os.environ["GROQ_API_KEY"])
TASK_MODEL = "openai/gpt-oss-20b"


# ── Auth helpers ─────────────────────────────────────────────

def _assign_role():
    """First user ever -> admin, everyone else -> user."""
    return "admin" if count_users() == 0 else "user"


def _require_auth(request):
    """Return user dict from session or None."""
    return request.session.get("user")


def _require_admin(request):
    """Return user dict if admin, else None."""
    user = _require_auth(request)
    if user and user.get("role") == "admin":
        return user
    return None


# ── Static / landing ────────────────────────────────────────

@app.get("/")
async def index():
    return FileResponse("static/index.html")


# ── OAuth routes ─────────────────────────────────────────────

@app.get("/login")
async def login(request: Request):
    redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/auth/callback")
async def auth_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    userinfo = dict(token["userinfo"])
    email = userinfo["email"]
    name = userinfo.get("name", "")

    existing = get_user_by_email(email)
    if not existing:
        role = _assign_role()
        create_user(email=email, password_hash=None,
                    name=name, provider="google", role=role)
        existing = get_user_by_email(email)

    request.session["user"] = {
        "email": email,
        "name": existing["name"],
        "role": existing["role"],
    }
    return RedirectResponse("/")


# ── Local auth routes ────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str


@app.post("/api/signup")
async def signup(req: SignupRequest, request: Request):
    if get_user_by_email(req.email):
        return JSONResponse({"error": "Email already registered"}, status_code=409)

    role = _assign_role()
    salt = secrets.token_hex(16)
    pw_hash = salt + ":" + hashlib.sha256((salt + req.password).encode()).hexdigest()
    create_user(email=req.email, password_hash=pw_hash,
                name=req.name, provider="local", role=role)

    request.session["user"] = {
        "email": req.email,
        "name": req.name,
        "role": role,
    }
    return JSONResponse({"ok": True, "role": role})


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/api/login")
async def api_login(req: LoginRequest, request: Request):
    user = get_user_by_email(req.email)
    if not user or not user["password_hash"]:
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)
    stored = user["password_hash"]
    salt, hashed = stored.split(":", 1)
    if hashlib.sha256((salt + req.password).encode()).hexdigest() != hashed:
        return JSONResponse({"error": "Invalid credentials"}, status_code=401)

    request.session["user"] = {
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
    }
    return JSONResponse({"ok": True, "role": user["role"]})


@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/")


@app.get("/api/me")
async def me(request: Request):
    user = request.session.get("user")
    return JSONResponse({
        "logged_in": bool(user),
        "email": user["email"] if user else None,
        "name": user.get("name") if user else None,
        "role": user.get("role") if user else None,
    })


# ── Logs (admin-gated) ──────────────────────────────────────

@app.get("/api/logs")
async def api_logs(request: Request):
    if not _require_admin(request):
        return JSONResponse({"error": "admin access required"}, status_code=403)
    return JSONResponse(get_recent())


# ── Model Evaluation (admin-gated) ──────────────────────────

@app.get("/api/eval")
async def api_eval(request: Request):
    if not _require_admin(request):
        return JSONResponse({"error": "admin access required"}, status_code=403)

    eval_path = os.path.join(os.path.dirname(__file__), "eval_data.json")
    with open(eval_path, "r") as f:
        dataset = json.load(f)

    tp = fp = tn = fn = 0
    details = []
    for entry in dataset:
        prompt = entry["prompt"]
        label = entry["label"]  # True = is injection/jailbreak

        # Run both checks — predicted positive if either fires
        inj = injection_check(prompt)
        jb = jailbreak_check(prompt)
        predicted = inj or jb

        if predicted and label:
            tp += 1
        elif predicted and not label:
            fp += 1
        elif not predicted and not label:
            tn += 1
        else:
            fn += 1

        details.append({
            "prompt": prompt,
            "label": label,
            "predicted": predicted,
            "injection": inj,
            "jailbreak": jb,
        })

    total = len(dataset)
    accuracy = round((tp + tn) / total, 4) if total else 0
    precision = round(tp / (tp + fp), 4) if (tp + fp) else 0
    recall = round(tp / (tp + fn), 4) if (tp + fn) else 0

    return JSONResponse({
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "total": total,
        "details": details,
    })


# ── Chat — Full 8-Stage Pipeline ────────────────────────────

class ChatRequest(BaseModel):
    prompt: str


@app.post("/chat")
async def chat(req: ChatRequest, request: Request):
    if not _require_auth(request):
        return JSONResponse({"error": "not authenticated"}, status_code=401)

    prompt = req.prompt.strip()
    trace = []
    flags = {
        "injection": False,
        "jailbreak": False,
        "hallucination": False,
        "sensitive_data": False,
    }

    # ── Stage 1: Gateway — validate prompt ───────────────────
    if not prompt or len(prompt) > 4000:
        trace.append({"stage": "gateway", "status": "fail"})
        return JSONResponse({
            "response": None,
            "trace": trace,
            "flags": flags,
            "risk_score": 0,
            "action": "block",
        }, status_code=400)
    trace.append({"stage": "gateway", "status": "pass"})

    # ── Stage 2: Injection Check ─────────────────────────────
    is_injection = injection_check(prompt)
    flags["injection"] = is_injection
    trace.append({"stage": "injection_check",
                  "status": "fail" if is_injection else "pass"})

    # ── Stage 3: Jailbreak Check ─────────────────────────────
    is_jailbreak = jailbreak_check(prompt)
    flags["jailbreak"] = is_jailbreak
    trace.append({"stage": "jailbreak_check",
                  "status": "fail" if is_jailbreak else "pass"})

    # If either injection or jailbreak fired → still call LLM to show
    # what it would have said, but block the response
    if is_injection or is_jailbreak:
        # Call LLM anyway so user can see raw (unfiltered) response
        raw_response = None
        try:
            llm_resp = _client.chat.completions.create(
                model=TASK_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
            raw_response = llm_resp.choices[0].message.content
            trace.append({"stage": "llm_call", "status": "pass"})
        except Exception:
            trace.append({"stage": "llm_call", "status": "fail"})

        score = risk_score(flags)
        action = "block"
        trace.append({"stage": "risk_scoring", "status": "fail"})

        log_request(prompt, raw_response or "", int(is_injection), False, False,
                    action, flags=flags, risk_score=score, action=action)
        trace.append({"stage": "audit_log", "status": "pass"})

        return JSONResponse({
            "response": None,
            "raw_response": raw_response,
            "trace": trace,
            "flags": flags,
            "risk_score": score,
            "action": action,
        })

    # ── Stage 4: Enterprise LLM ─────────────────────────────
    try:
        llm_resp = _client.chat.completions.create(
            model=TASK_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        response = llm_resp.choices[0].message.content
        trace.append({"stage": "llm_call", "status": "pass"})
    except Exception as e:
        trace.append({"stage": "llm_call", "status": "fail"})
        return JSONResponse({
            "response": None,
            "trace": trace,
            "flags": flags,
            "risk_score": 0,
            "action": "block",
            "error": str(e),
        }, status_code=502)

    # ── Stage 5: Hallucination Check ─────────────────────────
    is_hallucination = hallucination_check(prompt, response)
    flags["hallucination"] = is_hallucination
    trace.append({"stage": "hallucination_check",
                  "status": "fail" if is_hallucination else "pass"})

    # ── Stage 6: Sensitive Data Check ────────────────────────
    sd_result = sensitive_data_check(response)
    flags["sensitive_data"] = sd_result["found"]
    final_response = sd_result["masked_text"]  # use masked text as final
    trace.append({"stage": "sensitive_data_check",
                  "status": "fail" if sd_result["found"] else "pass"})

    # ── Stage 7: Risk Scoring + Action Decision ──────────────
    score = risk_score(flags)
    action = decide_action(score)
    if action == "block":
        final_response = None
    trace.append({"stage": "risk_scoring",
                  "status": "pass" if action == "allow" else "fail"})

    # ── Stage 8: Audit Logging ───────────────────────────────
    log_request(
        prompt,
        final_response or "",
        int(is_injection),
        int(is_hallucination),
        int(sd_result["found"]),
        action,
        flags=flags,
        risk_score=score,
        action=action,
    )
    trace.append({"stage": "audit_log", "status": "pass"})

    return JSONResponse({
        "response": final_response,
        "trace": trace,
        "flags": flags,
        "risk_score": score,
        "action": action,
    })
