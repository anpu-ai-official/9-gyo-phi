$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "work/llama.cpp"
$Build = Join-Path $Root "work/llama-build-x86_64"
$Output = Join-Path $Root "src-tauri/binaries"
$Commit = "9113cc1880763bf590774490f51a661bf22403a4"

if ($env:PROCESSOR_ARCHITECTURE -ne "AMD64") {
  throw "The first Windows release target is x86_64. Found $env:PROCESSOR_ARCHITECTURE."
}
if (-not (Test-Path (Join-Path $Source ".git"))) {
  git clone --filter=blob:none https://github.com/ggml-org/llama.cpp.git $Source
}
git -C $Source fetch --depth 1 origin $Commit
git -C $Source checkout --detach $Commit
cmake -S $Source -B $Build -A x64 `
  -DCMAKE_BUILD_TYPE=Release `
  -DGGML_NATIVE=OFF `
  -DGGML_OPENMP=OFF `
  -DGGML_METAL=OFF `
  -DLLAMA_BUILD_SERVER=ON `
  -DLLAMA_BUILD_TESTS=OFF `
  -DLLAMA_BUILD_EXAMPLES=OFF `
  -DLLAMA_BUILD_APP=OFF `
  -DLLAMA_BUILD_UI=OFF `
  -DLLAMA_USE_PREBUILT_UI=OFF `
  -DLLAMA_OPENSSL=OFF `
  -DBUILD_SHARED_LIBS=OFF
cmake --build $Build --config Release --target llama-server --parallel
New-Item -ItemType Directory -Force -Path $Output | Out-Null
$Candidates = @(
  (Join-Path $Build "bin/Release/llama-server.exe"),
  (Join-Path $Build "bin/llama-server.exe")
)
$Binary = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Binary) { throw "The llama-server build completed without an executable." }
Copy-Item $Binary (Join-Path $Output "llama-server-x86_64-pc-windows-msvc.exe") -Force
Write-Host "Native engine ready for x86_64-pc-windows-msvc"
