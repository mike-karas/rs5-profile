# RS5 Living Record

A static dashboard for one car: ownership timeline, service log, mods, gallery, and documents. Everything renders from the JSON files in `data/`, so the site works on GitHub Pages with no build step.

Run locally:

```bash
python3 -m http.server 8080
```

then open http://localhost:8080.

## Data sources

| Source | How it gets in | Where it lands |
| --- | --- | --- |
| Carfax | Hand-transcribed from the report (`"source": "carfax"`) | `data/maintenance.json`, `data/ownership.json` |
| Your own records | Edited by hand (`"source": "owner"`) | `data/maintenance.json`, `data/mods.json` |
| NHTSA recalls | Fetched in the browser on every page load, no key needed | Overview tab, "Safety Recalls" card |
| NHTSA VIN decode | Fetched in the browser, no key needed | Overview tab, extra Quick Facts |
| Smartcar | Weekly GitHub Action reads the car through your myAudi account | `data/telemetry.json`, mileage in `data/profile.json` |

Carfax offers no API to owners. Use the Carfax Car Care app to log work you have done so it shows on the report; keep this repo as the source of truth.

### Recalls

The overview queries `api.nhtsa.gov/recalls/recallsByVehicle` using `nhtsa.make`, `nhtsa.model`, and `year` from `data/profile.json`. NHTSA keys the RS 5 as `rs5`. When a dealer completes a campaign, add its number to `nhtsa.completedCampaigns` and it flips from Open to Completed.

### Smartcar telemetry

Smartcar's free tier allows one real vehicle. Setup once:

1. Create an application at https://dashboard.smartcar.com and add `http://localhost:8000/callback` as a redirect URI.
2. Run the auth helper and sign in with the myAudi account the car is registered to:

   ```bash
   SMARTCAR_CLIENT_ID=... SMARTCAR_CLIENT_SECRET=... node scripts/smartcar-auth.mjs
   ```

3. Add repository secrets: `SMARTCAR_CLIENT_ID`, `SMARTCAR_CLIENT_SECRET`, `SMARTCAR_REFRESH_TOKEN`, and optionally `SMARTCAR_VEHICLE_ID`.
4. Smartcar issues a new refresh token on every refresh and the old one stops working, so the workflow writes the new one back. Create a fine-grained personal access token scoped to this repo with **Secrets: Read and write**, and store it as `SMARTCAR_SECRETS_PAT`.
5. Trigger the workflow by hand from the Actions tab to confirm the first row lands.

The workflow runs every Monday, appends one row with odometer, oil life, tire pressures, and fuel, and updates `currentMileage` when the car has moved. Endpoints the car does not support are logged and skipped. To try it locally:

```bash
SMARTCAR_CLIENT_ID=... SMARTCAR_CLIENT_SECRET=... SMARTCAR_REFRESH_TOKEN=... node scripts/fetch-telemetry.mjs
```

Rows with `"source": "manual"` can be added by hand for readings you took yourself.
