@echo off
rem Starts the whole private test server on this computer: Docker services, database, test accounts,
rem the website and the background worker. Double-click this file. Needs Docker Desktop running.
cd /d "%~dp0"
echo Starting Docker services...
docker compose -f docker/compose.yml up -d postgres valkey mailpit s3 s3-init clamav
echo Preparing the database...
call npx pnpm@12.8.1 db:migrate
call npx pnpm@12.8.1 db:seed --demo --accounts
echo Opening the website and the worker in their own windows...
start "ViniCure website" cmd /k npx pnpm@12.8.1 dev
start "ViniCure worker" cmd /k npx pnpm@12.8.1 worker
timeout /t 12 /nobreak >nul
start http://localhost:3000
echo.
echo Site: http://localhost:3000   (sign in codes: double-click codes.cmd)
echo To stop everything: close the two windows, then double-click stop-local.cmd
pause
