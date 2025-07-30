# Dockerfile
# 使用官方 Node.js 18 LTS Alpine 映像作為基礎映像，它體積小且安全
FROM node:18-alpine

# 將容器內的工作目錄設定為 /app
WORKDIR /app

# 將 package.json 和 package-lock.json (如果存在) 複製到工作目錄
# 這有助於利用 Docker 的層緩存，如果依賴沒有改變，則不會重新安裝
COPY package*.json ./

# 安裝 bash，因為 Alpine 映像可能預設不包含它
RUN apk add --no-cache bash

# 移除不再需要的 Python 环境
# RUN apk add --no-cache python3 py3-pip

# 安裝 Node.js 依賴
# --omit=dev 表示不安裝開發依賴，以減小生產映像的大小
RUN npm install --omit=dev

# 將應用程式的其餘程式碼複製到容器中
# '.' 表示當前目錄 (Docker build context)
COPY . .

# --- 新增：复制入口脚本并赋予执行权限 ---
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
# --- 新增结束 ---

# 暴露應用程式運行的端口 (在 server.js 中設定為 3000)
EXPOSE 3000

# 定義容器啟動時執行的命令
# 这个命令现在会被传递给 docker-entrypoint.sh 脚本
CMD ["npm", "start"]
