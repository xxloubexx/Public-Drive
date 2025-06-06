export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"   # Loads nvm


nvm install stable
nvm use stable

cd /root/public-drive

npm install -g npm-check-updates
ncu -u
npm install
node server.js