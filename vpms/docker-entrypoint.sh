#!/bin/sh

echo "Running database migrations..."
# 使用 npx 执行 knex 命令来更新数据库到最新版本
# 修改：knexfile.js 现在位于容器内的 /app/config/ 目录下
npx knex migrate:latest --knexfile /app/config/knexfile.js