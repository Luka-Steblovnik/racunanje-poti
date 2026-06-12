@echo off
cd /d "%~dp0"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/Luka-Steblovnik/racunanje-poti.git
git push -u origin main
echo.
echo === DONE! Koda je na GitHubu. ===
pause
