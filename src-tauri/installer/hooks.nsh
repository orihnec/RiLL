; NSIS 安装钩子：把"改名后的旧版"静默卸掉，并保证用户数据/配置不丢。
;
; 背景：Tauri 的卸载注册表键按产品名生成（旧名 RiliAgent），产品改名成 Rill 后
; 新安装器认不出旧版，只能并排安装。这里在安装前主动卸载旧版。
;
; 数据在哪里：
;   数据库 + 设置   %APPDATA%\com.riliagent.app\riliagent.db（identifier 未变，新旧共用）
;   API Key/授权码  Windows 凭据管理器（卸载器不碰）
; 为了绝对安全，卸载旧版前先把数据目录备份到 %TEMP%\rill-migrate，
; 装完若发现数据目录缺失就还原回来。

!macro NSIS_HOOK_PREINSTALL
  ; ---- 1. 备份现有数据 ----
  ${If} ${FileExists} "$APPDATA\com.riliagent.app\*.*"
    CreateDirectory "$TEMP\rill-migrate"
    CopyFiles /SILENT "$APPDATA\com.riliagent.app\*.*" "$TEMP\rill-migrate"
    DetailPrint "已备份本地数据到 $TEMP\rill-migrate"
  ${EndIf}

  ; ---- 2. 卸载旧产品名（RiliAgent）----
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\RiliAgent" "UninstallString"
  ${If} $R9 == ""
    ReadRegStr $R9 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\RiliAgent" "UninstallString"
  ${EndIf}
  ${If} $R9 == ""
    ReadRegStr $R9 HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\RiliAgent" "UninstallString"
  ${EndIf}

  ${If} $R9 != ""
    DetailPrint "检测到旧版 RiliAgent，正在静默卸载（本地数据会保留）…"
    ExecWait '$R9 /S'
    Sleep 1200
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; ---- 3. 万一数据被旧卸载器删了，还原 ----
  ${IfNot} ${FileExists} "$APPDATA\com.riliagent.app\riliagent.db"
    ${If} ${FileExists} "$TEMP\rill-migrate\riliagent.db"
      CreateDirectory "$APPDATA\com.riliagent.app"
      CopyFiles /SILENT "$TEMP\rill-migrate\*.*" "$APPDATA\com.riliagent.app"
      DetailPrint "已还原本地数据（原有账号 / 求职记录 / 知识库）"
    ${EndIf}
  ${EndIf}
!macroend
