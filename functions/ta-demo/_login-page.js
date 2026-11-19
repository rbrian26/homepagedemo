// Branded sign-in page served by _middleware.js when there is no valid session.
export const loginPage = (msg = '') => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Threat Assessment: Full Course | Blue Seat Studios</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--blue:#096f9c;--blue-d:#064e6e;--orange:#f97c53;--ink:#12303d;--mist:#f4f9fc}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Quicksand,system-ui,sans-serif;color:var(--ink);background:#f6f9fb}
.card{background:#fff;border:1px solid #cfe3ec;border-top:4px solid var(--blue);border-radius:16px;max-width:440px;width:100%;padding:36px}
.logo{margin-bottom:20px}
.logo img{height:64px;display:block}
h1{font-size:26px;line-height:1.15;margin:0 0 8px;font-weight:700;color:var(--blue)}
p{margin:0 0 20px;line-height:1.5;font-weight:500}
label{display:block;font-weight:700;font-size:14px;margin:0 0 6px}
input{width:100%;font:inherit;font-weight:600;padding:14px 16px;border:2px solid #d3e3ec;border-radius:12px;margin-bottom:14px;color:var(--ink)}
input:focus{outline:none;border-color:var(--blue)}
button{width:100%;font:inherit;font-weight:700;font-size:16px;padding:15px;border:0;border-radius:999px;background:var(--orange);color:#fff;cursor:pointer}
button:hover{filter:brightness(.95)}
.err{background:#fde8e1;color:#a3340f;padding:10px 14px;border-radius:10px;margin-bottom:16px;font-weight:600;font-size:14px}
.ok{background:#e1f4ea;color:#14623a;padding:10px 14px;border-radius:10px;margin-bottom:16px;font-weight:600;font-size:14px}
.link{background:none;color:var(--blue);padding:0;width:auto;font-size:14px;text-decoration:underline;margin-top:18px;display:block}
#req{display:none;margin-top:20px;padding-top:20px;border-top:2px solid var(--mist)}
.hp{position:absolute;left:-9999px}
</style></head><body>
<main class="card">
  <div class="logo"><img src="/ta-demo/logo.png" alt="Blue Seat Studios"></div>
  <h1>Threat Assessment: Full Course</h1>
  <p>A private preview for higher ed behavioral threat management teams. Enter the password we sent you.</p>
  ${msg}
  <form method="post" action="/ta-demo/_login">
    <label for="pw">Your password</label>
    <input id="pw" name="pw" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">Enter</button>
  </form>
  <button type="button" class="link" onclick="document.getElementById('req').style.display='block';this.style.display='none'">Need access for a colleague? Request it</button>
  <form id="req" method="post" action="/ta-demo/_request">
    <label for="n">Name</label><input id="n" name="name" required maxlength="120" autocomplete="name">
    <label for="e">Email</label><input id="e" name="email" type="email" required maxlength="200" autocomplete="email">
    <label for="o">Organization</label><input id="o" name="org" required maxlength="160" autocomplete="organization">
    <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit">Request access</button>
  </form>
</main></body></html>`;
