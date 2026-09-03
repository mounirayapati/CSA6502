import os
import re
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
_client = Groq(api_key=os.environ["GROQ_API_KEY"])

INJECTION_MODEL = "meta-llama/llama-prompt-guard-2-86m"
TASK_MODEL = "openai/gpt-oss-20b"
SAFETY_MODEL = "openai/gpt-oss-safeguard-20b"


# ── Agent 1: Injection Check (LLM-based) ────────────────────

def injection_check(prompt):
    """Returns True if Prompt Guard injection score >= 0.5."""
    resp = _client.chat.completions.create(
        model=INJECTION_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    try:
        score = float(resp.choices[0].message.content.strip())
        return score >= 0.5
    except ValueError:
        text = resp.choices[0].message.content.strip().upper()
        return "INJECTION" in text


# ── Agent 2: Jailbreak Check (keyword/pattern-based) ────────

_JAILBREAK_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"ignore\s+(all\s+)?prior\s+instructions",
    r"disregard\s+(all\s+)?(previous|prior|above)\s+instructions",
    r"forget\s+(all\s+)?(previous|prior|your)\s+(instructions|rules|guidelines)",
    r"you\s+are\s+now\s+(DAN|an?\s+unrestricted)",
    r"do\s+anything\s+now",
    r"\bDAN\b.*mode",
    r"pretend\s+(you\s+)?(are|have)\s+no\s+(restrictions|rules|guidelines|filters)",
    r"act\s+as\s+(if\s+)?(you\s+)?(have|had)\s+no\s+(restrictions|rules|limits)",
    r"jailbreak",
    r"bypass\s+(your\s+)?(safety|content|ethical)\s+(filter|guard|restriction)",
    r"reveal\s+(your\s+)?system\s+prompt",
    r"show\s+(me\s+)?(your\s+)?(system|hidden)\s+(prompt|instructions)",
    r"override\s+(your\s+)?(safety|content)\s+(settings|filters|rules)",
    r"developer\s+mode",
    r"sudo\s+mode",
]
_JAILBREAK_RE = re.compile("|".join(_JAILBREAK_PATTERNS), re.IGNORECASE)


def jailbreak_check(prompt):
    """Returns True if prompt matches known jailbreak patterns."""
    return bool(_JAILBREAK_RE.search(prompt))


# ── Agent 3: Hallucination Check (stub) ─────────────────────

def hallucination_check(prompt, response):
    """Returns True if response contains unsupported claims. Stub -> False."""
    return False


# ── Agent 4: Safety Check (stub) ────────────────────────────

def safety_check(response):
    """Returns True if response is unsafe. Stub -> False."""
    return False


# ── Agent 5: Sensitive Data Check (regex-based) ─────────────

_SENSITIVE_PATTERNS = {
    "EMAIL": r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    "SSN": r"\b\d{3}-\d{2}-\d{4}\b",
    "PHONE": r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "CREDIT_CARD": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
    "IP_ADDRESS": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
}


def sensitive_data_check(text):
    """Scan text for PII/sensitive data. Returns dict with found, types, masked_text."""
    found_types = []
    masked = text
    for pii_type, pattern in _SENSITIVE_PATTERNS.items():
        matches = re.findall(pattern, masked)
        if matches:
            found_types.append(pii_type)
            masked = re.sub(pattern, f"[REDACTED_{pii_type}]", masked)
    return {
        "found": len(found_types) > 0,
        "types": found_types,
        "masked_text": masked,
    }


# ── Agent 6: Risk Scoring ───────────────────────────────────

_WEIGHTS = {
    "injection": 0.4,
    "jailbreak": 0.4,
    "hallucination": 0.2,
    "sensitive_data": 0.1,
}


def risk_score(flags):
    """Compute weighted risk score (0.0–1.0) from a dict of boolean flags."""
    score = 0.0
    for key, weight in _WEIGHTS.items():
        if flags.get(key, False):
            score += weight
    return round(min(score, 1.0), 2)


def decide_action(score):
    """Return action string based on risk score thresholds."""
    if score >= 0.7:
        return "block"
    elif score >= 0.4:
        return "review"
    else:
        return "allow"
