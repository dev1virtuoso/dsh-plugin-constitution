# 發佈與被人發現 · Publish & be found

這份文檔只講兩件事：**怎麼把它傳上 GitHub**，以及**別人怎麼能發現並安裝它**。
插件本身已經在本機安裝並驗證（文件在 `~/.dsh-constitution`，系統提示裡已經能看到工程憲法）。

---

## 0. 先在本地跑一遍（可選）

```sh
cd dsh-plugin-constitution
node test/layers.mjs     # 分層匹配 + 預算裁剪
node test/smoke.mjs      # section 文本 + 三個工具
```

`node` 不在 PATH 上也沒關係：DSH Desktop 自帶一套 Node 與 pnpm（插件管理器就是用它在裝東西），
可以直接借用，或做兩個 shim 常駐：

```sh
R="$HOME/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies"
mkdir -p ~/.local/bin
printf '#!/bin/sh\nexec "%s/node/bin/node" "$@"\n' "$R" > ~/.local/bin/node
printf '#!/bin/sh\nexec "%s/node/bin/node" "%s/pnpm/bin/pnpm.cjs" "$@"\n' "$R" "$R" > ~/.local/bin/pnpm
chmod +x ~/.local/bin/node ~/.local/bin/pnpm
node -v && pnpm -v          # v24.x / 11.x

# 或者一次性借用
ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" test/layers.mjs
```

---

## 1. 傳上 GitHub

### 1.1 先改成你的名字

- `package.json` → `name`（如果 npm 上已被佔用，改成 `@你的用戶名/dsh-plugin-constitution`）
- `LICENSE` → 版權人
- `market/index.json` → 兩處 `YOUR-GITHUB-NAME`

### 1.2 建倉庫並推送

```sh
cd dsh-plugin-constitution
git init -b main
git add .
git commit -m "feat: engineering constitution plugin for DeepSeek Harness"

# 用 GitHub CLI（推薦，會自動建遠端）
gh repo create dsh-plugin-constitution --public --source=. --remote=origin --push

# 沒有 gh 就手動建空倉庫，然後
git remote add origin git@github.com:你的用戶名/dsh-plugin-constitution.git
git push -u origin main
```

### 1.3 讓它可被搜索（這步最容易被忽略）

1. 倉庫 **About** 裡填一句話簡介 + 網站（可填 npm 頁面）。
2. 加 **Topics**：`dsh-plugin`、`deepseek-harness`、`dsh`、`ai-agent`、`memory`。
   GitHub 的 topic 頁是別人按關鍵詞找到你的主要途徑。
3. 打一個 **Release**（tag `v0.1.1`），附上截圖/說明。

---

## 2. 發到 npm（讓 `install` 只需要一個包名）

本機沒裝 Node 也可以——用上面那套 pnpm：

```sh
pnpm login                    # 開瀏覽器授權
pnpm publish --access public
```

### 2.1 遇到 `E403 ... Two-factor authentication` 就先建對 token

`pnpm login` 給的是 **web session token**，`whoami` 會過，但發版要 2FA 豁免，於是被 403。
在 npmjs.com → **Access Tokens** → **Generate New Token** → **Granular Access Token**，三件事缺一不可：

| 欄位 | 值 |
|---|---|
| Permissions | **Read and write** |
| Packages | **All packages** |
| **Bypass two-factor authentication** | **勾上**（只有開了 2FA 才出現；先建 token 後開 2FA 不會追溯） |

```sh
pnpm config set //registry.npmjs.org/:_authToken=<你的 npm_ token>
pnpm whoami                   # 必須打印用戶名
pnpm publish --access public
```

不想用 bypass token，就每次帶一次性驗證碼：`pnpm publish --access public --otp <6 位數字>`。
若那個勾選框根本不存在，說明你的 2FA 只有 security key / passkey，先到 Account → Two-Factor
Authentication 加一個 authenticator app。

發佈後任何人可以：

```
DSH → Plugins → Add plugin → 填 dsh-plugin-constitution
```

包裡的 `files` 字段已經寫好，只會帶上運行必需的文件（`index.js`、patch、locale、docs、icon、README）。
發佈前建議 `pnpm pack --dry-run` 看一眼真實打包列表。

不想碰 npm 也行：第 3.3 節的 `source.type: "git"` 一樣能讓人一鍵安裝，只是不能用包名裝。

> npm 包名被佔 → 用 scope：`@你的用戶名/dsh-plugin-constitution`，並把 `cordis.patch.yml` 與
> `market/index.json` 裡的 `name` 同步改掉。

---

## 3. 進入 DSH 插件市場（Discover 裡能被瀏覽/搜索）

DSH 的 **Discover** 讀的是「插件市場索引」：一個靜態 JSON（format 1），你自己託管、別人自己添加 URL。
倉庫裡已經放好模板：`market/index.json`。

### 3.1 發佈索引文件

把 `market/index.json` 放到一個公開可訪問的地址，任選其一：

- GitHub Pages：倉庫設置 → Pages → 從 `main` 分支根目錄發佈 → `https://你的用戶名.github.io/dsh-plugin-constitution/market/index.json`
- 或 raw 鏈接：`https://raw.githubusercontent.com/你的用戶名/dsh-plugin-constitution/main/market/index.json`

### 3.2 別人怎麼用

在 DSH 裡 **Plugins → Discover**（或設置裡的市場索引）添加這個 URL，之後就能搜索、看詳情、一鍵安裝。
也可以在對話裡直接讓 agent 調 `plugin_market` 工具讀取。

### 3.3 索引裡兩個關鍵字段

```json
"versions": [
  {
    "version": "0.1.1",
    "publishTimestamp": 1795000000,
    "source": { "type": "npm" },
    "engines": { "dsh": ">=0.2.0" }
  }
]
```

- `source.type: "npm"` → 從 npm 裝；私有 registry 才需要 `"registry"`。
- 想直接從 Git 裝（還沒發 npm 時）用：

```json
"source": {
  "type": "git",
  "url": "https://github.com/你的用戶名/dsh-plugin-constitution",
  "commit": "<40 位小寫 commit sha>",
  "path": "."
}
```

- Discover 的詳情頁會去**包的源碼裡**讀長描述（npm CDN 或那個 commit），所以 `README.md`、
  `docs/DETAIL.md`、`docs/preview.svg` 也會一起被別人看到——首屏寫清楚"解決什麼問題"。

---

## 4. 發佈前自查清單

- [ ] `index.js` 語法通過；`package.json` / locale JSON 可解析
- [ ] `locale/en.json`、`locale/zh.json` 的 `meta.title` / `meta.description` 已按實際功能改寫
- [ ] `icon.svg` 在淺色/深色下都能看清（36×36，無 `<text>`）
- [ ] `docs/DETAIL.md` 與 `docs/DETAIL.zh.md` 各只有一行圖片，圖片存在
- [ ] `files` 覆蓋所有運行文件（新增模塊/資源時同步）
- [ ] `cordis.patch.yml` 的 `name` 與 `package.json` 的 `name` 一致
- [ ] 全新會話裡能看到「工程憲法」段落，`constitution_status` 能跑

---

## 5. 後續升級

改完代碼 → 提版本號 → `git push` → `pnpm publish` → 更新 `market/index.json` 的 `versions`
（新版本放最前）→ 重新推送索引。

別人那邊的更新：Plugins 裡會顯示可用更新；插件包被替換後**需要重啟 DSH** 才會加載新的 JS 模塊。
