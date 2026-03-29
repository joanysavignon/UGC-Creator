import json
import sqlite3
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


HOST = "127.0.0.1"
PORT = 8000
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "expense_tracker.db"
VALID_SCOPES = {"general", "creditcards", "bills", "savings"}


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_connection() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode=WAL;

            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT NOT NULL,
                scope TEXT NOT NULL,
                date TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                type TEXT NOT NULL,
                category TEXT,
                card_type TEXT,
                month INTEGER,
                half TEXT,
                PRIMARY KEY (scope, id)
            );

            CREATE INDEX IF NOT EXISTS idx_transactions_scope
                ON transactions(scope);

            CREATE TABLE IF NOT EXISTS notes (
                scope TEXT NOT NULL,
                month TEXT NOT NULL,
                note_id TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (scope, month, note_id)
            );
            """
        )


def normalize_transaction(scope, transaction):
    return {
        "id": str(transaction["id"]),
        "scope": scope,
        "date": str(transaction["date"]),
        "description": str(transaction["description"]).strip(),
        "amount": float(transaction["amount"]),
        "type": str(transaction["type"]),
        "category": str(transaction.get("category") or "").strip(),
        "card_type": str(transaction.get("cardType") or "").strip(),
        "month": int(transaction["month"]) if transaction.get("month") is not None else None,
        "half": str(transaction.get("half") or "").strip(),
    }


def normalize_notes(scope, notes):
    normalized = []
    for month, entries in notes.items():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            normalized.append(
                {
                    "scope": scope,
                    "month": str(month),
                    "note_id": str(entry["id"]),
                    "text": str(entry["text"]).strip(),
                    "created_at": str(entry["createdAt"]),
                }
            )
    return normalized


def load_page_data(scope):
    with get_connection() as connection:
        transaction_rows = connection.execute(
            """
            SELECT id, date, description, amount, type, category, card_type, month, half
            FROM transactions
            WHERE scope = ?
            ORDER BY datetime(date) DESC, id DESC
            """,
            (scope,),
        ).fetchall()

        note_rows = connection.execute(
            """
            SELECT month, note_id, text, created_at
            FROM notes
            WHERE scope = ?
            ORDER BY created_at DESC, note_id DESC
            """,
            (scope,),
        ).fetchall()

    notes = {}
    for row in note_rows:
        notes.setdefault(row["month"], []).append(
            {
                "id": row["note_id"],
                "text": row["text"],
                "createdAt": row["created_at"],
            }
        )

    transactions = [
        {
            "id": row["id"],
            "date": row["date"],
            "description": row["description"],
            "amount": row["amount"],
            "type": row["type"],
            "category": row["category"],
            "cardType": row["card_type"],
            "month": row["month"],
            "half": row["half"],
        }
        for row in transaction_rows
    ]

    return {"transactions": transactions, "notes": notes}


def replace_page_data(scope, payload):
    transactions = payload.get("transactions", [])
    notes = payload.get("notes", {})

    if not isinstance(transactions, list):
        raise ValueError("transactions must be a list")
    if not isinstance(notes, dict):
        raise ValueError("notes must be an object")

    normalized_transactions = [normalize_transaction(scope, transaction) for transaction in transactions]
    normalized_notes = normalize_notes(scope, notes)

    with get_connection() as connection:
        connection.execute("BEGIN")
        connection.execute("DELETE FROM transactions WHERE scope = ?", (scope,))
        connection.execute("DELETE FROM notes WHERE scope = ?", (scope,))

        connection.executemany(
            """
            INSERT INTO transactions (id, scope, date, description, amount, type, category, card_type, month, half)
            VALUES (:id, :scope, :date, :description, :amount, :type, :category, :card_type, :month, :half)
            """,
            normalized_transactions,
        )

        connection.executemany(
            """
            INSERT INTO notes (scope, month, note_id, text, created_at)
            VALUES (:scope, :month, :note_id, :text, :created_at)
            """,
            normalized_notes,
        )
        connection.commit()


def clear_page_data(scope):
    with get_connection() as connection:
        connection.execute("DELETE FROM transactions WHERE scope = ?", (scope,))
        connection.execute("DELETE FROM notes WHERE scope = ?", (scope,))
        connection.commit()


class ExpenseTrackerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return

        if parsed.path == "/api/page-data":
            scope = self._get_scope(parsed)
            if not scope:
                return
            self._send_json(HTTPStatus.OK, load_page_data(scope))
            return

        super().do_GET()

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/page-data":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        scope = self._get_scope(parsed)
        if not scope:
            return

        payload = self._read_json_body()
        if payload is None:
            return

        try:
            replace_page_data(scope, payload)
        except (KeyError, TypeError, ValueError) as error:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        self._send_json(HTTPStatus.OK, {"status": "saved"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/page-data":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        scope = self._get_scope(parsed)
        if not scope:
            return

        clear_page_data(scope)
        self._send_json(HTTPStatus.OK, {"status": "deleted"})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _get_scope(self, parsed_url):
        query = parse_qs(parsed_url.query)
        scope = query.get("scope", ["general"])[0]
        if scope not in VALID_SCOPES:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid scope"})
            return None
        return scope

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            return json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
            return None

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), ExpenseTrackerHandler)
    print(f"Expense Tracker available at http://{HOST}:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
