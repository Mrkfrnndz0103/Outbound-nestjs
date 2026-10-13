# Scalability Review

## Key bottlenecks

1. **Authentication adds one external network call to every protected API request.**
   The `supabase.auth` middleware calls Supabase `/auth/v1/user` for each request before loading the local profile. At higher request rates this makes API latency and availability depend on a synchronous third-party round trip on every endpoint hit.

2. **Request listing relies on offset pagination and a total count.**
   `RequestRepository::paginate()` orders by `created_at desc` and uses Laravel `paginate()`, which issues count queries and offset/limit scans. This is acceptable for small queues but becomes slower as the `requests` table grows, especially for broad FTE views.

3. **The default FTE request queue needs a matching `created_at` index.**
   Existing indexes cover `(status, created_at desc)` and `(created_by, created_at desc)`, while the default all-requests query for FTE/doc roles orders all visible rows by `created_at desc` without a status or creator predicate. Migration `006_scalability_indexes.sql` adds a `(created_at desc, id desc)` index for this feed.

4. **Workflow transitions do synchronous audit and notification writes inside the same transaction.**
   Each status transition updates the request, inserts an event, and inserts a notification before the transaction returns. This preserves consistency, but notification fan-out or future external delivery inside this path would directly increase lock duration and user-facing latency.

5. **User provisioning couples Supabase Admin API and local database writes without compensation.**
   Backroom user creation first creates a Supabase auth account, then inserts a profile. If the local insert fails after the remote user is created, operators can get orphaned auth users or need manual repair.

6. **The dashboard should not compute operational metrics from the first page.**
   The dashboard requests `/requests?per_page=20` for the latest activity feed and calls `/requests/summary` so total, “awaiting action,” and analytics aggregates are computed server-side under one filter contract.

7. **No read model or aggregation layer exists for operations metrics.**
   Metrics currently derive from request rows at read time. As stakeholders ask for per-status, per-region, backlog, aging, or SLA dashboards, repeated ad hoc scans over `requests` will become a common bottleneck.

8. **Large tables will need retention and archival boundaries.**
   `requests`, `request_events`, and `notifications` are append-heavy operational tables. Without retention, partitioning, or archive strategy, indexes and backups will grow monotonically and slow routine reads, writes, and maintenance.

## Recommended improvements

### Short term

- Cache or locally verify JWTs in the auth middleware, then load the profile from the database. Keep Supabase `/auth/v1/user` as a fallback or periodic validation path rather than the default path for every request.
- Added `requests_created_idx on public.requests(created_at desc, id desc)` for the default FTE/doc queue; validate with `EXPLAIN ANALYZE` on realistic volumes before and after deployment.
- Replace broad offset pagination with cursor pagination for request feeds, using `(created_at, id)` as a stable cursor.
- Add explicit API filters for status, creator, region, cluster, and date ranges so operators avoid scanning broad queues.
- Added a backend request metrics endpoint so dashboard counters are computed over the full authorized dataset, not just the current page.

### Medium term

- Create a notification outbox table or queue worker boundary. Keep the status change and audit event transactional, but process non-critical delivery asynchronously.
- Add idempotency keys for create and transition endpoints to make retries safe under network timeouts.
- Add compensation or transaction orchestration for user provisioning: if the local profile insert fails, delete/deactivate the newly created Supabase user or enqueue a repair job.
- Introduce materialized or incrementally maintained summary tables for per-status, per-region, backlog, and SLA metrics.
- Add performance tests or seed scripts that load tens/hundreds of thousands of requests and assert p95 latency budgets for the list, transition, and dashboard endpoints.

### Long term

- Partition append-heavy operational tables by time if data volume grows beyond what regular indexes can handle comfortably.
- Define retention policies for notifications and request events, plus an archive path for historical requests.
- Add observability around database query duration, Supabase auth latency, lock wait time, queue depth, and endpoint p95/p99 latency.
- Consider separating command and query workloads if dashboards become much heavier than workflow updates, for example with read replicas or dedicated reporting tables.
