; Instalador de TESTE da Central de Acionamentos.
; Compilar com ./build.sh (precisa do NSIS 3). O build.sh passa EXT_ID, o id fixo da extensão.

Unicode true
ManifestDPIAware true

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WordFunc.nsh"

!ifndef EXT_ID
  !error "Rode pelo build.sh: ele informa o id da extensão (EXT_ID)."
!endif

!define APP_NOME   "Central de Acionamentos"
!define APP_ID     "CentralAcionamentos"
!define APP_VERSAO "0.2.0"
!define CHAVE_DESINSTALAR "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define PAINEL_URL "chrome-extension://${EXT_ID}/central.html"

Name "${APP_NOME} (teste)"
OutFile "dist/CentralAcionamentos-Teste-Setup.exe"
; Pasta sem espaços nem acentos: o endereço file:/// dos atalhos fica simples.
InstallDir "C:\${APP_ID}"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APP_NOME} · teste ${APP_VERSAO}"

Var Navegador
Var UrlPasso

!define MUI_ICON   "build/icone.ico"
!define MUI_UNICON "build/icone.ico"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "${APP_NOME} (teste)"
!define MUI_WELCOMEPAGE_TEXT "Este instalador coloca a Central de Acionamentos no seu computador.$\r$\n$\r$\nA Central junta numa tela só os chamados da Porto Seguro, Tokio Marine, Notro e Aciona Fácil, e toca alarme quando entra serviço novo. Ela funciona como uma extensão do Chrome e só lê as telas dos portais.$\r$\n$\r$\nNão precisa de administrador. Para remover depois, use Configurações › Aplicativos.$\r$\n$\r$\nClique em Avançar para continuar."
!define MUI_FINISHPAGE_TITLE "Falta ligar a extensão"
!define MUI_FINISHPAGE_TEXT "Os arquivos foram instalados.$\r$\n$\r$\nAgora é preciso ligar a extensão no Chrome uma vez. O passo a passo vai abrir no navegador (e também fica no Menu Iniciar, em $\"Ligar a extensão da Central$\")."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o passo a passo agora"
!define MUI_FINISHPAGE_RUN_FUNCTION AbrirPasso

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

