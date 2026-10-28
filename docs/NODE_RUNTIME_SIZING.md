# Node.js runtime sizing evidence

Date: 2026-10-28. Purpose: decide whether a Go rewrite is necessary before selecting the smallest offered Hanoi EC2 size.

The existing Node.js/Fastify + PostgreSQL implementation completed a local load of 3,000 HTTP requests and 60,000 real sequential SQL queries (12 concurrent clients) without an error. During a deliberately heavier 24-client run, sampled peaks were approximately:

| Container | Peak sampled CPU | Peak sampled memory |
| --- | ---: | ---: |
| Node/Fastify backend | 128% of one CPU | 148 MiB |
| PostgreSQL 16 | 116% of one CPU | 84 MiB |

The extreme run later observed HTTP 502 responses. Nginx recorded `connect() ... failed (99: Address not available)` while opening upstream connections to the healthy backend; neither backend nor PostgreSQL was OOM-killed/restarted and `/health` immediately remained successful. The evidence points to local proxy/source-port connection saturation from the artificial rapid-connection test, not a Node memory failure. This is recorded as a failed stress result, not a successful benchmark. The AWS benchmark calls the API directly and the live-demo method uses 100–300 sequential measured requests per group, so no proxy-tuning change was made for this out-of-scope stress pattern.

The `cost_minimal` bootstrap therefore caps each Node API at 320 MiB (`--max-old-space-size=192`) and PostgreSQL at 768 MiB. Singapore runs two APIs plus one database, for configured container limits of about 1.4 GiB on a 2 GiB `t3.small`; Hanoi normally runs one API plus one database on a 4 GiB `c7i.large`. Actual EC2 memory/CPU and throttling must be re-measured after deployment.

Conclusion: no meaningful memory bottleneck justifies a Go rewrite for this low-traffic demonstration. More importantly, live AWS offerings contain no C7i size below `c7i.large` in Hanoi, so a language change would not lower the Hanoi instance SKU. Node remains identical in both locations and avoids introducing a runtime confounder.

These are local sizing measurements, not AWS or Hanoi Local Zone latency evidence.
