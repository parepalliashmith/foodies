# Foodies — By Ravi Bakers Inn

Full ordering web app for the "Foodies" outlet. Static site, no build step.

## Features
- 28 menu categories, ~750 items (browse, search, veg-only filter)
- Cart, checkout (COD / demo UPI), order confirmation
- "My Orders" with live status tracker (Placed → Preparing → Ready → Completed)
- Black/red/white theme, PWA-installable

## Local dev
Serve the folder with any static server, e.g.:
```
npx serve -l 5189 .
```

## Deploy
Deployed as a Render Static Site (see `render.yaml`). Push to `main` to redeploy.
