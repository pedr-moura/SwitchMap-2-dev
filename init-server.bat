@echo off
start cmd /k "cd /d LOCAL && py websc.py"
start cmd /k "cd /d LOCAL && node scraper.js"
start cmd /k "cd /d LOCAL && node cachemap.js"
exit
