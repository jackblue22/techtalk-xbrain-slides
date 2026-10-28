.PHONY: up down logs test build verify emulation-up emulation-down emulation-verify emulation-migrate emulation-recover present preflight reset

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

test:
	npm test

build:
	npm run build

verify: test build
	docker compose config --quiet

emulation-up:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/emulation/start.ps1 -Build

emulation-down:
	docker compose -f docker-compose.yml -f docker-compose.emulation.yml down

emulation-verify:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/emulation/verify-scenarios.ps1

emulation-migrate:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/emulation/migrate-sg-to-hanoi.ps1

emulation-recover:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/emulation/backup-restore.ps1

preflight:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/emulation/presenter.ps1 -Scenario Preflight

present:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/emulation/presenter.ps1 -Scenario All -Samples 100 -Warmups 5

reset:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/emulation/presenter.ps1 -Scenario Reset -ConfirmReset
