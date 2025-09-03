~/.local/node_modules/pm2/bin/pm2 stop oscillaScore
~/.local/node_modules/pm2/bin/pm2 start ../server.js --name "oscillaScore" -- \
    --port=4899 --osc-in=57121 --osc-out=57121
