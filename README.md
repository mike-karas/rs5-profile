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
| Readings | Added by hand (`"source": "manual"`) | `data/telemetry.json`, mileage in `data/profile.json` |

Carfax offers no API to owners. Use the Carfax Car Care app to log work you have done so it shows on the report; keep this repo as the source of truth.

### Recalls

The overview queries `api.nhtsa.gov/recalls/recallsByVehicle` using `nhtsa.make`, `nhtsa.model`, and `year` from `data/profile.json`. NHTSA keys the RS 5 as `rs5`. When a dealer completes a campaign, add its number to `nhtsa.completedCampaigns` and it flips from Open to Completed.

### Readings

Each row in `data/telemetry.json` is one reading you took yourself: a date, an odometer value, and optionally oil life, fuel, range, and tire pressures. Rows feed the mileage chart and the "Latest Reading" card. Update `currentMileage` and `mileageAsOf` in `data/profile.json` when you add a newer odometer value.
