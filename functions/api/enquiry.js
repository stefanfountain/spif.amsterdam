/**
 * POST /api/enquiry — Vox Arboris acquisition enquiries.
 *
 * Cloudflare Pages Function. Delivers via Resend.
 *
 * Required environment variables (Pages project → Settings → Variables & Secrets):
 *   RESEND_API_KEY   secret  — from resend.com
 *   ENQUIRY_TO       plain   — where enquiries are delivered (an address you read)
 * Optional:
 *   ENQUIRY_FROM     plain   — defaults to "Vox Arboris <enquiries@spif.amsterdam>".
 *                              The domain must be verified in Resend.
 *
 * No secrets live in this repo. If RESEND_API_KEY is absent the endpoint fails
 * loudly with 503 so the form can fall back to the Instagram route.
 */

const MAX = { name: 120, email: 200, org: 160, message: 4000 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const clean = (v, max) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

// Deliberately permissive — rejecting valid addresses is worse than accepting odd ones.
const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

export async function onRequestPost({ request, env }) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "Could not read that submission." }, 400);
  }

  // --- spam gates, both silent -------------------------------------------
  // 1. Honeypot: a field hidden from humans. Anything in it is a bot.
  // 2. Time trap: the form stamps load time; real people take >3s to write.
  if (clean(data.website, 200)) return json({ ok: true });
  const elapsed = Number(data.elapsed);
  if (Number.isFinite(elapsed) && elapsed < 3000) return json({ ok: true });

  const name = clean(data.name, MAX.name);
  const email = clean(data.email, MAX.email);
  const org = clean(data.org, MAX.org);
  const message = clean(data.message, MAX.message);

  const missing = [];
  if (!name) missing.push("name");
  if (!looksLikeEmail(email)) missing.push("email");
  if (!message) missing.push("message");
  if (missing.length) {
    return json(
      { ok: false, error: `Please check: ${missing.join(", ")}.`, fields: missing },
      400
    );
  }

  const apiKey = env.RESEND_API_KEY;
  const to = env.ENQUIRY_TO;
  if (!apiKey || !to) {
    return json(
      {
        ok: false,
        error: "The enquiry form isn't connected yet — please reach out on Instagram.",
      },
      503
    );
  }

  const from = env.ENQUIRY_FROM || "Vox Arboris <enquiries@spif.amsterdam>";
  const country = request.headers.get("cf-ipcountry") || "unknown";
  const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const text = [
    `Vox Arboris enquiry`,
    ``,
    `Name:    ${name}`,
    `Email:   ${email}`,
    org ? `Org:     ${org}` : null,
    `When:    ${when}`,
    `Country: ${country}`,
    ``,
    `---`,
    ``,
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#16211f">
      <p style="font:500 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#78827e;margin:0 0 14px">
        Vox Arboris enquiry
      </p>
      <table style="border-collapse:collapse;margin-bottom:18px">
        <tr><td style="padding:3px 16px 3px 0;color:#78827e">Name</td><td><b>${escapeHtml(name)}</b></td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#78827e">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        ${org ? `<tr><td style="padding:3px 16px 3px 0;color:#78827e">Organisation</td><td>${escapeHtml(org)}</td></tr>` : ""}
        <tr><td style="padding:3px 16px 3px 0;color:#78827e">When</td><td>${when}</td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#78827e">Country</td><td>${escapeHtml(country)}</td></tr>
      </table>
      <div style="border-left:3px solid #E87631;padding:2px 0 2px 16px;white-space:pre-wrap">${escapeHtml(message)}</div>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `Vox Arboris — enquiry from ${name}${org ? ` (${org})` : ""}`,
        text,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("resend failed", res.status, detail);
      return json(
        { ok: false, error: "Something went wrong sending that. Please try Instagram." },
        502
      );
    }
  } catch (err) {
    console.error("resend threw", err);
    return json(
      { ok: false, error: "Something went wrong sending that. Please try Instagram." },
      502
    );
  }

  return json({ ok: true });
}

// Anything other than POST.
export async function onRequest({ request }) {
  if (request.method === "POST") return; // handled above
  return new Response("Method not allowed", {
    status: 405,
    headers: { allow: "POST" },
  });
}
