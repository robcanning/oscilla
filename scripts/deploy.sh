#!/bin/bash

# Define variables
REMOTE_USER="root"
REMOTE_HOST="167.172.165.26"
REMOTE_DIR="/var/www/html/rotula"
BRANCH="master"

# SSH into the server
ssh "$REMOTE_USER@$REMOTE_HOST" << EOF
set -e  # Exit on any error

# Navigate to the project directory
cd $REMOTE_DIR

# Initialize Git if not already initialized
if [ ! -d .git ]; then
  echo "Initializing Git repository..."
  git init
  git remote add origin https://git.kompot.si/rob/rotula.score.git
fi

# Fetch updates from the remote repository
echo "Fetching updates from remote repository..."
git fetch origin $BRANCH

# Create or switch to the local branch and set upstream
if ! git rev-parse --verify $BRANCH > /dev/null 2>&1; then
  echo "Creating local branch $BRANCH..."
  git checkout -b $BRANCH
else
  echo "Switching to branch $BRANCH..."
  git checkout $BRANCH
fi

# Set the branch to track the remote branch
echo "Setting upstream branch..."
git branch --set-upstream-to=origin/$BRANCH $BRANCH

# Reset the local branch to match the remote branch
echo "Resetting local branch to match remote..."
git reset --hard origin/$BRANCH

# install dependencies
npm install

# Restart the PM2 process
echo "Restarting application with PM2..."
pm2 restart rotula.score || pm2 start server.js --name rotula.score
EOF

echo "Deployment completed successfully."
