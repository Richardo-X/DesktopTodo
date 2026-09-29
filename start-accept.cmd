@echo off
rem DesktopTodo batch-B acceptance launcher (double-click to run)
rem Data dir is isolated; product data is not touched.
cd /d F:\AI\VBcode\worktrees\ToDoList
set "DTODO_USER_DATA=%TEMP%\dtodo-accept"
echo Starting DesktopTodo (three-window acceptance build)...
echo Data dir: %DTODO_USER_DATA%
echo Quit: tray icon right-click - Exit
npx electron .
