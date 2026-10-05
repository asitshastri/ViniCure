@echo off
rem Prints a sign-in code for a test account. Examples:
rem   codes.cmd 6000000001      the latest code sent to that patient number (press Send code first)
rem   codes.cmd doctor1         the authenticator code for doctor1 (also admin, support, doctor2, doctor3)
cd /d "%~dp0"
if "%~1"=="" (
  echo Usage: codes.cmd 6000000001   or   codes.cmd admin
  pause
  exit /b
)
call npx pnpm@12.8.1 dev:code %1
pause
