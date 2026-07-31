// Standalone HTML for a server-side crash. Deliberately has no imports, no
// assets and no client JS: it has to render even when the app bundle is the
// thing that broke.
export function renderErrorPage(basePath = "/"): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Something went wrong — Facebook Lead Finder</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
         background:#f7f8fa; color:#1f2430; padding:24px; }
  @media (prefers-color-scheme: dark) { body { background:#14161c; color:#e8eaf0; } }
  main { max-width:32rem; text-align:center; }
  h1 { font-size:1.25rem; margin:0 0 .5rem; letter-spacing:-.015em; }
  p { margin:0 0 1.5rem; font-size:.9rem; opacity:.75; line-height:1.5; }
  a { display:inline-block; padding:.55rem 1rem; border-radius:.5rem;
      background:#3355cc; color:#fff; text-decoration:none; font-size:.875rem; font-weight:500; }
</style>
</head>
<body>
<main>
  <h1>This page didn&rsquo;t load</h1>
  <p>Something went wrong on our end. The error has been logged. Try again in a moment.</p>
  <a href="${basePath}">Back to the dashboard</a>
</main>
</body>
</html>`;
}
