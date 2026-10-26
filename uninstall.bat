@echo off
rem ===========================================================================
rem  dsh-tool-gongwen 卸载
rem  把插件从 profile 的 bundles 里移除，并卸载依赖。
rem ===========================================================================
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"

set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  echo [错误] 找不到 DSH 自带的 Node 运行时：%NODE%
  pause
  exit /b 1
)

"%NODE%" "%~dp0uninstall.mjs" %*
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo 按任意键关闭窗口，然后重启 DSH。
) else (
  echo 卸载未完成，错误码 %RC%。按任意键关闭。
)
pause >nul
exit /b %RC%
