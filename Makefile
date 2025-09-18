
SHELL := /bin/sh

COMPOSE_DEV := ./deployment/docker-compose.dev.yml
COMPOSE_PROD := ./deployment/docker-compose.yml

.PHONY: dev-up dev-rebuild dev-down dev-logs \
        prod-up prod-rebuild prod-reload prod-down prod-logs \
        cert-issue-webroot cert-issue-standalone cert-renew \
        build-images

dev-up:
	docker compose -f $(COMPOSE_DEV) up -d

dev-rebuild:
	docker compose -f $(COMPOSE_DEV) up -d --build --force-recreate

dev-down:
	docker compose -f $(COMPOSE_DEV) down --volumes --remove-orphans

dev-logs:
	docker compose -f $(COMPOSE_DEV) logs -f

prod-up:
	docker compose -f $(COMPOSE_PROD) up -d

prod-rebuild:
	docker compose -f $(COMPOSE_PROD) up -d --build --force-recreate

prod-reload:
	docker compose -f $(COMPOSE_PROD) exec nginx nginx -s reload

prod-down:
	docker compose -f $(COMPOSE_PROD) down --volumes --remove-orphans

prod-logs:
	docker compose -f $(COMPOSE_PROD) logs -f

cert-issue-webroot:
	[ -n "$(DOMAIN)" ] && [ -n "$(EMAIL)" ]
	docker compose -f $(COMPOSE_PROD) up -d nginx
	docker compose -f $(COMPOSE_PROD) run --rm certbot certonly --webroot -w /var/www/html -d $(DOMAIN) -m $(EMAIL) --agree-tos --no-eff-email
	docker compose -f $(COMPOSE_PROD) exec nginx nginx -s reload

cert-issue-standalone:
	[ -n "$(DOMAIN)" ] && [ -n "$(EMAIL)" ]
	docker compose -f $(COMPOSE_PROD) stop nginx
	docker compose -f $(COMPOSE_PROD) run --rm --service-ports certbot certonly --standalone -d $(DOMAIN) -m $(EMAIL) --agree-tos --no-eff-email
	docker compose -f $(COMPOSE_PROD) up -d nginx
	docker compose -f $(COMPOSE_PROD) exec nginx nginx -s reload

cert-renew:
	docker compose -f $(COMPOSE_PROD) run --rm certbot renew
	docker compose -f $(COMPOSE_PROD) exec nginx nginx -s reload

build-images:
	@echo "Creating directory for images..."
	mkdir -p ./dist
	@echo "Getting git hash..."
	$(eval GIT_HASH := $(shell git rev-parse --short HEAD 2>/dev/null || echo "latest"))
	$(eval API_TAG := inventorius-api:$(GIT_HASH))
	$(eval FRONTEND_TAG := inventorius-frontend:$(GIT_HASH))
	@echo "Building API image with tag $(API_TAG)..."
	docker build -t $(API_TAG) ./inventorius-api
	docker tag $(API_TAG) inventorius-api:latest
	@echo "Building Frontend image with tag $(FRONTEND_TAG)..."
	docker build -t $(FRONTEND_TAG) ./inventorius-frontend
	docker tag $(FRONTEND_TAG) inventorius-frontend:latest
	@echo "Saving images to tar files..."
	docker save inventorius-api:latest | gzip > ./dist/inventorius-api.tar.gz
	docker save inventorius-frontend:latest | gzip > ./dist/inventorius-frontend.tar.gz
	@echo "Images built and saved to ./dist/"
