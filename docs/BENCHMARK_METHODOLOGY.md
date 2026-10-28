# Benchmark Methodology

## Purpose and evidence boundary

The benchmark demonstrates application sensitivity to operator-defined network delay using real local HTTP requests and PostgreSQL queries. It is a repeatable teaching experiment, not a prediction or measurement of AWS Singapore or Hanoi Local Zone performance.

## Protocol

For Cases 1–3, the runner processes scenarios and query counts `1, 5, 10, 20` in a fixed order with concurrency one. Each group runs configurable warm-ups first; warm-ups are stored separately and excluded from statistics. It then records 1–300 measured requests per group. Presentation runs should use at least 100:

```powershell
.\scripts\emulation\presenter.ps1 -Scenario Case1 -Samples 100 -Warmups 5
```

Every raw record contains start/completion timestamps, run ID, origin, endpoint, workload, scenario, delay profile, status/error, request ID, client elapsed time, server application time, total database time, and every sequential query timing. Evidence records the fixed request order and concurrency.

## Statistics

Only successful measured requests contribute to latency distributions. Errors remain in the raw data and contribute to error rate; a run containing any measured error is marked `FAILED` and exits non-zero.

- p50, p95, and p99 use linear interpolation over sorted samples.
- Mean is the arithmetic mean.
- Standard deviation is the population standard deviation for the observed run.
- Min and max are the measured bounds.
- Error rate is failed measured requests divided by requested measured samples.

## Delay verification

Before measurement, the runner inspects the named Toxiproxy proxy and requires matching upstream and downstream latency toxics. The configured values are saved as `OPERATOR_DEFINED_ILLUSTRATIVE`. This proves the proxy configuration was active; it does not prove that every request experienced an exact delay because host scheduling and configured jitter remain variable.

Default one-way illustrative parameters are 18 ms for the Singapore HTTP profile, 4 ms for Hanoi HTTP, and 12 ms for the hybrid database path, plus 1 ms configured jitter. These are inputs, not observed AWS values.

## Comparison limitations

A valid geography comparison holds application version, instance family/size, CPU architecture, storage type/configuration, PostgreSQL version/settings/data, connection pool, TLS, load, query plan, and client vantage constant. Comparing self-managed PostgreSQL to RDS, different instance families, different EBS settings, or Fargate to EC2 confounds geography with compute, storage, network, and operational differences.

Local Docker results additionally include host CPU contention, Docker Desktop virtualization, loopback, proxy processing, filesystem caching, and local PostgreSQL state. They omit public routing, DNS/TLS setup, real bandwidth and loss, AWS control-plane behavior, noisy neighbors, service quotas, placement, and failure domains. Do not rank AWS architectures from this evidence.
