#!/bin/sh
# 如果任何命令失败，立即退出脚本
set -e

# 等待数据库准备就绪是一个好习惯，但为了简化，我们先直接运行迁移
# 在生产环境中，这里可能需要一个循环来等待数据库连接成功

echo "Running database migrations..."
# 使用 npx 执行 knex 命令来更新数据库到最新版本
# 修改：knexfile.js 现在位于容器内的 /app/config/ 目录下
npx knex migrate:latest --knexfile /app/config/knexfile.js

# 迁移完成后，执行 Dockerfile 中 CMD 定义的命令 (即 "npm start")
echo "Migrations complete. Starting application..."
exec "$@"