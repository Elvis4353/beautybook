# BeautyBook — Skaistumkopšanas SaaS platforma

Multi-tenant rezervāciju sistēma ar WhatsApp/email atgādinājumiem, whitelabel dizainu un kredītu sistēmu.

---

## Arhitektūra

```
beautybook/
├── backend/          Node.js + Express + PostgreSQL
│   └── src/
│       ├── index.js              Servera ieejas punkts
│       ├── models/
│       │   ├── db.js             PostgreSQL savienojums
│       │   └── migrate.js        DB tabulas
│       ├── middleware/
│       │   └── auth.js           JWT + tenant resolver
│       ├── routes/
│       │   └── index.js          Visi API endpointi
│       ├── services/
│       │   └── messaging.js      WhatsApp (Twilio) + Email (SendGrid)
│       └── jobs/
│           └── reminders.js      Automātiskie cron darbi
└── frontend/         React + Vite + TanStack Query
    └── src/
        ├── App.jsx               Router + admin layout
        ├── lib/
        │   ├── api.js            API klienta funkcijas
        │   └── store.js          Zustand state
        └── pages/
            ├── BookingPage.jsx   Publiskā rezervāciju lapa (whitelabel)
            └── admin/
                ├── Dashboard.jsx         Galvenais panelis
                └── BrandingSettings.jsx  Dizaina iestatījumi
```

---

## Tech Stack

| Slānis | Tehnoloģija | Iemesls |
|--------|-------------|---------|
| Backend | Node.js + Express | Ātrums, npm ekosistēma |
| Datubāze | PostgreSQL | JSONB, UUID, relations |
| Frontend | React + Vite | Ātrs build, HMR |
| State | TanStack Query + Zustand | Server state + UI state |
| WhatsApp | Twilio WhatsApp API | Uzticams, ES atbalsts |
| Email | SendGrid | 100 bezmaksas/dienā, templates |
| Hosting | Vercel (FE) + Railway (BE+DB) | Deploy ar 1 klikšķi |
| Attēli | Cloudinary | Logo un avatar uploads |

---

## Ātrā uzstādīšana

### 1. Klonē projektu

```bash
git clone https://github.com/jusu-repo/beautybook
cd beautybook
```

### 2. Backend uzstādīšana

```bash
cd backend
npm install
cp .env.example .env
# Aizpildi .env (skatīt zemāk)
```

### 3. Datubāze (Railway)

