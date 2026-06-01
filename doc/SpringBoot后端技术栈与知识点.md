# liu-blog 若采用 Spring Boot 后端：技术栈与知识点清单

## 文档说明

本文档面向 **将当前 Node.js（Express）本地文件存储后端迁移或等价重写为 Spring Boot** 的场景，基于现有需求与已实现能力整理：

- 主需求：`doc/需求.md`（双区存储、`blog-index.json`、7+ 个 REST 接口）
- 扩展需求：`doc/upload需求.md`（批量 Markdown / 文件夹导入）

原则：**能用 JDK / Spring 生态 / 成熟开源库解决的，不要自研**（不自己写 HTTP 服务器、JSON 解析器、multipart 解析、线程池、配置加载器等）。

前端仍为 Vue3 + md-editor-v3，**接口路径与 JSON 结构应尽量与现网 Node 版一致**，仅替换后端实现。

---

## 一、与当前 Node 后端的职责对照

| 能力 | 当前 Node 实现要点 | Spring Boot 侧对应 |
|------|-------------------|-------------------|
| REST API | Express Router | **Spring Web**（`@RestController`） |
| 跨域 | `cors` 中间件 | **`WebMvcConfigurer#addCorsMappings`** 或 `@CrossOrigin` |
| JSON 请求体 | `express.json` | **Jackson**（Starter Web 自带） |
| 文件上传 | `multer` memoryStorage | **`MultipartFile`** + `spring.servlet.multipart.*` |
| 静态资源 | `/storage` 路径校验后 `sendFile` | **`ResourceHttpRequestHandler`** 或专用 Controller + `PathResource` |
| 本地存储 | `fs/promises` | **`java.nio.file`**（首选）；辅助可用 **Apache Commons IO** |
| 索引与元数据 | 读写 `blog-index.json`、`meta.json` | **Jackson** 映射 POJO，勿手写 JSON 字符串拼接 |
| 配置 | `config.js` | **`application.yml` + `@ConfigurationProperties`** |
| 启动初始化 | `initStorage()` | **`ApplicationRunner` / `@PostConstruct`** |
| 健康检查 | `GET /api/health` | **Spring Boot Actuator** `health` 端点（可保留原路径作兼容） |
| 业务编排 | `blogService` / `importService` | **Service 层**；复杂导入逻辑放独立 `ImportService` |
| 路径安全 | `assertSafeArticlePath`、禁止 `..` | **`Path#normalize` + `startsWith`**；可参考 **Commons IO `FilenameUtils`** |
| ID 生成 | `crypto.randomUUID` | **`UUID.randomUUID()`** |
| 统一响应 | `{ code, data, message }` | 定义 **`ApiResponse<T>`** + 可选 **`@RestControllerAdvice`** |

存储模型**仍为无数据库、纯本地文件**，因此 **不需要 JPA / MyBatis**（除非未来改版加库）。

---

## 二、必备 Maven 依赖（不造轮子清单）

### 2.1 核心（必选）

```xml
<!-- Web：REST、Jackson、内嵌 Tomcat、Multipart -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<!-- 参数校验：标题必填、枚举 status/saveMode 等 -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-validation</artifactId>
</dependency>

<!-- 健康检查、可选 metrics -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

### 2.2 推荐辅助（按需引入，仍属成熟库）

| 依赖 | 用途 | 不要自己实现 |
|------|------|----------------|
| **commons-io** | 目录复制、递归删除、`FileUtils` | 手写递归删目录 |
| **commons-lang3** | `StringUtils` 判空、截断 | 重复工具方法 |
| **lombok** | `@Data`、`@Slf4j` 减样板代码 | 大量 getter/setter |
| **springdoc-openapi** | Swagger UI / OpenAPI 文档 | 手写接口文档站点 |
| **mapstruct**（可选） | DTO ↔ 领域对象转换 | 超长手动赋值 |

### 2.3 本期一般不需要

| 依赖 | 原因 |
|------|------|
| spring-boot-starter-data-jpa | 当前无数据库 |
| spring-boot-starter-security | 暂无登录；若以后加鉴权再引入 |
| 自研 JSON 索引引擎 | `blog-index.json` 用 Jackson 读写即可 |
| Netty / Vert.x 单独搭 HTTP | Spring Boot 已内嵌 Servlet 容器 |

### 2.4 导入与 Markdown 相关

当前 Node 版对 Markdown 的图片引用替换以 **正则** 为主（`![]()`、`<img src>`），**不必**为迁 Java 强行引入完整 Markdown AST 库。

| 场景 | 建议 |
|------|------|
| 保持与现网一致 | 继续用正则或抽成小工具类（与 `importService.js` 同逻辑） |
| 以后要解析 AST、扩展语法 | 再考虑 **commonmark-java** 或 **flexmark**，不要自写 Markdown 语法树 |

图片类型校验：扩展名白名单 + **`MultipartFile#getSize`** 即可；若要 MIME 检测可用 **Apache Tika**（可选），不必自研文件魔数库。

