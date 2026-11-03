# 部署到群晖 NAS（DS923+ / Container Manager）

## 结论

可以。DS923+ 是 x86_64（AMD Ryzen R1600，2 核 / 4GB，可扩展），DSM 7.2 的 Container Manager 支持本项目所需的 Docker Compose 部署。运行时占用不高，主要压力在 NAS 上首次构建前端（Vite）时的内存；如果构建失败，可以在电脑上构建镜像后导入 NAS。

仓库已包含：

- `Dockerfile`：Node 24 + pnpm 11，构建前端并由 Hono 服务端同端口托管。
- `docker-compose.yml`：端口、重启策略、健康检查、AI 环境变量。
- 项目数据仍保存在**每个浏览器**的 IndexedDB；NAS 只托管应用与 AI 代理，不做账号/集中存储。

## 一、准备

1. DSM 安装 **Container Manager**。
2. 在 NAS 上创建共享文件夹（例如 `docker`），把本项目完整复制到 `/volume1/docker/hdesign`（File Station 上传压缩包后解压即可）。
3. 在项目目录放一份 `.env`（从 `.env.example` 复制），至少填入 DeepSeek 密钥：
   ```
   AI_API_KEY=sk-...
   # 可选
   AI_BASE_URL=https://api.deepseek.com
   AI_MODEL=deepseek-flash
   ```
   这个文件不会被烘进镜像，也不会提交到 Git。
4. 局域网访问需要在 DSM 防火墙放行端口（默认 `8791`）。

## 二、部署（二选一）

### 方式 A：SSH 构建（推荐，最直接）

```bash
# 在 NAS 上
cd /volume1/docker/hdesign
sudo docker compose up -d --build
sudo docker compose logs -f
```

若系统没有 compose 插件：

```bash
sudo /usr/local/bin/docker-compose up -d --build
```

看到健康检查通过后访问：

```
http://<NAS-IP>:8791
```

健康检查：`curl http://127.0.0.1:8791/api/health`。

### 方式 B：Container Manager 项目界面

1. Container Manager → **项目** → **新增**。
2. 项目名称 `hdesign`，路径选择 `/docker/hdesign`，选择该目录下的 `docker-compose.yml`。
3. 若界面提供「构建」选项，勾选后启动；否则先在 SSH 里执行一次 `sudo docker compose build`，再在界面启动。
4. 环境变量由同目录 `.env` 提供；也可以在项目设置里直接添加 `AI_API_KEY` 等变量。

### 方式 C：在电脑上构建后导入（NAS 内存紧张时）

```bash
# 在装有 Docker 的电脑上（Apple Silicon 必须指定 amd64）
docker buildx build --platform linux/amd64 -t hdesign:latest .
docker save hdesign:latest | gzip > hdesign-amd64.tar.gz
```

把 `hdesign-amd64.tar.gz` 上传到 NAS 后：

```bash
gunzip -c hdesign-amd64.tar.gz | sudo docker load
cd /volume1/docker/hdesign
sudo docker compose up -d --no-build
```

## 三、局域网与远程访问

- 局域网：`http://<NAS-IP>:8791` 即可使用。
- 远程/HTTPS：DSM → 控制面板 → 登录门户 → 高级 → **反向代理**：
  - 来源：`https://design.example.com:443`
  - 目标：`http://127.0.0.1:8791`
  - 自定义 Nginx 配置建议：
    ```nginx
    client_max_body_size 20m;
    proxy_read_timeout 3600s;
    proxy_buffering off;
    ```
    `proxy_buffering off` 用于保证 AI 对话的流式输出；`client_max_body_size` 覆盖图纸上传。
- **安全提醒**：应用本身没有账号体系。不要直接把 8791 端口映射到公网；优先使用 Tailscale / 群晖 VPN / 局域网访问，或在反向代理层限制来源 IP、增加 Basic Auth。

## 四、资源与常见问题

| 问题 | 处理 |
| --- | --- |
| 8791 被占用 | 在 `.env` 设置 `HDESIGN_PORT=8080` 后重新启动，访问 `http://NAS-IP:8080` |
| 构建时内存不足或被杀 | 用方式 C 在电脑上构建后导入；或给 NAS 增加内存 |
| 页面能开但 AI 一直转圈 | 检查 NAS 是否能访问 `api.deepseek.com`；反向代理关闭 buffering 并放宽 read timeout |
| 上传图纸失败 | 反向代理 `client_max_body_size` 至少 20m；单次 API 图片上限 12MB |
| 健康检查失败 | `sudo docker compose logs hdesign`；确认容器内端口为 8791 |
| 升级版本 | 替换项目文件后 `sudo docker compose up -d --build` |

## 五、数据说明

- NAS 上不保存你的方案文件；方案在浏览器 IndexedDB。换浏览器/设备不会自动同步。
- 重要方案请在应用内「导出项目包」（`.hdz`，含底图）备份到 NAS 或网盘。
- AI 密钥只存在 NAS 的环境变量中；浏览器不会拿到密钥。
- 若需要多人共享项目、账号登录与集中存储，需要在此版本基础上增加服务端数据库与鉴权，属于后续开发项。
