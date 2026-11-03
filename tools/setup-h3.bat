@echo off
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0.."
runtime\generation-env\Scripts\python.exe native\setup_h3.py %*
pause
