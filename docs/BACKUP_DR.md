# Backup and Disaster Recovery Design (Phase 5 — Not Executed)

The local snapshot path will quiesce PostgreSQL or use an application-consistent backup procedure, create a snapshot with `--location local`, wait for `completed`, verify its `SnapshotId`, `Location`, state, and time, restore a new volume in Hanoi, attach it to an isolated recovery host, and verify a known sample record.

A second disposable volume will demonstrate the default/explicit regional destination. It will not reuse the local-chain source volume. Local snapshots and a single-Local-Zone S3 directory bucket do not supply an independent fault domain; an off-AWS Vietnam provider or another independently governed in-country backup is an architecture option, not an AWS resource this lab provisions.

