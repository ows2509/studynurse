@echo off
setlocal
cd /d "%~dp0"
set /p VERSION=<VERSION
echo StudyNurse v%VERSION% -^> http://127.0.0.1:8080/
where py >nul 2>nul
if %errorlevel%==0 (py -m http.server 8080 --bind 0.0.0.0 & goto :eof)
python -m http.server 8080 --bind 0.0.0.0
