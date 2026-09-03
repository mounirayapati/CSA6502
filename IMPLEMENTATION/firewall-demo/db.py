import sqlite3
import json
from datetime import datetime

DB_PATH = "firewall.db"


def get_conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    con = get_conn()
    con.execute("""
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            prompt TEXT,
            response TEXT,
            injection_flag INTEGER,
            hallucination_flag INTEGER,
            safety_flag INTEGER,
            final_action TEXT
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT,
            name TEXT,
            provider TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    con.commit()
    con.close()


def migrate(conn=None):
    """Add new columns to existing tables if they don't exist yet."""
    own_conn = conn is None
    if own_conn:
        conn = get_conn()

    # --- requests table: add risk_score, action, flags ---
    cursor = conn.execute("PRAGMA table_info(requests)")
    existing_cols = {row["name"] for row in cursor.fetchall()}

    if "risk_score" not in existing_cols:
        conn.execute("ALTER TABLE requests ADD COLUMN risk_score REAL DEFAULT 0.0")
    if "action" not in existing_cols:
        conn.execute("ALTER TABLE requests ADD COLUMN action TEXT DEFAULT 'allow'")
    if "flags" not in existing_cols:
        conn.execute("ALTER TABLE requests ADD COLUMN flags TEXT DEFAULT '{}'")

    # --- users table: add role ---
    cursor = conn.execute("PRAGMA table_info(users)")
    existing_cols = {row["name"] for row in cursor.fetchall()}

    if "role" not in existing_cols:
        conn.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")

    conn.commit()
    if own_conn:
        conn.close()


def log_request(prompt, response, injection_flag, hallucination_flag,
                safety_flag, final_action, flags=None, risk_score=0.0,
                action="allow"):
    con = get_conn()
    flags_str = json.dumps(flags) if flags else "{}"
    con.execute(
        """INSERT INTO requests
           (timestamp, prompt, response, injection_flag,
            hallucination_flag, safety_flag, final_action,
            risk_score, action, flags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (datetime.utcnow().isoformat(), prompt, response,
         int(injection_flag), int(hallucination_flag),
         int(safety_flag), final_action,
         risk_score, action, flags_str),
    )
    con.commit()
    con.close()


def get_recent(limit=50):
    con = get_conn()
    rows = con.execute(
        "SELECT * FROM requests ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def count_users():
    """Return the total number of rows in the users table."""
    con = get_conn()
    count = con.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    con.close()
    return count


def create_user(email, password_hash, name, provider, role="user"):
    con = get_conn()
    con.execute(
        "INSERT INTO users (email, password_hash, name, provider, created_at, role) "
        "VALUES (?, ?, ?, ?, datetime('now'), ?)",
        (email, password_hash, name, provider, role),
    )
    con.commit()
    con.close()


def get_user_by_email(email):
    con = get_conn()
    row = con.execute(
        "SELECT * FROM users WHERE email = ?", (email,)
    ).fetchone()
    con.close()
    return dict(row) if row else None
