# DBS Material Requests

Live internal app for DBS material, hardware, and edgeband requests with manager pricing replies.

## Features

- Every request starts with **Customer** and **PO number**
- Submit one request with **multiple products** (Material, Hardware, Edgeband mixed)
- Units stay locked by type: Material → sheets, Hardware → pcs, Edgeband → feet
- **Material** lines require **core** and **color**
- **Edgeband** lines must be **matched to a sheet** (pick a material in the same request, or describe the sheet)
- Managers unlock with password **JV** before replying or changing status
- Managers reply per product line with **availability**, **lead time**, **price**, and **vendor**
- Locked dates: **Submitted** on create; **Responded** when every line item has a reply
- Live board via Server-Sent Events — new requests and status changes appear instantly for everyone connected
- Status workflow: Pending → Approved → In progress → Fulfilled / Rejected

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push this repo to GitHub
2. Import the project in [Vercel](https://vercel.com/new)
3. Set environment variable:
   - `MANAGER_REPLY_PASSWORD=JV`
4. Deploy

Or from the project folder:

```bash
npx vercel --prod
```

## Manager password

Default manager password is `JV`.

Optional override:

```bash
MANAGER_REPLY_PASSWORD=JV
```

## API

- `GET /api/requests` — list requests
- `POST /api/requests` — create a request
- `PATCH /api/requests/:id` — update status / manager reply (password required)
- `GET /api/requests/stream` — SSE live feed
- `POST /api/manager/unlock` — verify manager password

## Notes

- Local data is stored in `data/requests.json`
- On Vercel, data is kept in memory/`/tmp` for the running instance (suitable for team demo use; cold starts can reset data)
