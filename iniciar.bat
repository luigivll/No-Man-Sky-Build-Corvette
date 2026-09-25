@echo off
REM ---------------------------------------------------------------------------
REM  NMS Corvette Shipyard - lanzador local para Windows
REM  Doble clic en este archivo: instala lo que falte, compila y abre la app.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Falta Node.js. Descargalo de https://nodejs.org  ^(version LTS^)
  echo   Despues vuelve a hacer doble clic en este archivo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   Instalando dependencias por primera vez...
  call npm install --no-audit --no-fund || goto :error
)

if not exist out\index.html (
  echo   Compilando la aplicacion...
  call npm run build:static || goto :error
)

echo   Arrancando el Shipyard...
call npm run start:local
goto :eof

:error
echo.
echo   Algo ha fallado. Copia el mensaje de arriba si necesitas ayuda.
pause
