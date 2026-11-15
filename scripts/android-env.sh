# Source me before building the Android app:  source scripts/android-env.sh
# Paths of a user-level install (no sudo): Temurin JDK 21 in ~/.local/share/jdk, SDK in ~/Android/Sdk.
[ -x "$JAVA_HOME/bin/java" ] || JAVA_HOME="$(ls -d "$HOME"/.local/share/jdk/jdk-21* 2>/dev/null | tail -1)"
export JAVA_HOME
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export NDK_HOME="${NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | tail -1)}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$HOME/.cargo/bin:$PATH"
