@echo off
echo ========================================
echo  Odoo ZIPConverter - Start GUI
echo ========================================
echo.

:: Kill any existing processes on port 5173 (Vite)
echo [1/5] Stopping old Vite instances (port 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Kill any existing Electron processes for this app
echo [2/5] Stopping old Electron instances...
taskkill /IM electron.exe /F >nul 2>&1

:: Build backend
echo [3/5] Building backend...
cd /d "%~dp0"
call npm run build >nul 2>&1
if errorlevel 1 (
    echo ERROR: Backend build failed!
    pause
    exit /b 1
)

:: Build GUI
echo [4/5] Building GUI...
cd /d "%~dp0gui"
call npm run build >nul 2>&1
if errorlevel 1 (
    echo ERROR: GUI build failed!
    pause
    exit /b 1
)

:: Start GUI
echo [5/5] Starting GUI...
echo.
echo ========================================
echo  GUI is starting...
echo  Close this window to stop the app.
echo ========================================
call npm run start
