#!/usr/bin/env bash
# 把 dist/ 打包成可安装的安卓 APK。用法：先 pnpm build，再运行本脚本。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
BUILD="$HERE/build"

ANDROID_JAR="${ANDROID_JAR:-/root/workspace/sdk/android-34/android.jar}"
BUILD_TOOLS="${BUILD_TOOLS:-/usr/lib/android-sdk/build-tools/29.0.3}"
D8_JAR="${D8_JAR:-/root/workspace/sdk/android-14/lib/d8.jar}"
KEYSTORE="${KEYSTORE:-$HERE/keystore.jks}"
KS_PASS="${KS_PASS:-dshchatdemo}"
KS_ALIAS="${KS_ALIAS:-chatdemo}"
VERSION="1.9.0"

for tool in aapt2 zipalign apksigner javac java; do
  command -v "$tool" >/dev/null || { echo "缺少工具：$tool" >&2; exit 1; }
done
[[ -f "$ANDROID_JAR" ]] || { echo "缺少 android.jar：$ANDROID_JAR" >&2; exit 1; }
[[ -d "$ROOT/dist" ]] || { echo "缺少 dist/，请先运行 pnpm build" >&2; exit 1; }

rm -rf "$BUILD" "$HERE/assets"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$HERE/assets/web"
cp -R "$ROOT/dist/." "$HERE/assets/web/"

echo "==> 编译资源"
"$BUILD_TOOLS/aapt2" compile --dir "$HERE/res" -o "$BUILD/res.zip"
"$BUILD_TOOLS/aapt2" link \
  -o "$BUILD/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$HERE/AndroidManifest.xml" \
  -A "$HERE/assets" \
  -R "$BUILD/res.zip" \
  --java "$BUILD/gen" \
  --auto-add-overlay

echo "==> 编译 Java"
javac -source 11 -target 11 -encoding UTF-8 \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD/classes" \
  $(find "$HERE/src" "$BUILD/gen" -name '*.java')

echo "==> 生成 dex"
java -cp "$D8_JAR" com.android.tools.r8.D8 \
  --lib "$ANDROID_JAR" --min-api 27 --output "$BUILD/dex" \
  $(find "$BUILD/classes" -name '*.class')

echo "==> 组装 APK"
python3 - "$BUILD/base.apk" "$BUILD/dex/classes.dex" "$BUILD/unaligned.apk" <<'PY'
import shutil
import sys
import zipfile

source, dex, target = sys.argv[1:4]
shutil.copyfile(source, target)
with zipfile.ZipFile(target, 'a', zipfile.ZIP_DEFLATED) as apk:
    apk.write(dex, 'classes.dex')
PY

"$BUILD_TOOLS/zipalign" -f 4 "$BUILD/unaligned.apk" "$BUILD/aligned.apk"

if [[ ! -f "$KEYSTORE" ]]; then
  echo "==> 生成签名密钥"
  keytool -genkeypair -noprompt \
    -keystore "$KEYSTORE" -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 36500 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=DeepSeek Chat Demo, O=DSH, C=CN"
fi

echo "==> 签名"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --out "$BUILD/DeepSeekChat-$VERSION.apk" \
  "$BUILD/aligned.apk"

"$BUILD_TOOLS/apksigner" verify --print-certs "$BUILD/DeepSeekChat-$VERSION.apk"
ls -lh "$BUILD/DeepSeekChat-$VERSION.apk"
