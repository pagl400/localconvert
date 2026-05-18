#!/usr/bin/env bash
# Cross-compile libmp3lame 3.100 into a multi-arch xcframework for iOS.
#
# Output: modules/expo-lame/ios/lame.xcframework  (~400 KB, arm64 device + arm64 simulator)
#
# Re-run when:
#   - bumping LAME version
#   - new Xcode major version (typically once per year)
#   - new iOS deployment target
#
# Source provenance:
#   - Tarball: https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz
#   - SHA-256: ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e
#     (the canonical hash distributed by Homebrew, MacPorts, Debian, NixOS)
#   - Project home: https://lame.sourceforge.io/
#   - License: LGPL-2.1 (commercial use permitted with dynamic linking; we ship
#     LAME as static .a inside an xcframework — the LGPL exception clause and
#     Apple's static-only iOS distribution model are an acknowledged grey zone
#     but in practice every iOS MP3 encoder ships this way).
#
# What this script does:
#   1. Downloads the LAME tarball into a temp dir.
#   2. Verifies its SHA-256 against the pinned hash above.
#   3. Cross-compiles libmp3lame for: arm64 device, arm64 simulator.
#   4. Bundles both slices into a single lame.xcframework.
#   5. Copies the xcframework to modules/expo-lame/ios/.

set -euo pipefail

readonly LAME_VERSION="3.100"
readonly LAME_SHA256="ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e"
readonly LAME_URL="https://downloads.sourceforge.net/project/lame/lame/${LAME_VERSION}/lame-${LAME_VERSION}.tar.gz"
readonly IOS_MIN_VERSION="14.0"

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly DEST_DIR="${REPO_ROOT}/modules/expo-lame/ios"
readonly WORK_DIR="$(mktemp -d -t lame-build)"
trap 'rm -rf "$WORK_DIR"' EXIT

readonly TARBALL="${WORK_DIR}/lame-${LAME_VERSION}.tar.gz"
readonly SRC_DIR="${WORK_DIR}/lame-${LAME_VERSION}"

log() { printf '[build-lame] %s\n' "$*" >&2; }
fail() { printf '[build-lame] ERROR: %s\n' "$*" >&2; exit 1; }

# Step 1: Download and verify.
log "downloading LAME ${LAME_VERSION} …"
curl -sSL -o "$TARBALL" "$LAME_URL" || fail "could not download LAME source"

log "verifying SHA-256 …"
actual="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
if [[ "$actual" != "$LAME_SHA256" ]]; then
  fail "SHA-256 mismatch — expected ${LAME_SHA256}, got ${actual}"
fi
log "  ✓ source matches pinned hash"

tar -xzf "$TARBALL" -C "$WORK_DIR"
[[ -d "$SRC_DIR" ]] || fail "extraction failed — ${SRC_DIR} missing"

# Step 2: Build one architecture.
# Each invocation produces ${WORK_DIR}/install-${tag}/lib/libmp3lame.a plus
# headers/.
build_arch() {
  local sdk="$1"        # iphoneos or iphonesimulator
  local arch="$2"       # arm64 (we don't ship x86_64 simulator anymore)
  local tag="$3"        # short identifier for paths
  local host_triple="$4"

  local sdk_path
  sdk_path="$(xcrun --sdk "$sdk" --show-sdk-path)"

  local min_flag="-mios-version-min=${IOS_MIN_VERSION}"
  if [[ "$sdk" == "iphonesimulator" ]]; then
    min_flag="-mios-simulator-version-min=${IOS_MIN_VERSION}"
  fi

  # -O2 is LAME's recommended optimisation level.
  # Clang 16+ (Xcode 15) promotes implicit-function-declaration to an error,
  # which trips LAME's pre-C99 mpglib (memcpy/bcopy redefinition without
  # <strings.h>). Downgrade those two warnings back to non-fatal — the code
  # itself is correct and has shipped this way for 20+ years.
  local cflags="-arch ${arch} -isysroot ${sdk_path} ${min_flag} -O2 -fno-common \
    -Wno-error=implicit-function-declaration \
    -Wno-error=int-conversion"
  local prefix="${WORK_DIR}/install-${tag}"
  local build="${WORK_DIR}/build-${tag}"

  mkdir -p "$build"
  log "building ${tag} (${sdk}, ${arch}) …"

  (
    cd "$build"

    CC="$(xcrun --sdk "$sdk" --find clang)" \
    CFLAGS="$cflags" \
    LDFLAGS="$cflags" \
      "$SRC_DIR/configure" \
        --host="$host_triple" \
        --prefix="$prefix" \
        --disable-shared \
        --enable-static \
        --disable-frontend \
        --disable-decoder \
        --disable-analyzer-hooks \
        --disable-gtktest \
        --disable-dependency-tracking \
        --disable-debug \
      >"${build}/configure.log" 2>&1 \
      || { tail -40 "${build}/configure.log"; fail "configure failed for ${tag}"; }

    make -j"$(sysctl -n hw.ncpu)" >"${build}/make.log" 2>&1 \
      || { tail -40 "${build}/make.log"; fail "make failed for ${tag}"; }

    make install >"${build}/install.log" 2>&1 \
      || { tail -40 "${build}/install.log"; fail "install failed for ${tag}"; }
  )

  log "  ✓ ${tag} ready ($(du -h "${prefix}/lib/libmp3lame.a" | awk '{print $1}'))"
}

build_arch iphoneos        arm64  ios-arm64        arm-apple-darwin
build_arch iphonesimulator arm64  sim-arm64        arm-apple-darwin

# Step 3: Bundle the slices into an xcframework.
# Each library_path points at a directory containing libmp3lame.a + the headers
# its callers need.
# NOTE: we deliberately do NOT add a module.modulemap inside the xcframework
# slices. Each slice would contribute its own copy of the `lame` clang module,
# which Release builds reject as "redefinition of module 'lame'" (Debug is
# permissive). Instead, the Swift wrapper imports LAME through an ObjC bridge
# file in the Pod, which #includes <lame/lame.h> directly — no clang module
# needed, header is found via HEADER_SEARCH_PATHS.

readonly XCF_OUT="${WORK_DIR}/lame.xcframework"
rm -rf "$XCF_OUT"

xcodebuild -create-xcframework \
  -library "${WORK_DIR}/install-ios-arm64/lib/libmp3lame.a" \
    -headers "${WORK_DIR}/install-ios-arm64/include" \
  -library "${WORK_DIR}/install-sim-arm64/lib/libmp3lame.a" \
    -headers "${WORK_DIR}/install-sim-arm64/include" \
  -output "$XCF_OUT" \
  >"${WORK_DIR}/xcframework.log" 2>&1 \
  || { tail -40 "${WORK_DIR}/xcframework.log"; fail "xcframework creation failed"; }

# Step 4: Stage into the module.
mkdir -p "$DEST_DIR"
rm -rf "${DEST_DIR}/lame.xcframework"
mv "$XCF_OUT" "${DEST_DIR}/lame.xcframework"

# Also drop a tiny LICENSE notice next to the binary so the LGPL credit is
# always shipped with the framework.
cp "${SRC_DIR}/LICENSE" "${DEST_DIR}/lame.xcframework/LICENSE"
cp "${SRC_DIR}/COPYING" "${DEST_DIR}/lame.xcframework/COPYING"

size="$(du -sh "${DEST_DIR}/lame.xcframework" | awk '{print $1}')"
log "✓ wrote lame.xcframework → ${DEST_DIR} (${size})"
log "  arch slices:"
find "${DEST_DIR}/lame.xcframework" -name '*.a' -exec lipo -info {} \; >&2
