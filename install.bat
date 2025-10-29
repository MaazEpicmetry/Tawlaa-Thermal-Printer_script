@echo off
title Thermal Printer Service Installer
color 0A

echo ============================================================
echo 🚀 Installing Thermal Printer Service...
echo ============================================================

:: Ask for branch ID
set /p BRANCH_ID=🏢 Enter Branch ID (numbers only): 

if "%BRANCH_ID%"=="" (
    echo ❌ No Branch ID entered. Aborting installation.
    pause
    exit /b
)

:: Detect script directory (so it works anywhere)
set "BASE_DIR=%~dp0"
set "NODE_PATH=%BASE_DIR%node-v16\node.exe"
set "SCRIPT_PATH=%BASE_DIR%Tawlaweb-app\thermal-printer.js"
set "WORK_DIR=%BASE_DIR%Tawlaweb-app"
set "TEMP_XML=%TEMP%\thermal_task.xml"

echo 🧩 Updating CHANNEL in thermal-printer.js to use branch ID %BRANCH_ID%...
powershell -Command ^
    "(Get-Content '%SCRIPT_PATH%') -replace 'const CHANNEL = \"orders-[0-9]+\";', 'const CHANNEL = \"orders-%BRANCH_ID%\";' | Set-Content '%SCRIPT_PATH%'"

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to update CHANNEL. Check if the file path is correct.
    pause
    exit /b
)

:: Get current logged-in user in DOMAIN\Username format
for /f "delims=" %%a in ('whoami') do set "CURRENT_USER=%%a"

:: Prepare the XML dynamically
echo 🧠 Preparing task XML...
powershell -Command ^
    "(Get-Content '%BASE_DIR%task-template.xml') -replace '__CURRENT_USER__', '%CURRENT_USER%' |" ^
    "ForEach-Object {$_ -replace 'C:\\\\laragon\\\\www\\\\node-v16\\\\node.exe', '%NODE_PATH:'=\'%'} |" ^
    "ForEach-Object {$_ -replace 'C:\\\\laragon\\\\www\\\\Tawlaweb-app\\\\thermal-printer.js', '%SCRIPT_PATH:'=\'%'} |" ^
    "ForEach-Object {$_ -replace 'C:\\\\laragon\\\\www\\\\Tawlaweb-app', '%WORK_DIR:'=\'%'} |" ^
    "Out-File '%TEMP_XML%' -Encoding Unicode"

:: Delete old task if it exists
echo 🧹 Removing any existing task...
schtasks /delete /tn "Thermal Printer" /f >nul 2>&1

:: Register the new task
echo 🧾 Creating Windows Task...
schtasks /create /tn "Thermal Printer" /xml "%TEMP_XML%" /f

if %ERRORLEVEL% EQU 0 (
    echo ✅ Installation complete!
    echo ------------------------------------------------------------
    echo 🔁 Branch ID set to: %BRANCH_ID%
    echo 🖨️  The service will:
    echo     • Start automatically at boot
    echo     • Run every 6 hours
    echo     • Stop existing instances before restarting
    echo ------------------------------------------------------------
) else (
    echo ❌ Failed to create the task. Check permissions or XML syntax.
)

pause
