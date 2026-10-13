@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo.
echo Open http://localhost:4174/ in your browser.
echo Keep this window open while playing. Press Ctrl+C to stop.
call npm start
goto :eof
:failed
echo Could not start the game. Check the message above.
pause
