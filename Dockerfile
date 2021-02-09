FROM node:10.17.0-alpine

WORKDIR /usr/src/app

RUN npm i typescript -g

COPY ./package.json ./
COPY ./tsconfig.json ./
COPY ./src ./src

RUN npm i && \
    npm run build && \
    rm -rf node_modules && \
    rm -rf src && \
    rm tsconfig.json && \
    npm i --only=prod && \
    rm package-lock.json && \
    npm uninstall typescript -g

VOLUME ["/usr/src/app/logs", "/usr/src/app/data"]

CMD ["npm", "start"]