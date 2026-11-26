; Amethyst as a choice for text and Markdown files: "Open with" and Windows' Default apps. It never writes
; an extension's own default value or UserChoice: which app is the default stays the user's choice.
; To add a file type: one line in each of the two macros below.

!define AMETHYST_CLASS "Amethyst.TextFile"
!define AMETHYST_CAPS "Software\Amethyst\Capabilities"

!macro amethystType EXT
  WriteRegNone SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${AMETHYST_CLASS}"
  WriteRegStr SHELL_CONTEXT "${AMETHYST_CAPS}\FileAssociations" ".${EXT}" "${AMETHYST_CLASS}"
!macroend

!macro amethystUntype EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${AMETHYST_CLASS}"
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\${AMETHYST_CLASS}" "" "Text file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${AMETHYST_CLASS}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\${AMETHYST_CLASS}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHELL_CONTEXT "${AMETHYST_CAPS}" "ApplicationName" "Amethyst"
  WriteRegStr SHELL_CONTEXT "${AMETHYST_CAPS}" "ApplicationDescription" "Notes, code and agents, in one place"
  !insertmacro amethystType "md"
  !insertmacro amethystType "markdown"
  !insertmacro amethystType "txt"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "Amethyst" "${AMETHYST_CAPS}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro amethystUntype "md"
  !insertmacro amethystUntype "markdown"
  !insertmacro amethystUntype "txt"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "Amethyst"
  DeleteRegKey SHELL_CONTEXT "Software\Amethyst"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\${AMETHYST_CLASS}"
  ; "start with windows" (main.js setLoginItemSettings, name Amethyst); an update keeps it (the app writes it again at each start)
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Amethyst"
  ${endIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
