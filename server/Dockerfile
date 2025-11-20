# Giai đoạn 1: Build ứng dụng React
FROM node:18 as build
WORKDIR /usr/src/app

# Sao chép package.json của client trước để tận dụng cache
COPY client/package*.json ./client/ 
RUN cd client && npm install

# Sao chép toàn bộ source code của client
COPY client/ ./client/ 
RUN cd client && npm run build

# Giai đoạn 2: Build server Node.js
FROM node:18
WORKDIR /usr/src/app

# Cài đặt các gói cần thiết cho sshpass và biên dịch node-pty
RUN apt-get update && apt-get install -y \
    sshpass \
    openssh-client \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*
    
# Sao chép package.json của server trước
COPY server/package*.json ./ 
RUN npm install

# Sao chép source code của server
COPY server/ . 

# Sao chép các file đã build từ giai đoạn 1
COPY --from=build /usr/src/app/client/build ./client/build

RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh
RUN if [ -f /root/.ssh/id_rsa ]; then chmod 600 /root/.ssh/id_rsa; fi

EXPOSE 80
EXPOSE 443
CMD [ "node", "server.js" ]
