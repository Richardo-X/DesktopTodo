; 手动卸载时询问是否删除本地数据。
; electron-builder 覆盖升级会以 /S /KEEP_APP_DATA --updated 调用旧卸载器，
; 此时必须静默跳过；静默手动卸载同样默认保留。
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${ifNot} ${Silent}
      ${GetParameters} $R8
      ${GetOptions} $R8 "--delete-app-data" $R9
      ${if} ${Errors}
        IfFileExists "$APPDATA\${APP_PRODUCT_FILENAME}\data.json" 0 dtodoKeepData
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
          "是否同时删除本地数据？$\r$\n$\r$\n包括全部待办、历史记录、模板和设置，删除后无法恢复。$\r$\n选择“否”将保留数据，重新安装后可继续使用。" \
          IDNO dtodoKeepData
        RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
        IfFileExists "$APPDATA\${APP_PRODUCT_FILENAME}\data.json" 0 dtodoKeepData
        MessageBox MB_OK|MB_ICONEXCLAMATION "本地数据未能完全删除，请手动删除：$APPDATA\${APP_PRODUCT_FILENAME}"
      ${endIf}
      dtodoKeepData:
    ${endIf}
  ${endif}
!macroend
