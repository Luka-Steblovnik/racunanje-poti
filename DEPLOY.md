# Deployment: Railway (backend) + Cloudflare Pages (frontend)

## Predpogoji
- Račun na [railway.app](https://railway.app) (brezplačni Starter plan zadostuje)
- Račun na [cloudflare.com](https://cloudflare.com)
- Projekt na GitHubu (koda mora biti tam, da Railway/CF Pages jo potegneta)

---

## 1. Postavi projekt na GitHub

```bash
cd "Racunanje poti"
git init
git add .
git commit -m "Initial commit"
# Ustvari repo na github.com, potem:
git remote add origin https://github.com/TVOJE_IME/REPO.git
git push -u origin main
```

---

## 2. Backend → Railway

### 2a. Nov projekt
1. Odpri [railway.app](https://railway.app) → **New Project**
2. Izberi **Deploy from GitHub repo**
3. Izberi tvoj repozitorij
4. Ko te vpraša po **Root Directory**, nastavi na `backend`

### 2b. Volume (persistentni disk za routes.json)
1. V projektu klikni **+ Add Service** → **Volume**
2. Mount path: `/data`
3. Pritrdi volume na backend service

### 2c. Environment variables
V backend serviceu → **Variables** dodaj:

| Spremenljivka | Vrednost |
|---|---|
| `DATA_DIR` | `/data` |
| `ALLOWED_ORIGINS` | `https://TVOJA-APP.pages.dev` ← to izpolniš po koraku 3 |
| `GOOGLE_MAPS_API_KEY` | tvoj ključ *(opcijsko)* |

### 2d. Pridobi Railway URL
Ko se deploya, klikni **Settings** → **Domains** → **Generate Domain**.  
Dobil boš URL oblike: `https://backend-production-xxxx.up.railway.app`

---

## 3. Frontend → Cloudflare Pages

1. Odpri [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages**
2. Poveži GitHub → izberi repozitorij
3. Nastavi:

| Nastavitev | Vrednost |
|---|---|
| **Root directory** | `frontend` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |

4. Pod **Environment variables (production)** dodaj:

| Spremenljivka | Vrednost |
|---|---|
| `VITE_API_URL` | `https://backend-production-xxxx.up.railway.app` |

5. Klikni **Save and Deploy**.

---

## 4. Posodobi CORS na Railway

Ko dobiš Cloudflare Pages URL (npr. `https://kilometer-tracker.pages.dev`):

1. Pojdi na Railway → backend service → **Variables**
2. Nastavi `ALLOWED_ORIGINS` na tvoj Pages URL
3. Railway se samodejno redeploya

---

## Lokalni razvoj (ostane enak)

```bash
# Terminal 1
cd backend && uvicorn main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Lokalno ni treba nastavljati `VITE_API_URL` — Vite proxy skrbi za preusmeritev.