VIProductVersion "${APP_VERSAO}.0"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductName" "${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileDescription" "Instalador de teste da ${APP_NOME}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "FileVersion" "${APP_VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "ProductVersion" "${APP_VERSAO}"
VIAddVersionKey /LANG=${LANG_PORTUGUESEBR} "LegalCopyright" "Versão de teste"

; Lê o caminho de um programa registrado em "App Paths" (resultado em $0, sem aspas).
!macro LerAppPath EXE
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\${EXE}" ""
  ${If} $0 == ""
    SetRegView 64
    ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\${EXE}" ""
    SetRegView 32
  ${EndIf}
  ${If} $0 == ""
    ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\${EXE}" ""
  ${EndIf}
  StrCpy $2 $0 1
  ${If} $2 == '"'
    StrCpy $0 $0 "" 1
    StrCpy $0 $0 -1
  ${EndIf}
!macroend

; Procura o Chrome primeiro (é o que você usa nos portais) e depois o Edge.
Function AcharNavegador
  StrCpy $Navegador ""

  !insertmacro LerAppPath "chrome.exe"
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0"
    StrCpy $Navegador "$0"
    Return
  ${EndIf}
  ${If} ${FileExists} "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
    StrCpy $Navegador "$PROGRAMFILES64\Google\Chrome\Application\chrome.exe"
    Return
  ${EndIf}
  ${If} ${FileExists} "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe"
    StrCpy $Navegador "$PROGRAMFILES32\Google\Chrome\Application\chrome.exe"
    Return
  ${EndIf}
  ${If} ${FileExists} "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    StrCpy $Navegador "$LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    Return
  ${EndIf}

  !insertmacro LerAppPath "msedge.exe"
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0"
    StrCpy $Navegador "$0"
    Return
  ${EndIf}
  ${If} ${FileExists} "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
    StrCpy $Navegador "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
    Return
  ${EndIf}
  ${If} ${FileExists} "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
    StrCpy $Navegador "$PROGRAMFILES64\Microsoft\Edge\Application\msedge.exe"
  ${EndIf}
FunctionEnd

; Endereço file:/// de um arquivo da pasta de instalação (resultado em $1).
!macro EnderecoLocal ARQUIVO
  ${WordReplace} "$INSTDIR\${ARQUIVO}" "\" "/" "+" $1
  ${WordReplace} "$1" " " "%20" "+" $1
  StrCpy $1 "file:///$1"
!macroend

Function AbrirPasso
  ${If} $Navegador != ""
    Exec '"$Navegador" "$UrlPasso"'
  ${Else}
    ExecShell "open" "$INSTDIR\instalar-extensao.html"
  ${EndIf}
FunctionEnd

Section "Instalar"
  ; Se não der para criar C:\CentralAcionamentos, instala na pasta do usuário.
  ClearErrors
  CreateDirectory "$INSTDIR"
  ${If} ${Errors}
  ${OrIfNot} ${FileExists} "$INSTDIR\*.*"
    StrCpy $INSTDIR "$LOCALAPPDATA\${APP_ID}"
  ${EndIf}

  SetOutPath "$INSTDIR"
  File "build/index.html"
  File "build/icone.ico"
  File "build/instalar-extensao.html"
  SetOutPath "$INSTDIR\extensao"
  File /r "../extensao/*"
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"

  Call AcharNavegador
  !insertmacro EnderecoLocal "instalar-extensao.html"
  StrCpy $UrlPasso $1
  !insertmacro EnderecoLocal "index.html"

  ${If} $Navegador != ""
    ; O painel é a página da extensão, aberta numa janela própria (sem abas nem barra de endereço).
    CreateShortCut "$DESKTOP\${APP_NOME}.lnk" "$Navegador" '--app="${PAINEL_URL}"' "$INSTDIR\icone.ico" 0
    CreateShortCut "$SMPROGRAMS\${APP_NOME}.lnk" "$Navegador" '--app="${PAINEL_URL}"' "$INSTDIR\icone.ico" 0
    CreateShortCut "$SMPROGRAMS\${APP_NOME} (demonstração).lnk" "$Navegador" '--app="$1"' "$INSTDIR\icone.ico" 0
    CreateShortCut "$SMPROGRAMS\Ligar a extensão da Central.lnk" "$Navegador" '"$UrlPasso"' "$INSTDIR\icone.ico" 0
  ${Else}
    CreateShortCut "$DESKTOP\${APP_NOME}.lnk" "$INSTDIR\instalar-extensao.html" "" "$INSTDIR\icone.ico" 0
    CreateShortCut "$SMPROGRAMS\${APP_NOME} (demonstração).lnk" "$INSTDIR\index.html" "" "$INSTDIR\icone.ico" 0
    CreateShortCut "$SMPROGRAMS\Ligar a extensão da Central.lnk" "$INSTDIR\instalar-extensao.html" "" "$INSTDIR\icone.ico" 0
  ${EndIf}

  ; Aparece em Configurações › Aplicativos, com opção de desinstalar.
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "DisplayName" "${APP_NOME} (teste)"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "DisplayVersion" "${APP_VERSAO}"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "DisplayIcon" "$INSTDIR\icone.ico"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${CHAVE_DESINSTALAR}" "NoModify" 1
  WriteRegDWORD HKCU "${CHAVE_DESINSTALAR}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APP_NOME}.lnk"
  Delete "$SMPROGRAMS\${APP_NOME}.lnk"
  Delete "$SMPROGRAMS\${APP_NOME} (demonstração).lnk"
  Delete "$SMPROGRAMS\Ligar a extensão da Central.lnk"
  Delete "$INSTDIR\index.html"
  Delete "$INSTDIR\icone.ico"
  Delete "$INSTDIR\instalar-extensao.html"
  RMDir /r "$INSTDIR\extensao"
  Delete "$INSTDIR\Desinstalar.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${CHAVE_DESINSTALAR}"
SectionEnd
