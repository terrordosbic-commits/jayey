@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js nao foi encontrado. Instale o Node.js LTS e tente novamente.
    pause
    exit /b 1
)

if not exist "node_modules\next" (
    echo Instalando as dependencias do projeto...
    call npm.cmd install
    if errorlevel 1 (
        echo Nao foi possivel instalar as dependencias.
        pause
        exit /b 1
    )
)

curl.exe -fsS "http://localhost:3000/" -o nul >nul 2>nul
if not errorlevel 1 goto open_site

echo Iniciando o site. Mantenha aberta a janela do servidor.
start "Jay Ey - Next.js" cmd.exe /k "cd /d ""%~dp0"" && npm.cmd run dev"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$deadline = (Get-Date).AddSeconds(90); do { try { $response = Invoke-WebRequest -Uri 'http://localhost:3000/' -TimeoutSec 3; if ($response.StatusCode -eq 200) { exit 0 } } catch { }; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
    echo O site nao respondeu em http://localhost:3000 dentro de 90 segundos.
    echo Confira as mensagens na janela do servidor.
    pause
    exit /b 1
)

:open_site
start "" "http://localhost:3000/"
echo Loja aberta em http://localhost:3000/
echo Dashboard: http://localhost:3000/dashboard
exit /b 0
