@echo off
title TG Expense - Push to GitHub
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\ucrt64\bin;%PATH%"
cd /d "%~dp0"

echo ===================================================
echo   TG Expense - Pushing Live Updates to GitHub
echo ===================================================
echo.

git add -A
git diff --cached --quiet || git commit -m "Update TG Expense"
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/tusharkhatri-sys/tg-expense.git

echo Connecting to GitHub (Sign-In popup will open if first time)...
git push -u origin main

echo.
echo ===================================================
echo   Done! Your code is now on GitHub.
echo ===================================================
pause

