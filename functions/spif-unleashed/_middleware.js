/**
 * /spif-unleashed/* — password gate.
 *
 * Cloudflare Pages Function (middleware). Everything under /spif-unleashed/ is
 * served only to a browser that carries a valid cookie; without one, every
 * request gets the login form instead. The check runs at the edge on every
 * request, before the static asset is touched, so the content never leaves
 * Cloudflare unauthenticated and is never cached publicly.
 *
 * Required environment variable (Pages project → Settings → Variables & Secrets):
 *   UNLEASHED_PASSWORD   secret — the shared passphrase
 *
 * Fails closed: with the secret absent the folder answers 503, never the page.
 *
 * The content itself (spif-unleashed/index.html) is gitignored — this repo is
 * public on GitHub — and is copied in at deploy time from elsewhere. Only this
 * gate is committed.
 */

const COOKIE = "spif_unleashed";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SCOPE = "/spif-unleashed";
const TOKEN_LABEL = "spif-unleashed:v1";

const enc = new TextEncoder();

const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

// Token = HMAC-SHA256(key = passphrase, msg = label). Can't be forged without
// the passphrase; changing the passphrase invalidates every cookie at once.
async function tokenFor(password) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(TOKEN_LABEL)));
}

// Compare via digests so length and content leak nothing through timing.
async function same(a, b) {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(da), y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function cookieValue(request) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return null;
}

const setCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=${SCOPE}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "referrer-policy": "no-referrer",
};

function withPrivateHeaders(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(PRIVATE_HEADERS)) out.headers.set(k, v);
  return out;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function loginPage({ error = "", action }) {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Spif Unleashed</title>
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; min-height: 100%; }
  body {
    display: grid; place-items: center; min-height: 100vh; padding: 24px; box-sizing: border-box;
    background: #f5f1ea; color: #16211f;
    font: 17px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Source Sans 3", sans-serif;
  }
  form {
    width: 100%; max-width: 380px; background: #fff; border-radius: 14px;
    padding: 32px 28px 28px; box-shadow: 0 10px 40px rgba(22,33,31,.08);
  }
  .eyebrow {
    font: 500 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .14em; text-transform: uppercase; color: #78827e; margin: 0 0 14px;
  }
  h1 { font-size: 26px; line-height: 1.15; margin: 0 0 8px; letter-spacing: -.01em; }
  p { margin: 0 0 20px; color: #4a5552; }
  label { display: block; font-size: 14px; color: #4a5552; margin-bottom: 6px; }
  input[type=password] {
    width: 100%; box-sizing: border-box; font: inherit; padding: 11px 12px;
    border: 1.5px solid #d8d3c9; border-radius: 8px; background: #fbfaf7; color: inherit;
  }
  input[type=password]:focus { outline: none; border-color: #E87631; box-shadow: 0 0 0 3px rgba(232,118,49,.18); }
  button {
    margin-top: 16px; width: 100%; font: 600 16px/1 inherit; padding: 13px;
    border: 0; border-radius: 8px; background: #16211f; color: #fff; cursor: pointer;
  }
  button:hover { background: #E87631; }
  .error { color: #b3361b; font-size: 14px; margin: 10px 0 0; }
</style>
</head>
<body>
<form method="post" action="${escapeHtml(action)}" autocomplete="off">
  <p class="eyebrow">Privé</p>
  <h1>Spif Unleashed</h1>
  <p>Aantekeningen van vier dagen Keulen. Voor wie het wachtwoord heeft.</p>
  <label for="pw">Wachtwoord</label>
  <input id="pw" name="password" type="password" required autofocus autocomplete="current-password">
  <input type="hidden" name="hash" id="hash" value="">
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <button type="submit">Openen</button>
</form>
<script>document.getElementById('hash').value = location.hash;</script>
</body>
</html>`;
}

const html = (body, status = 200, extra = {}) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...PRIVATE_HEADERS,
      ...extra,
    },
  });

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const secret = env.UNLEASHED_PASSWORD;

  if (!secret) {
    return html("<h1>Niet beschikbaar</h1><p>Deze pagina is nog niet ingesteld.</p>", 503);
  }

  // /spif-unleashed/logout — forget this browser.
  if (url.pathname === `${SCOPE}/logout`) {
    return new Response(null, {
      status: 303,
      headers: { location: `${SCOPE}/`, "set-cookie": setCookie("", 0), ...PRIVATE_HEADERS },
    });
  }

  const expected = await tokenFor(secret);

  if (request.method === "POST") {
    let form;
    try {
      form = await request.formData();
    } catch {
      return html(loginPage({ error: "Dat formulier kon ik niet lezen.", action: url.pathname }), 400);
    }
    const attempt = String(form.get("password") || "");
    if (attempt && (await same(attempt, secret))) {
      // Carry a deep link (#p39 etc.) across the redirect; only a plain fragment.
      const hash = String(form.get("hash") || "");
      const frag = /^#[A-Za-z0-9_-]{1,64}$/.test(hash) ? hash : "";
      return new Response(null, {
        status: 303,
        headers: {
          location: url.pathname + frag,
          "set-cookie": setCookie(expected, MAX_AGE),
          ...PRIVATE_HEADERS,
        },
      });
    }
    return html(loginPage({ error: "Dat is hem niet. Probeer het nog eens.", action: url.pathname }), 401);
  }

  const have = cookieValue(request);
  if (have && (await same(have, expected))) {
    return withPrivateHeaders(await next());
  }

  return html(loginPage({ action: url.pathname }), 401);
}
