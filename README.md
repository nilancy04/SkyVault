# ☁️ SkyVault

**Secure cloud file storage with real-time resource monitoring, cost estimation, and a full activity audit log.**

SkyVault is a browser-based storage platform built on [Supabase](https://supabase.com). Users sign in, upload files to a private bucket protected by Row Level Security, and track exactly how much storage, bandwidth, and money they are using, all from a single dashboard.

🔗 **Live demo:** [skyvault-alpha.vercel.app](https://skyvault-alpha.vercel.app)

---

## ✨ Features

### File storage
- Email/password authentication (sign in / create account) via Supabase Auth
- Drag-and-drop upload anywhere on the page, plus multi-file picker
- Private bucket with per-user access enforced by PostgreSQL Row Level Security
- Browse files in **grid** or **table** view
- Search by name, filter by category, and sort six ways

| Category filters | Sort options |
|---|---|
| All, Images, Documents, Audio/Video, Archives, Code, Other | Newest, Oldest, Name A→Z, Name Z→A, Largest, Smallest |

### Resource monitoring
- **Dashboard** with live metrics: total storage, file count, operation success rate, and average upload/download latency
- **Storage breakdown** doughnut chart by file type
- **Operations & reliability** bar chart (succeeded vs failed)
- **Storage growth** line chart (cumulative usage over time)
- Latency tracking for every upload and download

### Cost estimation
- Transparent, real-time monthly cost calculation with a per-line breakdown table
- Default rates: **$0.021 / GB / month** storage and **$0.005 / 1,000 requests**; egress modeled with the first 5 GB free
- Rates are editable in the UI, and the estimate recalculates instantly

### Quota & alerts
- Configurable storage warning threshold (default **500 MB**)
- Warning banner and top-bar pill when usage approaches the threshold
- Sidebar storage gauge showing used vs. limit

### Audit & reliability
- **Activity Audit Log** of file operations, stored in `public.file_activity`
- Live Supabase connection badge, connection diagnostics, and a "Retry Sync" action
- Toast notifications for every operation

### UI
- Dark glassmorphism theme, responsive layout with a collapsible mobile sidebar
- Accessible markup (ARIA roles, live regions, keyboard-friendly controls)

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (no build step) |
| Backend / Auth / Storage | [Supabase](https://supabase.com): Auth, PostgreSQL, Storage |
| Charts | [Chart.js](https://www.chartjs.org/) (CDN) |
| Client SDK | `@supabase/supabase-js` v2 (CDN) |
| Fonts | Plus Jakarta Sans, JetBrains Mono (Google Fonts) |
| Hosting | [Vercel](https://vercel.com) |

---

## 📁 Project Structure

```
SkyVault/
├── index.html   # App shell: auth screen, dashboard, files, monitoring, audit views
├── style.css    # Theme, layout, components, responsive rules
└── app.js       # Auth, upload/download, metrics, charts, cost model, activity logging
```

---

## 🗄️ Supabase Data Model

| Resource | Type | Purpose |
|---|---|---|
| `cloudvault-files` | Storage bucket (private) | Holds uploaded files |
| `file_metadata` | Table | One row per stored file (name, type, size, upload date) |
| `file_activity` | Table (`public`) | Audit log of upload/download/delete operations, with status and duration |
| `activity_summary` | Table / view | Aggregated operation counts used by the reliability chart |

All tables and the bucket are protected with Row Level Security so users can only access their own data.

---

## 🚀 Getting Started

### Prerequisites
- A free [Supabase](https://supabase.com) project
- Any static file server (Python, Node, VS Code Live Server, etc.)

### 1. Clone the repository
```bash
git clone https://github.com/nilancy04/SkyVault.git
cd SkyVault
```

### 2. Set up Supabase
1. Create a new Supabase project.
2. In **Storage**, create a **private** bucket named `cloudvault-files`.
3. In the **SQL Editor**, create the tables listed above and enable Row Level Security with per-user policies for both the tables and the bucket.
4. In **Authentication → Providers**, make sure Email is enabled.

### 3. Add your credentials
Open `app.js` and set your project values in the Supabase client setup:

```js
const SUPABASE_URL = 'https://<your-project-ref>.supabase.co';
const SUPABASE_ANON_KEY = '<your-anon-public-key>';
```

> The anon key is designed to be public, but **never** commit your `service_role` key.

### 4. Run locally
No build step is required. Serve the folder with any static server:

```bash
# Python
python -m http.server 5500

# or Node
npx serve .
```

Then open `http://localhost:5500`.

---

## ☁️ Deployment

SkyVault is a static site, so it deploys anywhere. The live version runs on Vercel:

```bash
npm i -g vercel
vercel --prod
```

Or connect the GitHub repository to Vercel and every push to `main` deploys automatically.

---

## 🔒 Security Notes

- Files live in a **private** bucket; access is controlled by Supabase Auth and Row Level Security
- Only the public anon key belongs in client code
- Passwords are handled entirely by Supabase Auth (minimum 6 characters)

---

## 🗺️ Roadmap

- [ ] File sharing via expiring signed links
- [ ] In-app file preview (images, PDFs, text)
- [ ] Folders and bulk operations
- [ ] Real per-user quota enforcement (beyond the warning threshold)
- [ ] CSV export of the audit log

---

## 🤝 Contributing

Issues and pull requests are welcome. For larger changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

No license has been specified yet. Add a `LICENSE` file (for example MIT) to define how others may use this project.

---

<p align="center">Built by <a href="https://github.com/nilancy04">@nilancy04</a></p>
