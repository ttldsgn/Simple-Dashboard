# Cloudflare Rule: Allow Umami Iframe Embedding

Apply this on `analytics.totaldsgn.com` (or `totaldsgn.com` with a hostname filter).

## Modify Response Header Rule

Navigate to: **Rules → Transform Rules → Modify Response Header** for the domain.

### Rule Configuration

| Setting | Value |
|---|---|
| **Rule name** | Allow iframe embedding (Umami share pages) |
| **Custom filter expression** | `(starts_with(http.request.uri.path, "/share/"))` |
| **Then… Remove** | Header name: `X-Frame-Options` |
| **Then… Set static** | Header name: `Content-Security-Policy` |
| | Value: `frame-ancestors 'self' http://localhost:3000 https://your-dashboard-domain.com;` |

### Important Notes

- **Remove** X-Frame-Options (not "Set" or "Add") — this strips the blocking header
- **Set static** (not "Add static") — this replaces any existing CSP rather than appending
- Replace `https://your-dashboard-domain.com` with wherever your dashboard is hosted
- The filter `/share/` scopes this to Umami share links only — admin pages remain protected

### After Applying

Verify with:
```bash
curl -I https://analytics.totaldsgn.com/share/YOUR_SLUG | grep -i "frame-options\|content-security"
```

You should see NO `X-Frame-Options` header and `Content-Security-Policy` should include your dashboard domain.