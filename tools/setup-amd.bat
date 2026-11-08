@echo off
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0.."
echo AMD 顯示卡支援（實驗性）安裝：會建立獨立的 AMD 執行環境，不會改動 NVIDIA 環境或系統套件。
echo 執行前請先關閉 start.bat 的視窗。
python native\setup_amd.py %*
if errorlevel 1 (
  echo AMD 安裝未完成，請查看上方訊息。聊天功能不受影響。
) else (
  echo 完成。請重新執行 start.bat；只有通過驗證的模型會出現在介面上。
)
pause
