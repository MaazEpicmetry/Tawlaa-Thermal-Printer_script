@echo off
cd /d C:\laragon\www\tawlaweb-app
"C:\Program Files\nodejs\node.exe" thermal-printer.js >> logs\thermal.log 2>&1
exit /b 0