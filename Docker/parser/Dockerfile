FROM node:20-alpine
WORKDIR /usr/src/app/
COPY package*.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
    && test -s node_modules/express/package.json \
    && test -x node_modules/.bin/ts-node
COPY . .
CMD ["npm", "run", "start:parser"]
