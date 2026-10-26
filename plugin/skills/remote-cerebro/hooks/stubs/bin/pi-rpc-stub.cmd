@echo off
rem selftest only: stub pi --mode rpc behind a .cmd shim (risk 10, taskkill /T through cmd.exe)
node "%~dp0..\stub-pi-rpc.mjs" %*