---

## 三、需要掌握的 Spring Boot / Java 知识点

### 3.1 基础与项目结构

- **Spring Boot 自动配置**：`@SpringBootApplication`、Starter 机制、`application.yml` 优先级
- **分层架构**：`controller` → `service` → `repository`（此处 repository = **文件仓储**，非 DB）
- **依赖注入**：构造器注入（推荐）、`@Service` / `@Component`
- **Java 17+**（建议 LTS）：`record`（可选用于不可变 DTO）、`Files`、`Path`、`StandardCopyOption`

推荐包结构示例：

```
com.example.liublog
├── LiublogApplication.java
├── config/          # BlogProperties、WebMvc、Cors
├── controller/      # BlogController、StorageController
├── dto/             # SaveArticleRequest、ListQuery、ApiResponse
├── domain/          # ArticleMeta、BlogIndex、ArticleIndexEntry
├── service/         # BlogService、IndexService、ImportService
├── repository/      # FileArticleRepository、IndexFileRepository
└── util/            # FolderNameUtils、PathSecurityUtils
```

### 3.2 Web 层

- **`@RestController`、`@RequestMapping`、`@GetMapping` / `@PostMapping` / `@DeleteMapping`**
- **`@RequestParam`**：列表分页 `page`、`size`、`status`、`keyword`、`source`
- **`@PathVariable`**：`/detail/{id}`、`/delete/{id}`
- **`@RequestBody`**：保存文章 JSON；配合 **`@Valid`**
- **`MultipartFile`、`@RequestParam("files") MultipartFile[]`**：导入与图片上传
- **`ResponseEntity`**：404 / 400 / 500 与 Node 版 `code` 字段对齐
- **全局异常处理**：`@RestControllerAdvice` + `@ExceptionHandler`，映射 `statusCode` 业务异常

