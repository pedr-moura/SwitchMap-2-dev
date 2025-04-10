@echo off

start cmd /k "cd /d A:\CPU-C && py cpu.py"
start cmd /k "cd /d C:\ENTUITY && node scraper.js"
start cmd /k "cd /d D:\CACHEMAPA\cacheMapa && node cachemap.js"
start cmd /k "cd /d A:\SwitchMap 1.0\backend\websocket && py app.py"
start cmd /k "cd /d A:\SwitchMap 1.0\backend\websocket && py approve.py"
start cmd /k "cd /d A:\SwitchMap 1.0\backend\websocket && py get_data_service.py"
exit
