FROM node:20-alpine

# install net tools and jq - needed for aws ecs task id
RUN apk add --no-cache curl jq net-tools

WORKDIR /nemo3-api-fms-svc

COPY . .

ARG APP_ENV
ENV APP_ENV=${APP_ENV}
RUN echo "APP_ENV: ${APP_ENV}"

RUN npm install

EXPOSE 10004

COPY startup-script.sh /usr/local/bin/startup-script.sh
RUN chmod +x /usr/local/bin/startup-script.sh
ENTRYPOINT ["/usr/local/bin/startup-script.sh"]

CMD ["node", "index.js"]
