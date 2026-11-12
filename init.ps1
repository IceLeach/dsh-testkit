param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$testHome = Join-Path $root 'home'
New-Item -ItemType Directory -Path $testHome -Force | Out-Null

$cred = Join-Path $env:USERPROFILE '.dsh\.credentials.yaml'
if (-not (Test-Path -LiteralPath $cred)) {
    throw "找不到登录态：$cred"
}

Copy-Item -LiteralPath $cred -Destination (Join-Path $testHome '.credentials.yaml') -Force
Write-Output "已复制登录态 -> $testHome\.credentials.yaml"

$env:DSH_HOME = $testHome
& dsh --profile headless --help *> $null
Write-Output "已初始化 headless profile：$testHome\profiles\headless"
Write-Output "testkit home 就绪：$testHome"
