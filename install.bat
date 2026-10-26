@echo off
rem ===========================================================================
rem  dsh-tool-gongwen 一键安装
rem  双击运行即可。做三件事：装依赖、登记 bundle、提示重启。
rem  详细输出在下方窗口中；失败时窗口会停住，便于查看原因。
rem ===========================================================================
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"

set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  echo.
  echo [错误] 找不到 DSH 自带的 Node 运行时：
  echo        %NODE%
  echo.
  echo 请确认 DSH 已安装并至少启动过一次。
  echo 若 DSH 装在别处，可先设置环境变量 DSH_HOME 再运行本脚本。
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0install.mjs" (
  echo [错误] 同目录下找不到 install.mjs
  pause
  exit /b 1
)

"%NODE%" "%~dp0install.mjs" %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo 按任意键关闭窗口，然后重启 DSH。
) else (
  echo 安装未成功，错误码 %RC%。按任意键关闭。
)
pause >nul
exit /b %RC%
