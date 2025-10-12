#!/bin/bash

echo "🚀 Deploying 10 local oscillaScore server instances via PM2..."

for i in {0..9}
do

  pm2 delete oscillaScore_$i >/dev/null 2>&1

  WS_PORT=$((8000 + i))
  OSC_IN=$((57121 + i * 2))
  OSC_OUT=$((57120 + i * 2))

  NAME="oscillaScore_$i"

  echo "🔧 Starting $NAME (WS: $WS_PORT, OSC IN: $OSC_IN, OSC OUT: $OSC_OUT)"

  pm2 start server.js --name "$NAME" -- \
    --port=$WS_PORT --osc-in=$OSC_IN --osc-out=$OSC_OUT

done

echo "✅ All instances launched. Use 'pm2 ls' to view status."
