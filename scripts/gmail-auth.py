#!/usr/bin/env python3
"""One-time Gmail OAuth (installed-app loopback flow).

NEXUS PC (default): scope gmail.readonly, reads gmail_client_id / gmail_client_secret from the
GNOME keyring and stores the refresh token there as gmail_refresh_token.
--relay: same client, but a separate refresh token with scope gmail.labels (label counts only, no access to messages); client id, secret and refresh token
go straight to `wrangler secret put` on stdin, nothing is stored locally.
No secret is printed. Standard library only.
"""
import base64, hashlib, http.server, json, os, secrets, subprocess, sys, urllib.error, urllib.parse, urllib.request, webbrowser

RELAY = "--relay" in sys.argv[1:]
SCOPE = "https://www.googleapis.com/auth/gmail." + ("labels" if RELAY else "readonly")
RELAY_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "relay")


def lookup(key):
    r = subprocess.run(["secret-tool", "lookup", "service", "nexus", "key", key], capture_output=True, text=True)
    if r.returncode or not r.stdout:
        sys.exit(f"{key} absent du trousseau : lance scripts/setup-secrets.sh")
    return r.stdout.strip()


client_id, client_secret = lookup("gmail_client_id"), lookup("gmail_client_secret")
state = secrets.token_urlsafe(16)
verifier = secrets.token_urlsafe(64)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
result = {}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if q.get("state", [""])[0] != state:  # CSRF guard
            self.send_response(400); self.end_headers(); return
        result.update({k: v[0] for k, v in q.items()})
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("NEXUS : autorisation reçue, tu peux fermer cet onglet.".encode())

    def log_message(self, *a):  # keep the code out of the terminal
        pass


srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
redirect = f"http://127.0.0.1:{srv.server_port}"
url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
    "client_id": client_id, "redirect_uri": redirect, "response_type": "code", "scope": SCOPE,
    "access_type": "offline", "prompt": "consent", "state": state,
    "code_challenge": challenge, "code_challenge_method": "S256",
})
print("Ouverture du navigateur pour l'autorisation Gmail (" + ("libellés seulement" if RELAY else "lecture seule") + ")…")
webbrowser.open(url)
while "code" not in result and "error" not in result:
    srv.handle_request()
if "error" in result:
    sys.exit(f"Autorisation refusée : {result['error']}")

body = urllib.parse.urlencode({
    "code": result["code"], "client_id": client_id, "client_secret": client_secret,
    "redirect_uri": redirect, "grant_type": "authorization_code", "code_verifier": verifier,
}).encode()
try:
    tok = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", body))
except urllib.error.HTTPError as e:
    sys.exit(f"Échange du code refusé (HTTP {e.code})")
if "refresh_token" not in tok:
    sys.exit("Pas de refresh token reçu : révoque l'accès NEXUS dans ton compte Google puis relance.")
if RELAY:
    for name, value in (("GMAIL_CLIENT_ID", client_id), ("GMAIL_CLIENT_SECRET", client_secret),
                        ("GMAIL_REFRESH_TOKEN", tok["refresh_token"])):
        r = subprocess.run(["npx", "-y", "wrangler@4", "secret", "put", name], cwd=RELAY_DIR, input=value,
                           text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode:
            sys.exit(f"{name} : ÉCHEC (wrangler login ?). Relance scripts/gmail-auth.py --relay")
        print(f"{name} : envoyé au relais")
else:
    subprocess.run(["secret-tool", "store", "--label=nexus gmail_refresh_token", "service", "nexus", "key", "gmail_refresh_token"],
                   input=tok["refresh_token"], text=True, check=True)
    print("gmail_refresh_token : enregistré dans le trousseau")
