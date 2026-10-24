#!/bin/bash
# Drives the real Blaze.app binary through the look tour and screenshots each state with screencapture.
OUT="$PWD/shots"; mkdir -p "$OUT"; H="$RUNNER_TEMP/blzhome"; mkdir -p "$H"
export BLAZE_LOOK_TOUR="$OUT" BLAZE_LOOK_QUIT=1 BLAZE_HOME="$H/.blaze"
system_profiler SPDisplaysDataType > "$OUT/displays.txt" 2>&1
( cd "$H" && "$GITHUB_WORKSPACE/build/bin/Blaze.app/Contents/MacOS/Blaze" > "$OUT/app.log" 2>&1 ) &
APP=$!
n=0; t0=$(date +%s)
while :; do
  if [ -f "$OUT/ready" ]; then
    name=$(cat "$OUT/ready"); rm -f "$OUT/ready"
    [ "$name" = finished ] && break
    screencapture -x -t png "$OUT/.cap.png" 2>>"$OUT/capture.err"
    cp "$OUT/.cap.png" "$OUT/full-$name.png" 2>/dev/null
    mv "$OUT/.cap.png" "$OUT/$name.png" 2>/dev/null || touch "$OUT/$name.done"
    n=$((n+1))
  fi
  kill -0 $APP 2>/dev/null || { echo "app exited"; break; }
  [ $(( $(date +%s) - t0 )) -gt 2500 ] && { echo timeout; break; }
  sleep 0.1
done
sleep 1; kill $APP 2>/dev/null
echo "TOUR_DONE shots=$n"
