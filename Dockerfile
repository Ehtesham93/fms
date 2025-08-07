FROM node:20-alpine

WORKDIR /nemo3-api-fms-svc

COPY . .

ARG APP_ENV
ENV APP_ENV=${APP_ENV}
RUN echo "APP_ENV: ${APP_ENV}"

RUN npm install

EXPOSE 10004

CMD ["node", "index.js"]