需实现的接口（与现网对齐，见 `doc/需求.md`、`doc/上传需求.md`）：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/blog/list` | GET | 读索引后内存分页/筛选/搜索 |
| `/api/blog/index` | GET | 返回完整索引 |
| `/api/blog/rebuild-index` | POST | 扫描 `saved`、`temp_drafts` 重建 |
| `/api/blog/detail/{id}` | GET | 读 `content.md` + `meta.json` |
| `/api/blog/save` | POST | 自动/手动保存、标题改名、清临时目录 |
| `/api/blog/delete/{id}` | DELETE | 删目录 + 更新索引 |
| `/api/blog/upload/img` | POST | multipart：`file` + `articleId` |
| `/api/blog/import` | POST | multipart + `mode`、`paths`、`folderName` 等 |
| `/storage/**` | GET | 静态资源，防目录穿越 |
| `/api/health` 或 Actuator | GET | 存活探测 |

### 3.3 配置

- **`@ConfigurationProperties(prefix = "blog")`** 绑定：

```yaml
blog:
  blog-root-dir: ./blog_storage
  saved-dir-name: saved
  temp-draft-dir-name: temp_drafts
  index-file-name: blog-index.json
  auto-create-dir: true
  import-max-files: 20
  import-max-md-size: 2097152
  # ... 与 server/config.js 字段一一对应
server:
  port: 3001
spring:
  servlet:
    multipart:
      max-file-size: 5MB
      max-request-size: 60MB
```

- **`@EnableConfigurationProperties`**，避免到处读 `Environment` 字符串

### 3.4 文件系统与并发（核心业务）

必须理解并实现（与 Node 版等价）：

1. **双区目录**：`saved/`、`temp_drafts/`，每篇文章 `{folderName}/meta.json|content.md|assets/`
2. **索引 `blog-index.json`**：Jackson 序列化/反序列化；**先写临时文件再 `Files.move(..., ATOMIC_MOVE)`** 原子替换
3. **文件夹名规则**：非法字符替换、长度 80、重名 `_2`、`_3`（逻辑对齐 `server/utils/folder.js`）
4. **按 `id` 定位**：先查索引 `path`，再扫描两区 `meta.json`（对齐 `findArticleLocation`）
5. **标题变更**：`Files.move` 重命名目录，更新 `meta` 与索引
6. **手动保存**：写入 `saved` 后删除同 `id` 的 `temp_drafts` 目录
7. **静态 URL**：正文内资源路径改写（对齐 `contentAssets.js` 的 `/storage/...` 规则）

**知识点**：

- `Files.readString` / `writeString`、`createDirectories`、`walkFileTree`
- `Path#resolve`、`Path#normalize`、`path.startsWith(root)` 防穿越
- 多请求同时写索引：可用 **`synchronized` 或 `ReentrantLock`** 保护 `writeIndex`（Node 单进程；Java 多线程需考虑）

**不要造轮子**：递归删目录、拷贝目录用 **Commons IO**；不要用自研「文件数据库」框架。

### 3.5 校验与安全

- **Bean Validation**：`@NotBlank` 标题（手动保存）、`@Pattern` 枚举、`@Size` 限制
- **上传限制**：`spring.servlet.multipart` + 业务层校验扩展名、单文件/总大小（对齐 `config.import*`）
- **路径安全**：所有读写落在 `blogRoot` 下；拒绝 `..`、绝对路径（对齐 `assertSafeArticlePath`）
- **本期无登录**：可不引入 Spring Security；若公网部署再议

### 3.6 静态资源与 CORS

- **CORS**：开发阶段允许 Vite 源（`http://localhost:5173`）
- **`/storage`**：单独 `StorageController`，校验相对路径后 `Resource` + `MediaType`（图片 `Content-Type` 可按扩展名推断，或用 `Files.probeContentType`）

### 3.7 可观测性

- **Actuator**：`/actuator/health`；生产可关闭敏感端点
- **SLF4J**：`@Slf4j` 记录保存、重建索引、导入失败原因（Logback 为 Boot 默认）

### 3.8 测试

- **JUnit 5** + **`@TempDir`**：在临时目录模拟 `blog_storage` 结构
- **`@SpringBootTest` + `MockMvc`**：接口集成测试（列表、保存、删除、上传）
- **不要**依赖真实 `blog_storage` 目录跑 CI

---

## 四、按功能模块的实现建议（对照现有代码）

| 模块 | 现有文件 | Java 侧建议 |
|------|----------|-------------|
| 入口 | `server/index.js` | `LiublogApplication` + `WebMvcConfig` |
| 路由 | `server/routes/blog.js` | `BlogController` |
| 文章 CRUD | `server/services/blogService.js` | `BlogService` + `FileArticleRepository` |
| 索引 | `server/services/indexService.js` | `IndexService` / `IndexFileRepository` |
| 导入 | `server/services/importService.js` | `ImportService`（保持模式：`md` / `folder-package` / `folder-multi-md`） |
| 文件夹名 | `server/utils/folder.js` | `FolderNameUtils`（纯函数，单元测试覆盖） |
| 资源 URL | `server/utils/contentAssets.js` | `ContentAssetUrlResolver` |
| 配置 | `server/config.js` | `BlogProperties` |

**Import 实现要点**（逻辑迁移，非重写需求）：

- 使用 **`MultipartFile[]` + 客户端传来的相对 `paths` JSON** 还原目录树
- 内存中按 basename 建图，替换 Markdown 图片路径（与 Node 正则一致）
- 导入条数、大小、深度限制读配置项，与 `config.js` 一致

---

## 五、不建议自研 vs 推荐方案速查

| 需求 | 不推荐 | 推荐 |
|------|--------|------|
| HTTP 服务 | 自己写 Socket Server | Spring Boot Web |
| JSON | 字符串拼接 / 自写解析器 | Jackson + POJO |
| 配置 | 自己读 properties 文件解析 | `@ConfigurationProperties` |
| 文件上传 | 解析 multipart 原始流 | `MultipartFile` |
| 列表分页 | 持久化分页到文件 | 读索引后在 **内存** 分页（与现网一致） |
| UUID | 自写随机算法 | `UUID.randomUUID()` |
| 定时任务 | 若仅前端 3s 自动保存 | **无需**后端定时；保持前端调 `/save` |
| 全文搜索 | 自研搜索引擎 | 本期：**索引字段 `title` 模糊匹配**；以后要搜正文再考虑 Elasticsearch，本期不做 |
| 缓存 | 自研分布式缓存 | 本期：**可不缓存**；必要时 `Caffeine` 缓存索引对象 |
| API 文档 | Word/手写 HTML | springdoc-openapi |

---

## 六、学习路径建议（由浅入深）

1. **Spring Boot 入门**：创建项目、Starter、`application.yml`、跑通 `GET /api/health`
2. **REST + Validation**：实现 `list`、`detail` 读已有 `blog_storage`（只读）
3. **NIO 文件操作**：实现 `save`、`delete`、原子写 `blog-index.json`
4. **Multipart**：`upload/img`，返回与 Node 相同 URL 格式
5. **Import**：对齐 `doc/上传需求.md` 三种模式与限制
6. **异常与测试**：`MockMvc` 覆盖 P0；可选 Actuator、springdoc

官方参考（优先看文档，少看零散博客）：

- [Spring Boot 参考文档](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring MVC](https://docs.spring.io/spring-framework/reference/web/webmvc.html)
- [Bean Validation](https://docs.spring.io/spring-boot/docs/current/reference/html/io.html#io.validation)

---

## 七、与前端联调注意事项

- **端口**：默认 `3001`，与 `vite.config` / `axios` baseURL 一致
- **响应格式**：保持 `{ code: 0, data, message }`，错误时 `code` 与 HTTP status 对齐现网行为
- **CORS**：开发环境放开；生产由 Nginx 反代时可收紧
- **存储目录**：`blog.blog-root-dir` 指向现有 `blog_storage` 可直接复用数据，无需迁移格式

---

## 八、若未来扩展（本期可不做）

| 方向 | 技术选型 |
|------|----------|
| 用户登录 | Spring Security + JWT（或 Session） |
| 数据库版博客 | Spring Data JPA / MyBatis-Plus |
| 对象存储图片 | Spring 集成 **MinIO** SDK 或 **AWS S3** SDK |
| 配置中心 | Spring Cloud Config（多实例时） |
| 异步导入大文件 | `@Async` + 任务状态表（需 DB 时才值得做） |

---

## 九、知识点自检清单

完成 Spring Boot 重写前，应能回答或实现：

- [ ] 如何用 `@ConfigurationProperties` 复刻 `server/config.js` 全部字段？
- [ ] 如何用 Jackson 读写 `blog-index.json` 并在并发下安全更新？
- [ ] 如何实现与 `sanitizeFolderName`、`resolveUniqueFolderName` 相同语义？
- [ ] 保存文章时如何根据 `saveMode` 写入 `temp_drafts` 或 `saved`，并清理临时目录？
- [ ] 如何用 `MultipartFile` 实现 `/upload/img` 与 `/import`？
- [ ] `/storage` 如何防止路径穿越？
- [ ] 如何用 `MockMvc` + `@TempDir` 验证「保存 → 列表可见 → 删除」？
- [ ] 接口 JSON 是否与现有 Vue `src/api/blog.ts` 完全兼容？

---

## 十、总结

liu-blog 后端本质是 **「Spring Web + Jackson + NIO 文件系统 + Multipart 上传」**，无数据库、无复杂中间件。掌握 **REST、配置绑定、文件原子写、路径安全、统一异常与校验** 即可覆盖 P0；导入模块是 **业务逻辑迁移**，优先对齐 Node 行为，**不要为了 Java 而引入重型 Markdown/搜索框架**。

**核心原则：框架做基础设施，Commons 做文件工具，业务只写「索引 + 双区存储 + 导入规则」——与当前 `server/` 目录职责相同，不重复造轮子。**
