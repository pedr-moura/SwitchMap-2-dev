@echo off
start cmd /k "cd /d A:\SwitchMap 1.0\backend\websocket && py websc.py"
start cmd /k "cd /d C:\ENTUITY && node scraper.js"
start cmd /k "cd /d D:\CACHEMAPA\cacheMapa && node cachemap.js"
exit
