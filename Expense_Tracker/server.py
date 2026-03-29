import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


HOST = "127.0.0.1"
PORT = 8000
BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "expense_data_store.json"
VALID_SCOPES = {"general", "creditcards", "bills", "savings"}


def default_store():
    return {
        "general": {"transactions": [], "notes": {}},
        "creditcards": {"transactions": [], "notes": {}},
        "bills": {"transactions": [], "notes": {}},
        "savings": {"transactions": [], "notes": {}},
    }


def normalize_transaction(transaction):
    return {
        "id": str(transaction["id"]),
        "date": str(transaction["date"]),
        "description": str(transaction["description"]).strip(),
        "amount": float(transaction["amount"]),
        "type": str(transaction["type"]),
        "category": str(transaction.get("category") or "").strip(),
        "cardType": str(transaction.get("cardType") or "").strip(),
        "month": int(transaction["month"]) if transaction.get("month") is not None else None,
        "half": str(transaction.get("half") or "").strip(),
    }


def normalize_notes(notes):
    normalized = {}
    for month, entries in notes.items():
        if not isinstance(entries, list):
            continue
        normalized[str(month)] = [
            {
                "id": str(entry["id"]),
                "text": str(entry["text"]).strip(),
                "createdAt": str(entry["createdAt"]),
            }
            for entry in entries
        ]
    return normalized


def normalize_bundle(payload):
    transactions = payload.get("transactions", [])
    notes = payload.get("notes", {})

    if not isinstance(transactions, list):
        raise ValueError("transactions must be a list")
    if not isinstance(notes, dict):
        raise ValueError("notes must be an object")

    return {
        "transactions": [normalize_transaction(transaction) for transaction in transactions],
        "notes": normalize_notes(notes),
    }


def ensure_store_file():
    if DATA_PATH.exists():
        return
    DATA_PATH.write_text(json.dumps(default_store(), indent=2), encoding="utf-8")


def load_store():
    ensure_store_file()
    try:
        raw = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        raw = default_store()

    store = default_store()
    if isinstance(raw, dict):
        for scope in VALID_SCOPES:
            value = raw.get(scope)
            if isinstance(value, dict):
                try:
                    store[scope] = normalize_bundle(value)
                except (KeyError, TypeError, ValueError):
                    store[scope] = {"transactions": [], "notes": {}}
    return store


def save_store(store):
    DATA_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def load_page_data(scope):
    store = load_store()
    return store.get(scope, {"transactions": [], "notes": {}})


def replace_page_data(scope, payload):
    store = load_store()
    store[scope] = normalize_bundle(payload)
    save_store(store)


def clear_page_data(scope):
    store = load_store()
    store[scope] = {"transactions": [], "notes": {}}
    save_store(store)


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
    ensure_store_file()
    server = ThreadingHTTPServer((HOST, PORT), ExpenseTrackerHandler)
    print(f"Expense Tracker available at http://{HOST}:{PORT}")
    print(f"JSON data file: {DATA_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
