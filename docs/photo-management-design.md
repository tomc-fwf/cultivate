# Photo Management Design — Cultivate

**Status:** Design only — not yet implemented  
**Date:** May 2026  
**Author:** Discovery task

---

## 1. Current State

### What exists today

Ten tables have a `photo_urls TEXT` column defined in migrations:

| Table | Migration | Context |
|---|---|---|
| `cv_plant_loss_events` | 003 | Evidence of loss event |
| `cv_teardown_events` | 005 | Post-batch teardown state |
| `cv_startup_events` | 005 | Pre-batch startup completion |
| `cv_container_amendments` | 004 | Amendment application evidence |
| `cv_applications_fertigation` | 007 | Rare — optional fertigation notes |
| `cv_applications_foliar` | 007 | Spray coverage documentation |
| `cv_applications_pesticide` | 007 | Required for MDA defensive recordkeeping |
| `cv_observations` | 007 | Primary use case — pest, disease, damage |
| `cv_plant_harvest_events` | 009 | Harvest weight evidence |
| `cv_plant_waste_trim_events` | 009 | Waste material documentation |

### What doesn't exist

**Nothing beyond the column definition.** Specifically:

- **No upload endpoint.** No `POST /api/photos/...` or multipart handling. `photo_urls` is not in any Zod schema on any write route — it cannot be set via the API.
- **No file storage library.** No `@fastify/multipart`, no AWS SDK, no R2/Cloudflare SDK in `package.json`.
- **No client-side upload code.** `client/src` has no file inputs, no `FormData`, no `fetch` with `multipart/form-data`. The UI does not render photos.
- **No serving mechanism.** No route returns photo URLs; no presigned URL generation.
- **No volume mount for a `photos/` directory.** The Railway volume only mounts `/data/cultivate.db`.

### What the client sends/receives

Currently: nothing. `photo_urls` is always `null` in every row because nothing writes it. The column exists purely as a placeholder.

---

## 2. Storage Options

### Option A: Railway Volume (alongside the database)

Store photos as files on the same `/data` Railway volume that holds `cultivate.db`.

| Factor | Assessment |
|---|---|
| Cost | ~$0.25/GB/month (Railway Pro) |
| Egress | Free (within the Railway container) |
| CDN | None — served through the app server |
| Offline tolerance | Full — stored locally alongside DB |
| Compliance retention | Volume is persistent, but single-replica — no built-in immutability |
| Complexity | Low — `fastify-static` or `fs.createReadStream` |
| Scalability | Limited to volume size; sharing disk with the DB is a blast-radius risk |

**Verdict:** Acceptable for a proof-of-concept only. Storing multi-MB compliance photos on the same volume as the SQLite database creates a single point of failure. A photo-heavy operation could fill the volume and corrupt the DB write path. Railway volumes are also single-availability-zone with no cross-region replication.

---

### Option B: Cloudflare R2

S3-compatible object storage operated by Cloudflare. The app already uses Cloudflare as its CDN/edge layer for `cultivate.hatstak.app`.

