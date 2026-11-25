@echo off
cd /d "%~dp0"
echo Starting Sky Drift... keep this window open while you play.
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:5288/"
node server.mjs
