; Meu Painel Investigativo: um .exe só, sem instalação.
; Ao abrir, copia o painel para a pasta do usuário e mostra numa janela própria do
; Microsoft Edge (que vem no Windows 10 e 11). Sem Edge, abre no navegador padrão.
; As entrevistas ficam salvas no navegador, como na página on-line.

Unicode true
SetCompressor /SOLID lzma

!define NOME "Meu Painel Investigativo"
!define PASTA "$LOCALAPPDATA\PainelInvestigativo"

Name "${NOME}"
Caption "${NOME}"
OutFile "dist\PainelInvestigativo.exe"
Icon "build\icone.ico"
RequestExecutionLevel user
SilentInstall silent

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=0 "ProductName" "${NOME}"
VIAddVersionKey /LANG=0 "FileDescription" "${NOME}"
VIAddVersionKey /LANG=0 "FileVersion" "1.0.0"
VIAddVersionKey /LANG=0 "ProductVersion" "1.0.0"
VIAddVersionKey /LANG=0 "LegalCopyright" "Pesquisa da Fase 2 da Maratona Tech 2026"

Section
  SetOutPath "${PASTA}"
  File "build\painel.html"

  ; Procura o Edge para abrir o painel como aplicativo (sem barra de endereço).
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  StrCmp $0 "" 0 temEdge
  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  StrCmp $0 "" 0 temEdge
  StrCpy $0 "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  IfFileExists "$0" temEdge
  StrCpy $0 "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  IfFileExists "$0" temEdge semEdge

  temEdge:
    Exec '"$0" --app="file:///${PASTA}\painel.html" --start-maximized'
    Goto fim

  semEdge:
    ExecShell "open" "${PASTA}\painel.html"

  fim:
SectionEnd
