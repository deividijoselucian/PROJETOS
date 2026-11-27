; DECONTO (controle da frota): um .exe só, sem instalação e sem pedir administrador.
; Ao abrir, copia o sistema para a pasta do usuário, cria o atalho na Área de Trabalho
; e mostra numa janela própria do Microsoft Edge (que vem no Windows 10 e 11).
; Sem Edge, abre no navegador padrão.
; Os dados ficam salvos no navegador deste computador. Rodar um .exe novo atualiza o
; sistema e não apaga os dados.

Unicode true
SetCompressor /SOLID lzma

!define NOME "DECONTO"
!define PASTA "$LOCALAPPDATA\SistemaCarlise"

Name "${NOME}"
Caption "${NOME}"
OutFile "dist\DECONTO.exe"
Icon "build\icone.ico"
RequestExecutionLevel user
SilentInstall silent

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=0 "ProductName" "${NOME}"
VIAddVersionKey /LANG=0 "FileDescription" "${NOME}: controle da frota de caminhões"
VIAddVersionKey /LANG=0 "FileVersion" "1.0.0"
VIAddVersionKey /LANG=0 "ProductVersion" "1.0.0"
VIAddVersionKey /LANG=0 "LegalCopyright" "DECONTO"

Section
  SetOutPath "${PASTA}"
  File "build\frota.html"
  File "build\icone.ico"
  ; o atalho do nome antigo sai; a pasta continua a mesma para não perder os dados
  Delete "$DESKTOP\Sistema Carlise.lnk"
  Delete "$DESKTOP\DECONT.lnk"

  ; Procura o Edge para abrir o sistema como aplicativo (sem barra de endereço).
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  StrCmp $0 "" 0 temEdge
  ReadRegStr $0 HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  StrCmp $0 "" 0 temEdge
  StrCpy $0 "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  IfFileExists "$0" temEdge
  StrCpy $0 "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  IfFileExists "$0" temEdge semEdge

  temEdge:
    CreateShortCut "$DESKTOP\${NOME}.lnk" "$0" '--app="file:///${PASTA}\frota.html" --start-maximized' "${PASTA}\icone.ico" 0
    Exec '"$0" --app="file:///${PASTA}\frota.html" --start-maximized'
    Goto fim

  semEdge:
    CreateShortCut "$DESKTOP\${NOME}.lnk" "${PASTA}\frota.html" "" "${PASTA}\icone.ico" 0
    ExecShell "open" "${PASTA}\frota.html"

  fim:
SectionEnd
