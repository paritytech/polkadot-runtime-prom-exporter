FROM node:14

# set workdir
WORKDIR /usr/src/polkadot-prom-exporter

# copy and install deps
COPY package*.json ./
RUN yarn

# copy source and build it
COPY . .
RUN yarn run build

CMD [ "node", "./build/index.js" ]