| Factor | Assessment |
|---|---|
| Cost | $0.015/GB/month storage; $0.36/million write ops; **zero egress** |
| Egress | Free (Cloudflare waives egress when reading through the Cloudflare network) |
| CDN | Native — R2 buckets can be fronted by a Cloudflare domain with cache |
| Offline tolerance | Not offline; requires connectivity to fetch stored photos |
| Compliance retention | Object lock available; lifecycle rules for retention |
| Complexity | Medium — SDK or presigned URLs; one new env var (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`) |
| Scalability | Effectively unlimited |

Zero egress cost is the decisive factor for mobile field use — compliance photos are occasionally re-viewed on site and in audits, and serving them through R2 + Cloudflare is free. S3 would cost ~$0.09/GB for the same reads.

**Verdict: Recommended.** See Section 5.

---

### Option C: AWS S3

| Factor | Assessment |
|---|---|
| Cost | $0.023/GB/month storage; $0.09/GB egress |
| Egress | Paid — meaningful cost for a photo-heavy operation reviewed on mobile |
| CDN | CloudFront optional (extra cost) |
| Offline tolerance | Not offline |
| Compliance retention | S3 Object Lock (WORM) available; Glacier for cheap long-term |
| Complexity | Medium — AWS SDK |
| Scalability | Effectively unlimited |

Functionally equivalent to R2 but with egress costs. Not justified when R2 is already in the infrastructure stack via Cloudflare.

---

### Option D: Local Filesystem (ephemeral, no volume)

Store photos in `/tmp` or the container's working directory.

**Non-viable.** Railway containers are rebuilt on every deploy. Without a volume mount, all photos are destroyed on the next deploy. Completely incompatible with 5-year retention requirements.

---

## 3. Upload Flow Design

### Approach A: Server proxy (client → app → storage)

```
Client                   App Server              R2
  |                           |                   |
  |-- POST /api/photos/upload |                   |
  |   multipart/form-data     |                   |
  |   context metadata        |                   |
  |                           |-- PutObject ------>|
  |                           |<-- 200 ETag ------|
  |<-- 201 { url, key } ------|
  |                           |
  |-- POST /api/.../create    |
  |   { photo_urls: [url] }   |-- INSERT ----------|
  |<-- 201 { ... } -----------|
```

**Pros:**
- Server validates file type and size before storage
- Auth is handled by existing JWT middleware — no extra credentials in the browser
- Simple client code — just a `FormData` POST

**Cons:**
- App server bandwidth and memory are used for every upload (streaming mitigates memory)
- Railway's `@fastify/multipart` must be added and configured

**Implementation notes:**
- Add `@fastify/multipart` to the backend
- Stream directly to R2 using `@aws-sdk/client-s3` `PutObjectCommand` — never buffer full file in memory
- Store key as `photos/{year}/{month}/{uuid}.{ext}` 
- Return the R2 public URL (or a signed URL if the bucket is private)

---

### Approach B: Presigned URL (client → R2 directly)

```
Client                   App Server              R2
  |                           |                   |
  |-- POST /api/photos/sign   |                   |
  |   { filename, mimeType }  |                   |
  |                           |-- CreatePresignedUrl|
  |<-- 200 { uploadUrl, key } |                   |
  |                           |                   |
  |-- PUT {uploadUrl} --------|-------------------->|
  |   raw file bytes          |                   |
  |<-- 200 ETag ----------------------------- R2 |
  |                           |                   |
  |-- POST /api/.../create    |                   |
  |   { photo_urls: [key] }   |-- INSERT ----------|
  |<-- 201 { ... } -----------|
```

**Pros:**
- App server never handles file bytes — lower CPU/memory pressure
- Scales to large files without impacting Railway instance

**Cons:**
- Two-step flow is harder to implement on the client, especially offline
- Validation happens before upload (MIME type checked server-side at sign time) but file content isn't inspected
- Requires CORS configured on the R2 bucket

---

### Recommended approach

**Phase 1: Server proxy.** Simpler to implement, auth is automatic, and at this scale (single farm, occasional photos) the bandwidth overhead is irrelevant.

**Phase 2+: Presigned URLs.** Migrate when photo volume justifies it or if Railway instance CPU/memory becomes a concern.

### Size and type limits

| Parameter | Limit | Rationale |
|---|---|---|
| Max file size | 10 MB | Adequate for mobile JPEG; blocks accidental video uploads |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/heic`, `image/webp` | Modern mobile formats |
| Max photos per record | 5 | Sufficient for compliance evidence without DB bloat |

HEIC must be accepted — iOS camera defaults to HEIC and field staff on iPhones will send it. Serve as-is; don't transcode server-side (complexity and cost not justified in Phase 1).

---

## 4. Compliance Requirements

### Retention

**MN Statute 342.25** requires cultivation records to be retained for 5 years. Photos attached to applications, observations, and harvest events are part of those records.

Implications:
- Photos **may not be deleted** within 5 years of the event they document
- Deletion after 5 years is **permitted but not required**
- A photo attached to a pesticide application is as legally significant as the text fields

### Immutability

R2 supports **Object Lock** (S3-compatible WORM). However, enabling bucket-wide Object Lock requires careful planning — it prevents any modification or deletion, including recovery from accidental uploads.

Recommended approach: **application-layer enforcement** rather than storage-layer lock.

- The API never exposes a "delete photo" endpoint
- `photo_urls` columns are append-only: new photos can be added to the JSON array but existing entries cannot be removed via the API
- Object Lock can be added later if a regulator specifically requires WORM storage

### Access control

Photos are compliance records and must not be publicly accessible.

- R2 bucket must be **private** (no public access)
- Serving options:
  1. **Signed URLs**: App generates a time-limited URL (15 minutes) for each photo when returning a record. Client fetches directly from R2 with the signed URL. No app server bandwidth consumed for reads.
  2. **Proxy through app**: `GET /api/photos/:key` — app fetches from R2 and streams to client. Auth checked first.
- Phase 1: Proxy through app (simpler). Phase 2: Signed URLs (scalable).

### Retention for the audit record

The cultivation record export (Feature 13, `GET /api/exports/cultivation-record`) must include photo references. In Phase 1 this means listing the photo URLs in the export. In Phase 3+ it means embedding thumbnails in the PDF output.

---

## 5. Recommended Approach

### Storage: Cloudflare R2

**Configuration:**
```
Bucket name: cultivate-photos (or cultivate-photos-prod)
Region: auto (Cloudflare distributes automatically)
Public access: disabled
Object Lock: not enabled in Phase 1 (application-layer enforcement instead)
CORS: disabled in Phase 1 (server-proxy upload — no browser-to-R2 requests)
```

**Environment variables to add:**
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=cultivate-photos
R2_PUBLIC_BASE_URL=  # optional: custom domain fronting R2 (Phase 2+)
```

**Key structure:**
```
photos/{YYYY}/{MM}/{record-type}/{record-id}/{uuid}.{ext}

Examples:
  photos/2026/05/pesticide-applications/42/a3f7b1c2.jpg
  photos/2026/05/observations/187/8e2d4f9a.heic
```

The path encodes context for future audit tooling. Record type is the table name without the `cv_` prefix.

---

### Implementation phases

#### Phase 1 — Server proxy upload, basic viewer

**Backend changes:**
1. Add `@fastify/multipart` and `@aws-sdk/client-s3` (or `@aws-sdk/lib-storage` for streaming)
2. New route: `POST /api/photos/upload`
   - Auth required (requireAuth)
   - Fields: `file` (multipart), `record_type` (string), `record_id` (string/number)
   - Validates MIME type, size ≤ 10 MB
   - Streams to R2 via `PutObjectCommand`
   - Returns `{ url: string, key: string }`
3. New route: `GET /api/photos/:key`
   - Auth required
   - Proxy-fetches from R2 and streams to client
   - Sets `Content-Type` and `Cache-Control: private, max-age=3600`
4. Update Zod schemas on write routes to accept `photo_urls?: string[]`
   - Allow up to 5 entries per record
   - Store as `JSON.stringify(urls)` in the DB column
5. Update read routes to parse `photo_urls` from JSON string to array before returning

**Frontend changes:**
1. `<PhotoUpload>` component — wraps a hidden `<input type="file" accept="image/*">` behind a tap target that meets the 56pt minimum
2. Shows thumbnails of uploaded photos; tap to view full-screen
3. Upload flow: user picks file → POST to `/api/photos/upload` → on success, add returned URL to form state → form submit includes `photo_urls` array
4. On load, photos rendered as `<img src="/api/photos/{key}">` (proxied through app)
5. Camera capture: `<input type="file" accept="image/*" capture="environment">` triggers native camera on mobile

**Forms to add photo upload to (in priority order):**
1. `ObservationNew` — highest value; pest/disease/damage observations
2. `PesticideNew` — MDA defensive recordkeeping
3. `FoliarNew`
4. `AmendmentNew`
5. `PartialHarvestForm`, `FinalHarvestForm`
6. `WasteTrimForm`
7. `PlantLossForm`
8. `TeardownForm`, `StartupForm`

#### Phase 2 — Presigned URLs, thumbnails

- Replace server-proxy upload with presigned URL flow
- Enable CORS on R2 bucket
- Server-side thumbnail generation (`sharp`) at upload time — store 200px thumbnail alongside original
- Signed URL serving with 15-minute expiry (remove proxy route)
- Photo gallery component for ContainerDetail and BatchDetail

#### Phase 3 — Integration with PDF exports

- Embed photo thumbnails in cultivation record PDF (Feature 13)
- Include photo count and references in METRC export
- 5-year retention lifecycle policy on R2 bucket (delete photos older than 5 years + 30 days)

---

## 6. API Contract Changes

### New endpoints

```
POST /api/photos/upload
  Auth: required (any role)
  Content-Type: multipart/form-data
  Fields:
    file: File (required) — image/jpeg, image/png, image/heic, image/webp, max 10MB
    record_type: string (required) — e.g. "observations", "pesticide-applications"
    record_id: string (required)
  Response 201:
    { key: string, url: string }
  Response 400:
    { error: "File too large" | "Unsupported file type" | "Missing required fields" }

GET /api/photos/:key
  Auth: required (any role)
  Params: key — the R2 object key (URL-encoded)
  Response 200: image bytes, Content-Type from stored metadata
  Response 404: { error: "Not found" }
  Response 403: { error: "Unauthorized" }
```

### Updated write endpoints

All application, observation, and harvest write endpoints (POST and PATCH) gain:

```typescript
// Added to all relevant Zod schemas
photo_urls: z.array(z.string().url()).max(5).optional().nullable()
```

On save: `JSON.stringify(body.photo_urls ?? [])` stored in the DB column.

### Updated read endpoints

All GET responses for records with `photo_urls` gain:

```typescript
// Before returning the row:
row.photo_urls = row.photo_urls ? JSON.parse(row.photo_urls as string) : [];
```

This change is backwards-compatible — currently `photo_urls` is always `null`, so clients already need to handle the null case. After this change it becomes an empty array, then optionally populated.

### CSP update required

`app.ts` currently allows `imgSrc: ["'self'", 'data:']`. When photos are served via the proxy route, `'self'` covers it. When presigned R2 URLs are used in Phase 2, the R2 domain must be added:

```typescript
imgSrc: ["'self'", 'data:', 'https://*.r2.cloudflarestorage.com', 'https://your-r2-custom-domain.com']
```

---

## 7. Open Questions Before Implementation

1. **R2 vs. Railway Volume for Phase 1:** Given the small current team and single-tenant deployment, is the extra R2 setup worth it versus a simple volume expansion? The compliance argument (separate disk from DB, no egress cost) favors R2, but either works at this scale.

2. **HEIC transcoding:** iOS devices default to HEIC. Rendering HEIC in a browser requires a polyfill or transcoding. `client/src` uses React + Vite — a library like `heic2any` (client-side) or `sharp` (server-side) would handle this. Decision needed before Phase 1 frontend work.

3. **Photo deletion policy UX:** Compliance rules say photos can't be deleted within 5 years. But staff will accidentally attach wrong photos. The `corrects_id` pattern (used for application records) could apply here: a `PATCH /api/photos/:key/void` that marks a photo as voided in a `cv_photos` tracking table without removing it from R2. Define this workflow before building the UI.

4. **Offline photo queue:** CLAUDE.md's offline-first requirement means a photo taken in the field with no connectivity must queue for upload. The form draft persistence in `localStorage` can store the base64 data URL temporarily, but base64 images in localStorage are large. A service worker with a `BackgroundSync` queue or IndexedDB blob store is the right solution for Phase 2.

---

*This document is a design input. No code changes were made.*
