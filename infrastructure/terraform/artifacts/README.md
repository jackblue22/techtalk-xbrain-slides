# Deployment artifacts

Run `..\scripts\build-artifacts.ps1`. The default `minimal-images.tar` contains the unchanged Node.js/Fastify API, PostgreSQL 16, and the optional Hanoi-local Nginx frontend. Generated archives are ignored by Git and uploaded to a private encrypted S3 bucket. They contain no AWS credentials or database passwords.
