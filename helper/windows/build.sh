#!/bin/bash
# 짤 복사 도우미(Windows) 빌드 → dist/JjalCopy.exe
# 리눅스/맥에서도 빌드 가능 (.NET SDK + .NET Framework 4.8 참조 어셈블리 NuGet)
set -euo pipefail
cd "$(dirname "$0")"
DOTNET="${DOTNET:-$(command -v dotnet || echo "$HOME/.dotnet/dotnet")}"
"$DOTNET" build -c Release -o dist/build -nologo -v q
mkdir -p dist
cp dist/build/JjalCopy.exe dist/JjalCopy.exe
rm -rf dist/build
ls -l dist/JjalCopy.exe
