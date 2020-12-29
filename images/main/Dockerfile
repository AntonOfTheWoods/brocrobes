# vim:set ft=dockerfile
FROM node:fermium

WORKDIR /app

COPY ./src /app
COPY ./scripts /app/scripts

RUN pip install -r requirements.txt

CMD ["/bin/bash", "/app/scripts/runserver.sh"]
