# 发布与被人发现 · Publish & be found

这份文档只讲两件事：**怎么把它传上 GitHub**，以及**别人怎么能发现并安装它**。
插件本身已经在本机安装并验证（文件在 `~/.dsh-constitution`，系统提示里已经能看到工程宪法）。

---

## 0. 先在本地跑一遍（可选）

```sh
cd dsh-plugin-constitution
node test/layers.mjs     # 分层匹配 + 预算裁剪
node test/smoke.mjs      # section 文本 + 三个工具
```

`node` 不在 PATH 上也没关系：DSH Desktop 自带 Electron，可以这样跑

```sh
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" test/layers.mjs
```

---

## 1. 传上 GitHub

### 1.1 先改成你的名字

- `package.json` → `name`（如果 npm 上已被占用，改成 `@你的用户名/dsh-plugin-constitution`）
- `LICENSE` → 版权人
- `market/index.json` → 两处 `YOUR-GITHUB-NAME`

### 1.2 建仓库并推送

```sh
cd dsh-plugin-constitution
git init -b main
git add .
git commit -m "feat: engineering constitution plugin for DeepSeek Harness"

# 用 GitHub CLI（推荐，会自动建远端）
gh repo create dsh-plugin-constitution --public --source=. --remote=origin --push

# 没有 gh 就手动建空仓库，然后
git remote add origin git@github.com:你的用户名/dsh-plugin-constitution.git
git push -u origin main
```

### 1.3 让它可被搜索（这步最容易被忽略）

1. 仓库 **About** 里填一句话简介 + 网站（可填 npm 页面）。
2. 加 **Topics**：`dsh-plugin`、`deepseek-harness`、`dsh`、`ai-agent`、`memory`。
   GitHub 的 topic 页是别人按关键词找到你的主要途径。
3. 打一个 **Release**（tag `v0.1.0`），附上截图/说明。

---

## 2. 发到 npm（让 `install` 只需要一个包名）

```sh
npm login
npm publish --access public
```

发布后任何人可以：

```
DSH → Plugins → Add plugin → 填 dsh-plugin-constitution
```

包里的 `files` 字段已经写好，只会带上运行必需的文件（`index.js`、patch、locale、docs、icon、README）。
发布前建议 `npm pack --dry-run` 看一眼真实打包列表。

> npm 包名被占 → 用 scope：`@你的用户名/dsh-plugin-constitution`，并把 `cordis.patch.yml` 与
> `market/index.json` 里的 `name` 同步改掉。

---

## 3. 进入 DSH 插件市场（Discover 里能被浏览/搜索）

DSH 的 **Discover** 读的是「插件市场索引」：一个静态 JSON（format 1），你自己托管、别人自己添加 URL。
仓库里已经放好模板：`market/index.json`。

### 3.1 发布索引文件

把 `market/index.json` 放到一个公开可访问的地址，任选其一：

- GitHub Pages：仓库设置 → Pages → 从 `main` 分支根目录发布 → `https://你的用户名.github.io/dsh-plugin-constitution/market/index.json`
- 或 raw 链接：`https://raw.githubusercontent.com/你的用户名/dsh-plugin-constitution/main/market/index.json`

### 3.2 别人怎么用

在 DSH 里 **Plugins → Discover**（或设置里的市场索引）添加这个 URL，之后就能搜索、看详情、一键安装。
也可以在对话里直接让 agent 调 `plugin_market` 工具读取。

### 3.3 索引里两个关键字段

```json
"versions": [
  {
    "version": "0.1.0",
    "publishTimestamp": 1795000000,
    "source": { "type": "npm" },
    "engines": { "dsh": ">=0.2.0" }
  }
]
```

- `source.type: "npm"` → 从 npm 装；私有 registry 才需要 `"registry"`。
- 想直接从 Git 装（还没发 npm 时）用：

```json
"source": {
  "type": "git",
  "url": "https://github.com/你的用户名/dsh-plugin-constitution",
  "commit": "<40 位小写 commit sha>",
  "path": "."
}
```

- Discover 的详情页会去**包的源码里**读长描述（npm CDN 或那个 commit），所以 `README.md`、
  `docs/DETAIL.md`、`docs/preview.svg` 也会一起被别人看到——首屏写清楚"解决什么问题"。

---

## 4. 发布前自查清单

- [ ] `index.js` 语法通过；`package.json` / locale JSON 可解析
- [ ] `locale/en.json`、`locale/zh.json` 的 `meta.title` / `meta.description` 已按实际功能改写
- [ ] `icon.svg` 在浅色/深色下都能看清（36×36，无 `<text>`）
- [ ] `docs/DETAIL.md` 与 `docs/DETAIL.zh.md` 各只有一行图片，图片存在
- [ ] `files` 覆盖所有运行文件（新增模块/资源时同步）
- [ ] `cordis.patch.yml` 的 `name` 与 `package.json` 的 `name` 一致
- [ ] 全新会话里能看到「工程宪法」段落，`constitution_status` 能跑

---

## 5. 后续升级

改完代码 → 提版本号 → `git push` → `npm publish` → 更新 `market/index.json` 的 `versions`
（新版本放最前）→ 重新推送索引。

别人那边的更新：Plugins 里会显示可用更新；插件包被替换后**需要重启 DSH** 才会加载新的 JS 模块。