1. Ej uz [railway.app](https://railway.app) → New Project → PostgreSQL
2. Nokopē `DATABASE_URL` no Railway → ieliec `.env`
3. Izpildi migrāciju:

```bash
npm run db:migrate
```

### 4. Frontend uzstādīšana

```bash
cd ../frontend
npm install
# Izveido .env.local:
echo "VITE_API_URL=http://localhost:3001/api" > .env.local
```

### 5. Palaist lokāli

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

Atvērt: http://localhost:5173

---

## Pirmā salona reģistrācija

```bash
curl -X POST http://localhost:3001/api/auth/register-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "tenantName": "Bloom Salons",
    "slug": "bloom",
    "ownerName": "Anna Kalniņa",
    "ownerEmail": "anna@bloomsalons.lv",
    "ownerPassword": "droša-parole-123",
    "salonName": "Bloom Centra salons",
    "salonAddress": "Brīvības iela 42, Rīga"
  }'
```

Atbilde:
```json
{
  "token": "eyJ...",
  "tenantId": "uuid",
  "slug": "bloom",
  "bonusCredits": 5.00
}
```

Rezervāciju lapa uzreiz pieejama: `http://localhost:5173/book/bloom`
Admin panelis: `http://localhost:5173/admin` (login ar slug `bloom`)

---

## WhatsApp uzstādīšana (Twilio)

### 1. Twilio konts
1. Reģistrēties [twilio.com](https://twilio.com)
2. Console → WhatsApp Senders → aktivizēt WhatsApp Business API
3. Nokopēt: Account SID, Auth Token, WhatsApp numuru

### 2. Ievadīt admin panelī
Admin → Dizains → Integrācijas → WhatsApp sadaļa

### Automātiskie atgādinājumi
Sistēma automātiski sūta:

| Laiks | Ziņa | Cron |
|-------|------|------|
| 24h pirms vizītes | "Rīt plkst. 10:00 jums ir pieraksts..." | ik stundu |
| 2h pirms vizītes | "Pēc 2 stundām jūs gaidām!" | ik 15 min |
| Pēc vizītes | "Paldies! Rezervējiet nākamo..." | ik stundu |
| Dzimšanas dienā | "15% atlaide šomēnes!" | ik dienu 09:00 |

### Ziņu cenas (ar platformas uzcenojumu 2×)
```
WhatsApp:  0.10€ / ziņa  (Twilio ~0.05€ + 100% markup)
Email:     0.01€ / ziņa  (SendGrid ~0.005€ + 100%)
```

---

## Email Marketing uzstādīšana (SendGrid)

1. Reģistrēties [sendgrid.com](https://sendgrid.com)
2. Settings → API Keys → Create (Full Access)
3. Sender Authentication → verificēt domēnu vai e-pastu
4. Ievadīt admin panelī → Integrācijas → E-pasts

### Kampaņas API
```bash
# Izveidot kampaņu
POST /api/campaigns
{
  "name": "Pavasara piedāvājums",
  "subject": "🌸 -20% visiem pakalpojumiem aprīlī!",
  "body": "Sveika, {{vards}}! Šomēnes mēs svinam pavasari ar īpašu cenu...",
  "targetSegment": "all"
}

# Nosūtīt nekavējoties
POST /api/campaigns/:id/send
```

---

## Kredītu sistēma

Platforma pārdod tālāk Twilio/SendGrid pakalpojumus ar uzcenojumu:

```
Klients iegādājas kredītus → Platforma uzglabā atlikumu
Katrs WA/email → Automātiski atskaita no atlikuma
Ja kredīti beidzas → Atgādinājumi apstājas + brīdinājums
```

### Kredītu pievienošana (superadmin)
```bash
POST /api/credits/add
{
  "tenantId": "uuid",
  "amount": 20.00,
  "description": "Iegādāts 2025-04-13"
}
```

### Integrācija ar maksājumu sistēmu (nākamais solis)
Pievienot Stripe webhook → `/api/credits/webhook`:
```javascript
// Pēc veiksmīga maksājuma
await query(
  'UPDATE credit_accounts SET balance = balance + $2 WHERE tenant_id = $1',
  [tenantId, amount]
);
```

---

## Custom domēns

Katrs salons var izmantot savu domēnu:

### DNS iestatīšana (klienta pusē)
```
CNAME  booking  →  cname.beautybook.lv
```

### Vercel konfigurācija
```bash
vercel domains add booking.jususalons.lv
```

Sistēma automātiski identificē tenantu pēc domēna (`custom_domain` kolonna).

---

## Deploy uz Railway + Vercel

### Backend (Railway)
```bash
cd backend
# railway.app → New → Deploy from GitHub
# Pievienot env mainīgos Railway dashboard
# Railway automātiski detektē Node.js
railway up
```

### Frontend (Vercel)
```bash
cd frontend
# vercel.com → Import Git Repository
# Build command: npm run build
# Output dir: dist
# Env: VITE_API_URL=https://jusu-railway-app.railway.app/api
vercel --prod
```

### Railway env mainīgie
```
DATABASE_URL        (auto no Railway PostgreSQL)
JWT_SECRET          openssl rand -base64 32
NODE_ENV            production
FRONTEND_URL        https://jusu-app.vercel.app
PORT                3001
```

---

## API pārskats

### Publiskā API (bez autentifikācijas)
```
GET  /api/public/tenant/:slug     Salona info + pakalpojumi
GET  /api/public/slots            Brīvie laiki
POST /api/public/book             Izveidot rezervāciju
```

### Admin API (JWT token)
```
POST /api/auth/login
POST /api/auth/register-tenant

GET/POST   /api/appointments
PATCH      /api/appointments/:id

GET/POST   /api/clients
GET        /api/clients/:id

GET/POST   /api/services
GET/POST   /api/staff
GET        /api/salons

GET/PATCH  /api/tenant
PATCH      /api/tenant/branding
PATCH      /api/tenant/integrations

POST /api/messages/send-whatsapp
POST /api/messages/send-email

GET/POST        /api/campaigns
POST            /api/campaigns/:id/send

GET  /api/credits
POST /api/credits/add (superadmin)

GET  /api/stats/overview
```

---

## Drošība

- **JWT** autentifikācija (30 dienu tokens)
- **Helmet** HTTP security headers
- **Rate limiting** — 10 rezervācijas/15min, 300 req/min admin
- **GDPR** — piekrišanas lauks rezervācijā, atsevišķa marketing_consent
- **Multi-tenant izolācija** — katrs vaicājums filtrē pēc `tenant_id`
- **Kredenciāļu glabāšana** — Twilio/SendGrid atslēgas šifrētas DB (ieteicams: papildus AES šifrēšana)
- **SSL** — Railway un Vercel automātiski

---

## Nākamie soļi (roadmap)

- [ ] Stripe integrācija kredītu iegādei
- [ ] Kalendāra sinhronizācija (Google Calendar API)
- [ ] SMS rezerves (ja WA neizdodas)
- [ ] Klients var atcelt/pārcelt vizīti (booking_token links)
- [ ] Staff mobilā app (React Native)
- [ ] Superadmin panelis (visu tenantu pārvaldība)
- [ ] Webhook atbalsts (Zapier/Make integrācijām)
- [ ] Pakalpojumu tiešsaistes apmaksa

---

## Izmaksas (reālas)

| Pakalpojums | Bezmaksas | Izmaksas |
|-------------|-----------|----------|
| Railway (backend + DB) | $5 kredīts/mēn | ~$10-20/mēn |
| Vercel (frontend) | Unlimited | Bezmaksas |
| Twilio WhatsApp | $15 setup | ~$0.05/ziņa |
| SendGrid | 100 email/dienā | $19.95/mēn pro |
| Cloudinary | 25GB | Bezmaksas |

**Kopā start:** ~$30/mēn platformai. Peļņa no kredītu uzcenojuma.

---

*BeautyBook — built with Node.js, React, PostgreSQL, Twilio, SendGrid*
