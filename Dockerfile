FROM docker.io/library/node:16

ARG VCS_REF=master
ARG BUILD_DATE
ARG REGISTRY_PATH=docker.io/paritytech

# metadata
LABEL io.parity.image.authors="devops-team@parity.io" \
	io.parity.image.vendor="Parity Technologies" \
	io.parity.image.title="${REGISTRY_PATH}/polkadot-runtime-prom-exporter" \
	io.parity.image.description="Prometheus exporter for polkadot runtime metrics." \
	io.parity.image.source="https://github.com/paritytech/polkadot-runtime-prom-exporter/\
blob/${VCS_REF}/Dockerfile" \
	io.parity.image.documentation="https://github.com/paritytech/polkadot-runtime-prom-exporter/\
blob/${VCS_REF}/README.md" \
	io.parity.image.revision="${VCS_REF}" \
	io.parity.image.created="${BUILD_DATE}"

# set workdir
WORKDIR /usr/src/polkadot-prom-exporter

# copy and install deps
COPY package*.json ./
RUN yarn

# copy source and build it
COPY . .
RUN yarn run build

CMD [ "node", "./build/index.js" ]
