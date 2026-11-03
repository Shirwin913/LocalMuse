@echo off
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0.."
python native\setup_minimax.py
if errorlevel 1 (
  echo MiniMax 安裝或驗證失敗，請查看上方錯誤。現有音樂與圖片功能不受影響。
) else (
  echo MiniMax 已就緒，請重新啟動 start.bat。
)
pause
