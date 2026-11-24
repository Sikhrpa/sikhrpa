/**
 * SikhRPA Treasury Google Apps Script — POST Auth & Session Token Upgrade Reference
 *
 * Add these action branches inside your existing doPost(e) handler in Google Apps Script
 * so admin.html authenticates and fetches submissions via POST body (never URL query strings)
 * and optionally issues short-lived HMAC-signed session tokens.
 *
 * Setup:
 *   1. In Apps Script -> Project Settings -> Script Properties, set:
 *      SESSION_SECRET = <generate a 32+ byte random hex string>
 *   2. Add the handlers below inside doPost(e) right after parsing `const data = JSON.parse(e.postData.contents);`
 *   3. Deploy a new version of the Web App (admin.html automatically prefers POST and falls back to GET until deployed).
 */

function createSessionToken_(username) {
  const secret = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (!secret) return null;
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000; // 2-hour TTL
  const payload = `${username}|${expiresAt}`;
  const sigBytes = Utilities.computeHmacSha256Signature(payload, secret);
  const sig = Utilities.base64EncodeWebSafe(sigBytes);
  return `${payload}|${sig}`;
}

function verifyOfficerAuth_(data) {
  const secret = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (secret && data.session_token) {
    const parts = String(data.session_token).split('|');
    if (parts.length === 3) {
      const [user, expStr, sig] = parts;
      const exp = Number(expStr);
      if (user === data.username && Number.isFinite(exp) && Date.now() < exp) {
        const expected = Utilities.base64EncodeWebSafe(
          Utilities.computeHmacSha256Signature(`${user}|${expStr}`, secret)
        );
        if (sig === expected) return true;
      }
    }
  }
  // Fallback to existing officer password verification helper
  return verifyOfficerCredentials_(data.username, data.password);
}

/*
// Inside doPost(e):
if (data.action === 'login') {
  const officer = verifyOfficerCredentials_(data.username, data.password);
  if (!officer) {
    return jsonResponse_({ status: 'error', message: 'Invalid officer credentials.' });
  }
  return jsonResponse_({
    status: 'success',
    officer: officer,
    session_token: createSessionToken_(data.username)
  });
}

if (data.action === 'get_requests') {
  if (!verifyOfficerAuth_(data)) {
    return jsonResponse_({ status: 'error', message: 'Unauthorized.' });
  }
  return jsonResponse_({
    status: 'success',
    data: getAllTreasurySubmissions_()
  });
}
*/
