@echo off
rem Stops the Docker services. Close the website and worker windows first. Your data is kept.
cd /d "%~dp0"
docker compose -f docker/compose.yml stop
pause
