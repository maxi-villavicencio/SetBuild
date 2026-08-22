@echo off
REM ============================================================================
REM  SetBuild - launcher de un paso (Windows)
REM  Levanta backend (uvicorn) y frontend (vite) en ventanas separadas y abre
REM  el navegador. Funciona con doble clic desde el explorador: usa su PROPIA
REM  ubicacion como base (%~dp0), no el directorio actual.
REM ============================================================================
setlocal
title SetBuild launcher

REM Pararse SIEMPRE en la carpeta del script (asi las ventanas hijas heredan
REM este directorio como cwd, sin importar desde donde se ejecute).
cd /d "%~dp0"

echo Iniciando SetBuild desde: %CD%
echo.

REM --- Backend: activar el venv y correr uvicorn (ventana propia) ---
echo   [1/3] Backend  -> uvicorn app.main:app --reload
start "SetBuild backend" cmd /k "call .venv\Scripts\activate.bat && uvicorn app.main:app --reload"

REM --- Frontend: vite dev server (ventana propia) ---
echo   [2/3] Frontend -> npm run dev
start "SetBuild frontend" cmd /k "cd frontend && npm run dev"

REM --- Esperar a que ambos arranquen y abrir el navegador ---
echo   [3/3] Abriendo http://localhost:5173 en unos segundos...
timeout /t 8 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Listo. Backend y frontend corren en sus propias ventanas.
echo Cerra esas ventanas para detener los servidores.
endlocal
