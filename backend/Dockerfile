FROM php:8.3-fpm-alpine AS runtime
RUN apk add --no-cache ca-certificates curl libcurl libpq libxml2 nginx oniguruma supervisor \
 && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS curl-dev libpq-dev libxml2-dev linux-headers oniguruma-dev \
 && docker-php-ext-install curl dom mbstring opcache pdo_pgsql \
 && pecl install excimer \
 && docker-php-ext-enable excimer \
 && echo "zend.exception_ignore_args=Off" > /usr/local/etc/php/conf.d/99-sentry.ini \
 && apk del .build-deps

FROM runtime AS vendor
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --prefer-dist --no-interaction \
 && composer check-platform-reqs --no-dev

FROM runtime
WORKDIR /var/www/html
COPY --from=vendor /app/vendor ./vendor
COPY . .
COPY docker/nginx.conf /etc/nginx/backend.conf
COPY docker/supervisord.conf /etc/supervisord.conf
RUN mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache \
 /tmp/nginx/{client_temp,proxy_temp,fastcgi_temp,uwsgi_temp,scgi_temp} \
 && chown -R www-data:www-data storage bootstrap/cache /tmp/nginx
RUN mkdir -p /var/log/nginx /run/nginx \
    && chown -R www-data:www-data /var/log/nginx /run/nginx \
    && chown www-data:www-data /var/lib/nginx
RUN php artisan package:discover --ansi
RUN chmod -R a+rX app bootstrap config public routes \
 && chmod a+r artisan composer.json composer.lock \
 && true
USER www-data
EXPOSE 8000
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
