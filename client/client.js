// dsh-mcp-manager client 半。
//
// 职责（单文件）：设置页「模型」下方的「MCP 服务器」分区（settings.section order 10.5）——
//   作用域切换（用户·本机 / 各工作区）+ 服务器计数 + 搜索框；
//   「已安装」分组（可管理：启停、编辑、删除、重新连接）+ 宿主提供的 MCP 分组（只读）；
//   「新建 / 编辑 MCP 服务器」页（表单 / JSON 双模式）与「导入」页。
//
// 数据源：同源路由 /dsh-mcp-manager/*（host 半提供），全部走宿主，不直连文件系统。
// 主题：只用 --dsw-alias-* 令牌，深浅色自动跟随官方主题；类名统一 dmm-* 前缀。

window.__ModuleLoader__.load({
  // 模块 id 必须与包名逐字一致——宿主按包名注册 factory，id 不符会加载失败。
  id: "@bluechonk/dsh-mcp-manager",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;

    const React = require("react");
    const h = React.createElement;
    const { useState, useEffect, useMemo, useRef, useCallback } = React;

    const API = "/dsh-mcp-manager";

    /* ---------------------------------------------------------------- */
    /* 样式                                                              */
    /* ---------------------------------------------------------------- */

    // 视觉规格对齐参考实现（实测取值）：
    //   标题 30px/600/-0.75px、内容列 max-w-4xl(896px) 居中、块间距 32px、
    //   工具条 justify-between + 12px 间隔、作用域按钮 28px 胶囊、搜索框 36px/12px 圆角/256px、
    //   卡片 12px 圆角无描边、行高 65px/内距 12px 16px、图标块 36px/12px 圆角、
    //   名称 14px/400、描述 12px 60%、开关 32x18（开=前景色轨 + 背景色钮）。
    const CSS = [
      ".dmm-root{display:flex;flex-direction:column;gap:32px;min-width:0;max-width:896px;margin:0 auto;padding-bottom:40px;color:var(--dsw-alias-label-primary);font-size:14px}",
      ".dmm-title{font-size:30px;font-weight:600;letter-spacing:-.75px;line-height:36px;margin:0}",
      // —— 顶部工具条 ——
      ".dmm-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}",
      ".dmm-toolbarLeft{display:flex;flex-wrap:wrap;align-items:center;gap:12px;min-width:0}",
      ".dmm-scope{position:relative;flex:none}",
      ".dmm-scopeBtn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px;border-radius:9999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:400;cursor:pointer}",
      ".dmm-scopeBtn:hover{background:var(--dsw-alias-bg-layer-1)}",
      ".dmm-scopeIcon{display:inline-flex;align-items:center;color:var(--dsw-alias-label-secondary)}",
      ".dmm-divider{width:1px;height:20px;background:var(--dsw-alias-border-l1);flex:none}",
      ".dmm-meta{color:var(--dsw-alias-label-secondary);font-size:14px;white-space:nowrap}",
      ".dmm-searchWrap{position:relative;display:flex;align-items:center;width:256px;max-width:100%;flex:none}",
      ".dmm-searchWrap svg{position:absolute;left:10px;pointer-events:none;color:var(--dsw-alias-label-secondary)}",
      ".dmm-search{width:100%;height:36px;padding:0 12px 0 36px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;outline:none}",
      ".dmm-search:focus{border-color:var(--dsw-alias-brand-primary)}",
      ".dmm-search::placeholder{color:var(--dsw-alias-label-secondary)}",
      // —— 分组标题 ——
      ".dmm-sectionHead{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}",
      ".dmm-sectionTitle{font-size:14px;font-weight:400;color:var(--dsw-alias-label-primary)}",
      ".dmm-sectionCount{color:var(--dsw-alias-label-secondary);font-weight:400;font-size:12px;margin-left:2px}",
      ".dmm-actions{display:flex;align-items:center;gap:8px}",
      ".dmm-iconBtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}",
      ".dmm-iconBtn:hover{background:var(--dsw-alias-bg-layer-2)}",
      ".dmm-primary{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px 0 6px;border-radius:8px;border:1px solid transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);font:inherit;font-size:14px;font-weight:400;cursor:pointer}",
      ".dmm-primary:disabled{opacity:.5;cursor:not-allowed}",
      ".dmm-secondary{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:400;cursor:pointer}",
      ".dmm-secondary:hover{background:var(--dsw-alias-bg-layer-2)}",
      ".dmm-lg{height:34px;padding:0 14px 0 12px;font-size:14px;border-radius:10px}",
      // —— 空状态 ——
      ".dmm-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:44px 24px;border-radius:12px;border:1px dashed var(--dsw-alias-border-l1);text-align:center}",
      ".dmm-emptyTitle{font-size:15px;font-weight:500;color:var(--dsw-alias-label-primary)}",
      ".dmm-emptyDesc{font-size:13px;color:var(--dsw-alias-label-secondary)}",
      ".dmm-emptyActions{display:flex;align-items:center;gap:8px;margin-top:10px}",
      // —— 列表 ——
      ".dmm-list{display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}",
      ".dmm-card{display:flex;align-items:center;gap:12px;min-height:65px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
      ".dmm-card:last-child{border-bottom:none}",
      ".dmm-cardIcon{width:36px;height:36px;flex:none;border-radius:12px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-secondary)}",
      ".dmm-cardMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
      ".dmm-cardTitleRow{display:flex;align-items:center;gap:8px;min-width:0}",
      ".dmm-cardName{font-size:14px;font-weight:400;line-height:21px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dmm-cardDesc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dmm-cardActions{display:flex;align-items:center;gap:6px;flex:none}",
      ".dmm-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11.5px;white-space:nowrap}",
      ".dmm-badgeOk{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)}",
      ".dmm-badgeErr{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)}",
      ".dmm-badgeWarn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent)}",
      // —— 开关 ——
      ".dmm-switch{position:relative;width:32px;height:18px;flex:none;display:inline-flex;align-items:center;padding:1px;border:0;border-radius:9999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 30%, transparent);cursor:pointer}",
      ".dmm-switch[data-on=\"true\"]{background:var(--dsw-alias-label-primary)}",
      ".dmm-switchKnob{display:block;width:16px;height:16px;border-radius:999px;background:var(--dsw-alias-label-primary);transition:transform .15s ease}",
      ".dmm-switch[data-on=\"true\"] .dmm-switchKnob{transform:translateX(14px);background:var(--dsw-alias-bg-base)}",
      ".dmm-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
      ".dmm-ghostBtn{width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
      ".dmm-ghostBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
      ".dmm-ghostBtnDanger:hover{color:var(--dsw-alias-state-error-primary)}",
      // —— 下拉菜单 ——
      ".dmm-menu{position:absolute;z-index:40;top:calc(100% + 6px);left:0;min-width:200px;padding:6px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 32px rgba(0,0,0,.28);display:flex;flex-direction:column;gap:2px}",
      ".dmm-menuRight{left:auto;right:0}",
      ".dmm-menuItem{display:flex;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;text-align:left;cursor:pointer;width:100%}",
      ".dmm-menuItem:hover{background:var(--dsw-alias-bg-layer-2)}",
      ".dmm-menuItem span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dmm-menuItem[aria-current=\"true\"]{background:var(--dsw-alias-bg-layer-2)}",
      ".dmm-menuLabel{padding:8px 10px 4px;color:var(--dsw-alias-label-secondary);font-size:12px}",
      // —— 表单页 ——
      ".dmm-pageHead{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px}",
      ".dmm-pageTitle{font-size:20px;font-weight:600;letter-spacing:-.25px;line-height:28px;margin:0}",
      ".dmm-pageSub{font-size:13px;color:var(--dsw-alias-label-secondary);margin-top:2px}",
      ".dmm-segment{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:9999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}",
      ".dmm-segmentBtn{height:24px;padding:0 12px;border:0;border-radius:9999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer}",
      ".dmm-segmentBtn[data-active=\"true\"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.18)}",
      ".dmm-cardWrap{margin-top:16px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);padding:18px 20px 20px;display:flex;flex-direction:column;gap:14px}",
      ".dmm-scopeRow{display:flex;align-items:center;justify-content:flex-end;gap:8px}",
      ".dmm-scopeLabel{font-size:12.5px;color:var(--dsw-alias-label-secondary)}",
      ".dmm-field{display:flex;flex-direction:column;gap:6px}",
      ".dmm-label{font-size:12.5px;color:var(--dsw-alias-label-secondary)}",
      ".dmm-input{height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;outline:none}",
      ".dmm-input:focus{border-color:var(--dsw-alias-brand-primary)}",
      ".dmm-input::placeholder{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}",
      ".dmm-select{position:relative;height:34px;min-width:220px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}",
      ".dmm-selectBtn{width:100%;height:100%;display:inline-flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;cursor:pointer;border-radius:8px}",
      ".dmm-textarea{padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.7;outline:none;resize:vertical;min-height:150px;white-space:pre;overflow:auto}",
      ".dmm-textarea:focus{border-color:var(--dsw-alias-brand-primary)}",
      ".dmm-hint{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.7}",
      ".dmm-disclosure{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;padding:0}",
      ".dmm-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px}",
      ".dmm-error{font-size:12.5px;color:var(--dsw-alias-state-error-primary);line-height:1.6}",
      ".dmm-state{padding:28px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13.5px}",
      ".dmm-note{margin-top:10px;font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}",
    ].join("");

    /** 注入样式（按 data-plugin-css 去重，热重载原位替换）。 */
    function ensureStyles() {
      if (typeof document === "undefined") return;
      // id 用包名：避免与其它插件的 data-plugin-css 撞名互相覆盖。
      const id = "@bluechonk/dsh-mcp-manager";
      let style = document.querySelector('style[data-plugin-css="' + id + '"]');
      if (!style) {
        style = document.createElement("style");
        style.setAttribute("data-plugin-css", id);
        document.head.appendChild(style);
      }
      if (style.textContent !== CSS) style.textContent = CSS;
    }

    /* ---------------------------------------------------------------- */
    /* 图标（自绘线性图标，随主题着色）                                     */
    /* ---------------------------------------------------------------- */

    const Svg = (props) => h("svg", Object.assign({ width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }, props));

    const IconMonitor = (p) => h(Svg, p, h("rect", { x: 3, y: 4, width: 18, height: 13, rx: 2 }), h("path", { d: "M8 21h8M12 17v4" }));
    const IconFolder = (p) => h(Svg, p, h("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }));
    const IconCaret = (p) => h(Svg, Object.assign({ width: 14, height: 14 }, p), h("path", { d: "m6 9 6 6 6-6" }));
    const IconSearch = (p) => h(Svg, p, h("circle", { cx: 11, cy: 11, r: 7 }), h("path", { d: "m20 20-3.2-3.2" }));
    const IconMore = (p) => h(Svg, p, h("circle", { cx: 5, cy: 12, r: 1.6, fill: "currentColor" }), h("circle", { cx: 12, cy: 12, r: 1.6, fill: "currentColor" }), h("circle", { cx: 19, cy: 12, r: 1.6, fill: "currentColor" }));
    const IconRefresh = (p) => h(Svg, p, h("path", { d: "M20 11a8 8 0 1 0-2.3 5.7" }), h("path", { d: "M20 4v7h-7" }));
    const IconPlus = (p) => h(Svg, p, h("path", { d: "M12 5v14M5 12h14" }));
    const IconImport = (p) => h(Svg, p, h("path", { d: "M12 3v11" }), h("path", { d: "m8 10 4 4 4-4" }), h("path", { d: "M4 19h16" }));
    const IconTrash = (p) => h(Svg, p, h("path", { d: "M4 7h16M10 11v6M14 11v6" }), h("path", { d: "M6 7l1 13h10l1-13" }), h("path", { d: "M9 7V4h6v3" }));
    const IconEdit = (p) => h(Svg, p, h("path", { d: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" }));
    const IconPlug = (p) => h(Svg, p, h("path", { d: "M9 3v6M15 3v6" }), h("path", { d: "M6 9h12v3a6 6 0 0 1-12 0z" }), h("path", { d: "M12 18v3" }));
    const IconGlobe = (p) => h(Svg, p, h("circle", { cx: 12, cy: 12, r: 9 }), h("path", { d: "M3 12h18" }), h("path", { d: "M12 3c2.5 2.6 2.5 15.4 0 18-2.5-2.6-2.5-15.4 0-18" }));
    const IconFile = (p) => h(Svg, p, h("path", { d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" }), h("path", { d: "M14 3v5h5" }));
    const IconLayers = (p) => h(Svg, p, h("rect", { x: 4, y: 4, width: 12, height: 12, rx: 2 }), h("path", { d: "M9 20h9a2 2 0 0 0 2-2V9" }));
    const IconCheck = (p) => h(Svg, p, h("path", { d: "m5 13 4 4 10-10" }));

    /* ---------------------------------------------------------------- */
    /* 国际化                                                            */
    /* ---------------------------------------------------------------- */

    const LOCALE_NS = "dsh-mcp-manager";

    const LOCALE_DICT = {
      zh: {
        "section.title": "MCP 服务器",
        "toolbar.count": "MCP {n}",
        "toolbar.search": "搜索 MCP 服务器...",
        "scope.user": "用户 · 本机",
        "scope.workspace": "工作区 · {name}",
        "scope.label": "作用域",
        "section.installed": "已安装",
        "action.new": "新建",
        "action.refresh": "刷新",
        "action.import": "导入",
        "action.more": "更多操作",
        "action.save": "保存",
        "action.cancel": "取消",
        "action.edit": "编辑",
        "action.delete": "删除",
        "action.reconnect": "重新连接",
        "empty.title": "尚未安装 MCP 服务器",
        "empty.desc": "手动新建服务器，或导入已有配置。",
        "empty.new": "新建 MCP 服务器",
        "state.loading": "加载中…",
        "state.loadFailed": "加载失败：{error}",
        "state.empty": "没有匹配的 MCP 服务器。",
        "form.title": "新建 MCP 服务器",
        "form.editTitle": "编辑 MCP 服务器",
        "form.desc": "填写新的 MCP 配置，保存后返回列表。",
        "form.mode.form": "表单",
        "form.mode.json": "JSON",
        "form.name": "名称",
        "form.namePlaceholder": "my-mcp-server",
        "form.type": "类型",
        "form.type.stdio": "stdio（本地命令）",
        "form.type.http": "streamable-http（远程服务）",
        "form.timeout": "超时时间 MS",
        "form.protocol": "协议版本",
        "form.protocol.auto": "自动（推荐）",
        "form.protocol.hint": "DSH 由官方 MCP SDK 自动协商协议版本，无需手动指定。",
        "form.command": "命令",
        "form.commandPlaceholder": "npx",
        "form.args": "参数（空格分隔）",
        "form.argsPlaceholder": "-y @modelcontextprotocol/server-memory",
        "form.env": "环境变量（可选）",
        "form.envPlaceholder": "{\n  \"MY_API_KEY\": \"your-key\"\n}",
        "form.url": "地址",
        "form.urlPlaceholder": "http://127.0.0.1:8080/mcp",
        "form.headers": "请求头（可选）",
        "form.headersPlaceholder": "{\n  \"Authorization\": \"Bearer token\"\n}",
        "form.jsonLabel": "完整配置",
        "form.jsonHint": "支持直接粘贴 {\"server-name\": {...}} 或 {\"mcpServers\": {\"server-name\": {...}}}。",
        "import.title": "导入 MCP 服务器",
        "import.desc": "粘贴已有 MCP 配置，支持 {\"mcpServers\": {...}} 与扁平映射两种形状。",
        "import.label": "MCP 配置",
        "import.placeholder": "{\n  \"mcpServers\": {\n    \"my-server\": {\n      \"type\": \"stdio\",\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@modelcontextprotocol/server-memory\"]\n    }\n  }\n}",
        "import.done": "已导入 {n} 个服务器",
        "import.skipped": "跳过 {n} 个同名服务器",
        "status.connected": "已连接（{n} 个工具）",
        "status.connecting": "连接中…",
        "status.error": "连接失败",
        "status.offline": "离线",
        "status.disabled": "已停用",
        "status.disconnected": "未连接",
        "provided.desc": "该 MCP 服务器由 DSH 宿主为 {provider} 插件提供，运行时身份由宿主管理。",
        "group.browser": "浏览器操作",
        "group.computer": "电脑控制",
        "group.document": "文档",
        "group.host": "宿主提供",
        "switch.enable": "启用 {name}",
        "aria.switch": "开关",
        "aria.dialog": "对话框",
        "error.invalid-name": "服务器名称不合法：只允许字母、数字、下划线与连字符，且不超过 32 个字符",
        "error.missing-name": "缺少服务器名称",
        "error.invalid-transport": "不支持的连接类型",
        "error.invalid-timeout": "超时时间必须是正整数（毫秒）",
        "error.missing-command": "本地命令类型必须填写命令",
        "error.invalid-url": "远程服务类型必须填写 http:// 或 https:// 开头的地址",
        "error.not-object": "服务器配置必须是对象",
        "error.invalid-json": "不是合法的 JSON",
        "error.empty": "内容为空",
        "error.empty-document": "没有找到任何服务器配置",
        "error.invalid-entry": "没有找到任何服务器配置",
        "error.duplicate-name": "同名服务器已存在",
        "error.scope-not-found": "作用域不存在",
        "error.not-found": "服务器不存在",
        "error.request-failed": "请求失败：{status}",
        "error.timeout": "请求超时（15 秒），宿主无响应",
        "error.internal-error": "内部错误",
      },
      en: {
        "section.title": "MCP Servers",
        "toolbar.count": "MCP {n}",
        "toolbar.search": "Search MCP servers...",
        "scope.user": "User · Local",
        "scope.workspace": "Workspace · {name}",
        "scope.label": "Scope",
        "section.installed": "Installed",
        "action.new": "New",
        "action.refresh": "Refresh",
        "action.import": "Import",
        "action.more": "More actions",
        "action.save": "Save",
        "action.cancel": "Cancel",
        "action.edit": "Edit",
        "action.delete": "Delete",
        "action.reconnect": "Reconnect",
        "empty.title": "No MCP servers installed",
        "empty.desc": "Create a server manually, or import an existing configuration.",
        "empty.new": "New MCP Server",
        "state.loading": "Loading…",
        "state.loadFailed": "Failed to load: {error}",
        "state.empty": "No MCP server matches the search.",
        "form.title": "New MCP Server",
        "form.editTitle": "Edit MCP Server",
        "form.desc": "Fill in the MCP configuration; saving returns to the list.",
        "form.mode.form": "Form",
        "form.mode.json": "JSON",
        "form.name": "Name",
        "form.namePlaceholder": "my-mcp-server",
        "form.type": "Type",
        "form.type.stdio": "stdio (local command)",
        "form.type.http": "streamable-http (remote service)",
        "form.timeout": "Timeout MS",
        "form.protocol": "Protocol version",
        "form.protocol.auto": "Automatic (recommended)",
        "form.protocol.hint": "DSH negotiates the protocol version automatically through the official MCP SDK.",
        "form.command": "Command",
        "form.commandPlaceholder": "npx",
        "form.args": "Arguments (space separated)",
        "form.argsPlaceholder": "-y @modelcontextprotocol/server-memory",
        "form.env": "Environment variables (optional)",
        "form.envPlaceholder": "{\n  \"MY_API_KEY\": \"your-key\"\n}",
        "form.url": "URL",
        "form.urlPlaceholder": "http://127.0.0.1:8080/mcp",
        "form.headers": "Headers (optional)",
        "form.headersPlaceholder": "{\n  \"Authorization\": \"Bearer token\"\n}",
        "form.jsonLabel": "Full configuration",
        "form.jsonHint": "Paste {\"server-name\": {...}} or {\"mcpServers\": {\"server-name\": {...}}} directly.",
        "import.title": "Import MCP Servers",
        "import.desc": "Paste an existing MCP configuration; both {\"mcpServers\": {...}} and flat maps are accepted.",
        "import.label": "MCP configuration",
        "import.placeholder": "{\n  \"mcpServers\": {\n    \"my-server\": {\n      \"type\": \"stdio\",\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@modelcontextprotocol/server-memory\"]\n    }\n  }\n}",
        "import.done": "Imported {n} server(s)",
        "import.skipped": "Skipped {n} server(s) with the same name",
        "status.connected": "Connected ({n} tools)",
        "status.connecting": "Connecting…",
        "status.error": "Connection failed",
        "status.offline": "Offline",
        "status.disabled": "Disabled",
        "status.disconnected": "Not connected",
        "provided.desc": "This MCP server is provided by the DSH host for the {provider} plugin; the host owns its runtime identity.",
        "group.browser": "Browser automation",
        "group.computer": "Computer control",
        "group.document": "Documents",
        "group.host": "Host provided",
        "switch.enable": "Enable {name}",
        "aria.switch": "Switch",
        "aria.dialog": "Dialog",
        "error.invalid-name": "Invalid server name: letters, digits, underscore and hyphen only, at most 32 characters",
        "error.missing-name": "Server name is required",
        "error.invalid-transport": "Unsupported connection type",
        "error.invalid-timeout": "Timeout must be a positive integer (milliseconds)",
        "error.missing-command": "The local command type requires a command",
        "error.invalid-url": "The remote service type requires an http:// or https:// URL",
        "error.not-object": "Server configuration must be an object",
        "error.invalid-json": "Not valid JSON",
        "error.empty": "The content is empty",
        "error.empty-document": "No server configuration found",
        "error.invalid-entry": "No server configuration found",
        "error.duplicate-name": "A server with the same name already exists",
        "error.scope-not-found": "The scope does not exist",
        "error.not-found": "The server does not exist",
        "error.request-failed": "Request failed: {status}",
        "error.timeout": "Request timed out (15 seconds); the host did not respond",
        "error.internal-error": "Internal error",
      },
    };

    /**
     * 插值：把 {name} 换成参数值。
     * @param {string} template
     * @param {Record<string, unknown> | undefined} params
     */
    function interpolate(template, params) {
      if (params === null || params === undefined) return template;
      return String(template).replace(/\{(\w+)\}/g, (match, name) =>
        name in params ? String(params[name]) : match,
      );
    }

    /** 中文兜底翻译器：宿主没给 t 时用它（输出与中文版逐字相同）。 */
    function fallbackT() {
      return (key, params) => {
        const dict = LOCALE_DICT.zh;
        const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
        return interpolate(template, params);
      };
    }

    /**
     * 取文案：优先用宿主注入的 t，其次用绑定的 currentT，最后中文兜底。
     * @param {null | undefined | ((key: string, params?: any) => string)} t
     * @param {string} key
     * @param {Record<string, unknown>} [params]
     */
    function tr(t, key, params) {
      const text = (t === null || t === undefined ? (currentT || fallbackT()) : t)(key, params);
      if (typeof text === "string" && text.includes("{") && text.includes("}")) {
        console.warn("[dsh-mcp-manager] unresolved placeholder in translation key: " + key + " -> " + text);
      }
      return text;
    }

    /** 宿主绑定的翻译函数（引用稳定，每次调用读当前语言）。 */
    let currentT = null;

    /**
     * 宿主返回的错误：按 code 查本地化文案，没有 code 就退回原文。
     * @param {unknown} error
     */
    function localizeError(error) {
      if (!error) return tr(currentT, "error.internal-error");
      const code = error.code ? String(error.code) : "";
      if (code && Object.prototype.hasOwnProperty.call(LOCALE_DICT.zh, "error." + code)) {
        return tr(currentT, "error." + code, error.params || {});
      }
      return error.message || tr(currentT, "error.internal-error");
    }

    /* ---------------------------------------------------------------- */
    /* 数据访问                                                          */
    /* ---------------------------------------------------------------- */

    /** 请求超时上限：宿主卡住时不让界面永远停在「加载中」。 */
    const REQUEST_TIMEOUT_MS = 15000;

    /**
     * 宿主返回的错误对象：带上 code/params，界面按 code 查本地化文案。
     * @param {any} payload
     * @param {number} status
     */
    function makeError(payload, status) {
      const error = new Error((payload && payload.error) || tr(currentT, "error.request-failed", { status }));
      if (payload && payload.code) error.code = payload.code;
      if (payload && payload.params) error.params = payload.params;
      return error;
    }

    /**
     * GET 请求。
     * @param {string} path
     * @param {Record<string, string>} [params]
     */
    async function apiGet(path, params) {
      const query = params ? "?" + new URLSearchParams(params).toString() : "";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(API + path + query, { headers: { accept: "application/json" }, signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) throw makeError(payload, response.status);
        return payload;
      } catch (error) {
        if (error && error.name === "AbortError") throw new Error(tr(currentT, "error.timeout"));
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    /**
     * POST 请求。
     * @param {string} path
     * @param {unknown} body
     */
    async function apiPost(path, body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(API + path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body || {}),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) throw makeError(payload, response.status);
        return payload;
      } catch (error) {
        if (error && error.name === "AbortError") throw new Error(tr(currentT, "error.timeout"));
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    /* ---------------------------------------------------------------- */
    /* 小组件                                                            */
    /* ---------------------------------------------------------------- */

    /**
     * 开关。
     * @param {{ on: boolean, onChange: (next: boolean) => void, label?: string, disabled?: boolean }} props
     */
    function Switch(props) {
      return h("button", {
        type: "button",
        className: "dmm-switch",
        role: "switch",
        "aria-checked": props.on ? "true" : "false",
        "aria-label": props.label || tr(currentT, "aria.switch"),
        "data-on": props.on ? "true" : "false",
        disabled: props.disabled || false,
        onClick: (event) => { event.stopPropagation(); props.onChange(!props.on); },
      }, h("span", { className: "dmm-switchKnob" }));
    }

    /**
     * 作用域下拉。
     * @param {{ scopes: any[], value: string, onChange: (id: string) => void, small?: boolean }} props
     */
    function ScopePicker(props) {
      const [open, setOpen] = useState(false);
      const ref = useRef(null);
      useEffect(() => {
        if (!open) return undefined;
        const onDown = (event) => {
          if (ref.current && !ref.current.contains(event.target)) setOpen(false);
        };
        const onKey = (event) => {
          if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
          document.removeEventListener("mousedown", onDown);
          document.removeEventListener("keydown", onKey);
        };
      }, [open]);

      const current = props.scopes.find((scope) => scope.id === props.value) || props.scopes[0];
      const label = current ? scopeLabel(current) : tr(currentT, "scope.user");
      const Icon = current && current.kind === "workspace" ? IconFolder : IconMonitor;
      const buttonClass = props.small ? "dmm-selectBtn" : "dmm-scopeBtn";
      const wrapClass = props.small ? "dmm-select" : "dmm-scope";
      return h("div", { className: wrapClass, ref: ref },
        h("button", {
          type: "button",
          className: buttonClass,
          onClick: () => setOpen((value) => !value),
          "aria-haspopup": "menu",
          "aria-expanded": open ? "true" : "false",
        },
          props.small ? null : h("span", { className: "dmm-scopeIcon" }, h(Icon, { width: 15, height: 15 })),
          h("span", null, label),
          h(IconCaret, null),
        ),
        open ? h("div", { className: "dmm-menu" + (props.small ? " dmm-menuRight" : ""), role: "menu" },
          h("div", { className: "dmm-menuLabel" }, tr(currentT, "scope.label")),
          props.scopes.map((scope) => {
            const ScopeIcon = scope.kind === "workspace" ? IconFolder : IconMonitor;
            return h("button", {
              key: scope.id,
              type: "button",
              role: "menuitem",
              className: "dmm-menuItem",
              "aria-current": scope.id === props.value ? "true" : "false",
              onClick: () => { setOpen(false); props.onChange(scope.id); },
            }, h(ScopeIcon, { width: 15, height: 15 }), h("span", null, scopeLabel(scope)));
          }),
        ) : null,
      );
    }

    /**
     * 作用域展示名。
     * @param {{ id: string, kind: string, title?: string }} scope
     */
    function scopeLabel(scope) {
      if (!scope) return tr(currentT, "scope.user");
      if (scope.kind === "workspace") {
        const name = scope.title || scope.id.replace(/^ws:/, "");
        return tr(currentT, "scope.workspace", { name });
      }
      return tr(currentT, "scope.user");
    }

    /**
     * 状态下拉项：状态徽标。
     * @param {{ server: any }} props
     */
    function StatusBadge(props) {
      const server = props.server;
      const status = server.status;
      if (status === "connected") {
        return h("span", { className: "dmm-badge dmm-badgeOk" }, tr(currentT, "status.connected", { n: server.toolCount || 0 }));
      }
      if (status === "connecting") return h("span", { className: "dmm-badge dmm-badgeWarn" }, tr(currentT, "status.connecting"));
      if (status === "error") return h("span", { className: "dmm-badge dmm-badgeErr", title: server.error || "" }, tr(currentT, "status.error"));
      if (status === "offline") return h("span", { className: "dmm-badge dmm-badgeWarn" }, tr(currentT, "status.offline"));
      if (status === "disabled") return h("span", { className: "dmm-badge" }, tr(currentT, "status.disabled"));
      return h("span", { className: "dmm-badge" }, tr(currentT, "status.disconnected"));
    }

    /* ---------------------------------------------------------------- */
    /* 面板                                                              */
    /* ---------------------------------------------------------------- */

    /** 表单初始值。 */
    function emptyForm() {
      return {
        serverName: "",
        transport: "stdio",
        toolCallTimeoutMs: 30000,
        command: "",
        args: "",
        env: "",
        url: "",
        headers: "",
      };
    }

    /** JSON 模式模板。 */
    const JSON_TEMPLATE = [
      "{",
      '  "my-mcp-server": {',
      '    "type": "stdio",',
      '    "command": "",',
      '    "args": []',
      "  }",
      "}",
    ].join("\n");

    /**
     * 已安装服务器的卡片。
     * @param {{ server: any, onToggle: Function, onEdit: Function, onDelete: Function, onReconnect: Function }} props
     */
    function ServerCard(props) {
      const server = props.server;
      const Icon = server.transport === "stdio" ? IconPlug : IconGlobe;
      return h("div", { className: "dmm-card" },
        h("div", { className: "dmm-cardIcon" }, h(Icon, { width: 18, height: 18 })),
        h("div", { className: "dmm-cardMain" },
          h("div", { className: "dmm-cardTitleRow" },
            h("span", { className: "dmm-cardName" }, server.serverName),
            h(StatusBadge, { server }),
          ),
          h("div", { className: "dmm-cardDesc", title: server.target || "" }, server.target || server.transport),
        ),
        h("div", { className: "dmm-cardActions" },
          h("button", {
            type: "button",
            className: "dmm-ghostBtn",
            title: tr(currentT, "action.reconnect"),
            "aria-label": tr(currentT, "action.reconnect"),
            onClick: () => props.onReconnect(server),
          }, h(IconRefresh, null)),
          h("button", {
            type: "button",
            className: "dmm-ghostBtn",
            title: tr(currentT, "action.edit"),
            "aria-label": tr(currentT, "action.edit"),
            onClick: () => props.onEdit(server),
          }, h(IconEdit, null)),
          h("button", {
            type: "button",
            className: "dmm-ghostBtn dmm-ghostBtnDanger",
            title: tr(currentT, "action.delete"),
            "aria-label": tr(currentT, "action.delete"),
            onClick: () => props.onDelete(server),
          }, h(IconTrash, null)),
          h(Switch, {
            on: server.enabled !== false,
            label: tr(currentT, "switch.enable", { name: server.serverName }),
            onChange: (next) => props.onToggle(server, next),
          }),
        ),
      );
    }

    /**
     * 宿主提供的 MCP 服务器卡片（只读）。
     * @param {{ server: any }} props
     */
    function ProvidedCard(props) {
      const server = props.server;
      const Icon = server.transport === "stdio" ? IconPlug : IconGlobe;
      return h("div", { className: "dmm-card" },
        h("div", { className: "dmm-cardIcon" }, h(Icon, { width: 18, height: 18 })),
        h("div", { className: "dmm-cardMain" },
          h("div", { className: "dmm-cardTitleRow" }, h("span", { className: "dmm-cardName" }, server.serverName)),
          h("div", { className: "dmm-cardDesc" }, tr(currentT, "provided.desc", { provider: server.id })),
        ),
      );
    }

    /**
     * 设置页分区主体。
     * @param {{ t?: (key: string, params?: any) => string }} props
     */
    function Panel(props) {
      const t = props.t || currentT || fallbackT();
      const [state, setState] = useState(null);
      const [scopeId, setScopeId] = useState("user");
      const [query, setQuery] = useState("");
      const [view, setView] = useState("list");
      const [editing, setEditing] = useState(null);
      const [mode, setMode] = useState("form");
      const [form, setForm] = useState(emptyForm());
      const [jsonText, setJsonText] = useState(JSON_TEMPLATE);
      const [importText, setImportText] = useState("");
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const [notice, setNotice] = useState("");
      const [menuOpen, setMenuOpen] = useState(false);
      const menuRef = useRef(null);

      useEffect(() => {
        if (!menuOpen) return undefined;
        const onDown = (event) => {
          if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
      }, [menuOpen]);

      const load = useCallback(async (scope) => {
        try {
          const payload = await apiGet("/state", scope ? { scope } : undefined);
          setState(payload);
          setError("");
        } catch (err) {
          setError(localizeError(err));
        }
      }, []);

      useEffect(() => {
        void load(scopeId);
      }, [load, scopeId]);

      // 状态轮询：连接状态会随时间变化，定时刷新让徽标保持真实。
      useEffect(() => {
        const timer = setInterval(() => { void load(scopeId); }, 8000);
        return () => clearInterval(timer);
      }, [load, scopeId]);

      const servers = state && Array.isArray(state.servers) ? state.servers : [];
      const provided = state && Array.isArray(state.provided) ? state.provided : [];
      const scopes = state && Array.isArray(state.scopes) ? state.scopes : [{ id: "user", kind: "user", title: "", installed: 0 }];

      const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (keyword === "") return servers;
        return servers.filter((server) =>
          String(server.serverName).toLowerCase().includes(keyword)
          || String(server.target || "").toLowerCase().includes(keyword));
      }, [servers, query]);

      const filteredProvided = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (keyword === "") return provided;
        return provided.filter((server) =>
          String(server.serverName).toLowerCase().includes(keyword)
          || String(server.id || "").toLowerCase().includes(keyword));
      }, [provided, query]);

      // 宿主提供的服务器按归类分组展示。
      const providedGroups = useMemo(() => {
        const groups = new Map();
        for (const server of filteredProvided) {
          const key = server.category || "host";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(server);
        }
        return [...groups.entries()];
      }, [filteredProvided]);

      const run = useCallback(async (action) => {
        setBusy(true);
        setError("");
        try {
          const payload = await action();
          if (payload && payload.ok !== false && payload.servers) setState(payload);
          else await load(scopeId);
          return payload;
        } catch (err) {
          setError(localizeError(err));
          await load(scopeId);
          return null;
        } finally {
          setBusy(false);
        }
      }, [load, scopeId]);

      const openCreate = useCallback(() => {
        setEditing(null);
        setMode("form");
        setForm(emptyForm());
        setJsonText(JSON_TEMPLATE);
        setError("");
        setView("create");
      }, []);

      const openEdit = useCallback((server) => {
        setEditing(server);
        setMode("form");
        setForm({
          serverName: server.serverName,
          transport: server.transport || "stdio",
          toolCallTimeoutMs: server.toolCallTimeoutMs || 30000,
          command: server.command || "",
          args: Array.isArray(server.args) ? server.args.join(" ") : String(server.args || ""),
          env: server.env && Object.keys(server.env).length > 0 ? JSON.stringify(server.env, null, 2) : "",
          url: server.url || "",
          headers: server.headers && Object.keys(server.headers).length > 0 ? JSON.stringify(server.headers, null, 2) : "",
        });
        setJsonText(JSON.stringify({ [server.serverName]: serverToJson(server) }, null, 2));
        setError("");
        setView("edit");
      }, []);

      const openImport = useCallback(() => {
        setImportText("");
        setError("");
        setNotice("");
        setView("import");
      }, []);

      /** 条目 → JSON 形态（与 ZCode 的「type」写法一致）。 */
      function serverToJson(server) {
        const base = { type: server.transport };
        if (server.transport === "stdio") {
          base.command = server.command || "";
          base.args = Array.isArray(server.args) ? server.args : [];
          if (server.env && Object.keys(server.env).length > 0) base.env = server.env;
        } else {
          base.url = server.url || "";
          if (server.headers && Object.keys(server.headers).length > 0) base.headers = server.headers;
        }
        if (server.toolCallTimeoutMs) base.timeout = server.toolCallTimeoutMs;
        return base;
      }

      /** 解析 JSON 文本里的 JSON 字典（环境变量 / 请求头）。 */
      function parseDict(text) {
        const trimmed = String(text || "").trim();
        if (trimmed === "") return {};
        const parsed = JSON.parse(trimmed);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(t("form.env"));
        }
        return parsed;
      }

      /** 表单 → 提交体。 */
      function formToServer() {
        const server = {
          serverName: form.serverName.trim(),
          transport: form.transport,
          toolCallTimeoutMs: Number(form.toolCallTimeoutMs) || 30000,
        };
        if (form.transport === "stdio") {
          server.command = form.command.trim();
          server.args = form.args.trim();
          if (form.env.trim() !== "") server.env = parseDict(form.env);
        } else {
          server.url = form.url.trim();
          if (form.headers.trim() !== "") server.headers = parseDict(form.headers);
        }
        return server;
      }

      const save = useCallback(async () => {
        setError("");
        setBusy(true);
        try {
          let server;
          if (mode === "json") {
            server = parseJsonDocument(jsonText);
          } else {
            server = formToServer();
          }
          const payload = editing
            ? await apiPost("/servers/update", { scope: scopeId, serverName: editing.serverName, server, enabled: editing.enabled !== false })
            : await apiPost("/servers", { scope: scopeId, server });
          if (payload && payload.ok !== false) setState(payload);
          setView("list");
        } catch (err) {
          setError(localizeError(err));
        } finally {
          setBusy(false);
        }
      }, [editing, form, jsonText, mode, scopeId]);

      const doImport = useCallback(async () => {
        setError("");
        setBusy(true);
        try {
          const payload = await apiPost("/import", { scope: scopeId, content: importText });
          if (payload && payload.ok !== false) {
            setState(payload);
            const imported = Array.isArray(payload.imported) ? payload.imported.length : 0;
            const skipped = Array.isArray(payload.skipped) ? payload.skipped.length : 0;
            setNotice(t("import.done", { n: imported }) + (skipped > 0 ? "，" + t("import.skipped", { n: skipped }) : ""));
          }
          setView("list");
        } catch (err) {
          setError(localizeError(err));
        } finally {
          setBusy(false);
        }
      }, [importText, scopeId, t]);

      /** JSON 文本 → 单条服务器（支持 {"name": {...}} 与扁平配置）。 */
      function parseJsonDocument(text) {
        const source = String(text || "").trim();
        if (source === "") throw new Error(t("error.empty"));
        let parsed;
        try {
          parsed = JSON.parse(source);
        } catch {
          const error = new Error(t("error.invalid-json"));
          error.code = "invalid-json";
          throw error;
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          const error = new Error(t("error.not-object"));
          error.code = "not-object";
          throw error;
        }
        if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
          const entries = Object.entries(parsed.mcpServers);
          if (entries.length === 0) throw new Error(t("error.empty-document"));
          const [name, config] = entries[0];
          return { ...config, serverName: config.serverName || name };
        }
        if (parsed.serverName || parsed.transport || parsed.type) {
          return parsed;
        }
        const entries = Object.entries(parsed);
        if (entries.length === 0) throw new Error(t("error.empty-document"));
        const [name, config] = entries[0];
        return { ...config, serverName: (config && config.serverName) || name };
      }

      /* ---------------- 渲染 ---------------- */

      if (!state && !error) {
        return h("div", { className: "dmm-root" }, h("div", { className: "dmm-state" }, t("state.loading")));
      }

      // —— 表单 / 导入页 ——
      if (view === "create" || view === "edit") {
        const title = view === "edit" ? t("form.editTitle") : t("form.title");
        return h("div", { className: "dmm-root" },
          h("div", { className: "dmm-pageHead" },
            h("div", null,
              h("h1", { className: "dmm-pageTitle" }, title),
              h("div", { className: "dmm-pageSub" }, t("form.desc")),
            ),
            h("div", { className: "dmm-segment" },
              h("button", {
                type: "button",
                className: "dmm-segmentBtn",
                "data-active": mode === "form" ? "true" : "false",
                onClick: () => setMode("form"),
              }, t("form.mode.form")),
              h("button", {
                type: "button",
                className: "dmm-segmentBtn",
                "data-active": mode === "json" ? "true" : "false",
                onClick: () => setMode("json"),
              }, t("form.mode.json")),
            ),
          ),
          h("div", { className: "dmm-cardWrap" },
            h("div", { className: "dmm-scopeRow" },
              h("span", { className: "dmm-scopeLabel" }, t("scope.label")),
              h(ScopePicker, { scopes, value: scopeId, onChange: setScopeId, small: true }),
            ),
            mode === "form" ? renderForm({ t, form, setForm, editing }) : renderJson({ t, jsonText, setJsonText }),
            error ? h("div", { className: "dmm-error" }, error) : null,
            h("div", { className: "dmm-foot" },
              h("button", { type: "button", className: "dmm-secondary", onClick: () => setView("list") }, t("action.cancel")),
              h("button", { type: "button", className: "dmm-primary dmm-lg", disabled: busy, onClick: () => void save() },
                h(IconCheck, null), h("span", null, t("action.save"))),
            ),
          ),
        );
      }

      if (view === "import") {
        return h("div", { className: "dmm-root" },
          h("div", { className: "dmm-pageHead" },
            h("div", null,
              h("h1", { className: "dmm-pageTitle" }, t("import.title")),
              h("div", { className: "dmm-pageSub" }, t("import.desc")),
            ),
          ),
          h("div", { className: "dmm-cardWrap" },
            h("div", { className: "dmm-scopeRow" },
              h("span", { className: "dmm-scopeLabel" }, t("scope.label")),
              h(ScopePicker, { scopes, value: scopeId, onChange: setScopeId, small: true }),
            ),
            h("div", { className: "dmm-field" },
              h("span", { className: "dmm-label" }, t("import.label")),
              h("textarea", {
                className: "dmm-textarea",
                value: importText,
                placeholder: t("import.placeholder"),
                spellCheck: false,
                onChange: (event) => setImportText(event.target.value),
              }),
            ),
            error ? h("div", { className: "dmm-error" }, error) : null,
            h("div", { className: "dmm-foot" },
              h("button", { type: "button", className: "dmm-secondary", onClick: () => setView("list") }, t("action.cancel")),
              h("button", { type: "button", className: "dmm-primary dmm-lg", disabled: busy, onClick: () => void doImport() },
                h(IconImport, null), h("span", null, t("action.import"))),
            ),
          ),
        );
      }

      // —— 列表页 ——
      return h("div", { className: "dmm-root" },
        h("h1", { className: "dmm-title" }, t("section.title")),
        h("div", { className: "dmm-toolbar" },
          h("div", { className: "dmm-toolbarLeft" },
            h(ScopePicker, { scopes, value: scopeId, onChange: setScopeId }),
            h("div", { className: "dmm-divider" }),
            h("div", { className: "dmm-meta" }, t("toolbar.count", { n: state ? state.totals.all : 0 })),
          ),
          h("div", { className: "dmm-searchWrap" },
            h(IconSearch, null),
            h("input", {
              className: "dmm-search",
              type: "search",
              value: query,
              placeholder: t("toolbar.search"),
              onChange: (event) => setQuery(event.target.value),
            }),
          ),
        ),

        h("section", null,
          h("div", { className: "dmm-sectionHead" },
            h("div", { className: "dmm-sectionTitle" },
              t("section.installed"),
              h("span", { className: "dmm-sectionCount" }, String(servers.length)),
            ),
            h("div", { className: "dmm-actions" },
              h("div", { className: "dmm-scope", ref: menuRef },
                h("button", {
                  type: "button",
                  className: "dmm-iconBtn",
                  title: t("action.more"),
                  "aria-label": t("action.more"),
                  "aria-haspopup": "menu",
                  "aria-expanded": menuOpen ? "true" : "false",
                  onClick: () => setMenuOpen((value) => !value),
                }, h(IconMore, null)),
                menuOpen ? h("div", { className: "dmm-menu dmm-menuRight", role: "menu" },
                  h("button", {
                    type: "button",
                    className: "dmm-menuItem",
                    onClick: () => { setMenuOpen(false); openImport(); },
                  }, h(IconImport, null), h("span", null, t("action.import"))),
                ) : null,
              ),
              h("button", {
                type: "button",
                className: "dmm-iconBtn",
                title: t("action.refresh"),
                "aria-label": t("action.refresh"),
                onClick: () => void load(scopeId),
              }, h(IconRefresh, null)),
              h("button", { type: "button", className: "dmm-primary", onClick: openCreate },
                h(IconPlus, null), h("span", null, t("action.new"))),
            ),
          ),

          error ? h("div", { className: "dmm-error", style: { marginBottom: "12px" } }, error) : null,
          notice ? h("div", { className: "dmm-note", style: { marginBottom: "12px" } }, notice) : null,

          servers.length === 0
            ? h("div", { className: "dmm-empty" },
              h("div", { className: "dmm-emptyTitle" }, t("empty.title")),
              h("div", { className: "dmm-emptyDesc" }, t("empty.desc")),
              h("div", { className: "dmm-emptyActions" },
                h("button", { type: "button", className: "dmm-primary dmm-lg", onClick: openCreate },
                  h(IconPlus, null), h("span", null, t("empty.new"))),
                h("button", { type: "button", className: "dmm-secondary dmm-lg", onClick: openImport },
                  h(IconImport, null), h("span", null, t("action.import"))),
              ),
            )
            : filtered.length === 0
              ? h("div", { className: "dmm-state" }, t("state.empty"))
              : h("div", { className: "dmm-list" },
                filtered.map((server) => h(ServerCard, {
                  key: server.serverName,
                  server,
                  onToggle: (item, next) => void run(() => apiPost("/servers/toggle", { scope: scopeId, serverName: item.serverName, enabled: next })),
                  onEdit: openEdit,
                  onReconnect: (item) => void run(() => apiPost("/servers/reconnect", { scope: scopeId, serverName: item.serverName })),
                  onDelete: (item) => {
                    if (typeof window === "undefined" || window.confirm(tr(currentT, "action.delete") + " " + item.serverName + "?")) {
                      void run(() => apiPost("/servers/delete", { scope: scopeId, serverName: item.serverName }));
                    }
                  },
                })),
              ),
        ),

        providedGroups.map(([category, items]) => h("section", { key: category, style: { marginTop: "8px" } },
          h("div", { className: "dmm-sectionHead" },
            h("div", { className: "dmm-sectionTitle" },
              tr(currentT, "group." + category),
              h("span", { className: "dmm-sectionCount" }, String(items.length)),
            ),
          ),
          h("div", { className: "dmm-list" },
            items.map((server) => h(ProvidedCard, { key: server.id, server })),
          ),
        )),
      );
    }

    /** 表单模式字段。 */
    function renderForm(s) {
      const { t, form, setForm, editing } = s;
      const set = (patch) => setForm((value) => ({ ...value, ...patch }));
      return h(React.Fragment, null,
        h("div", { className: "dmm-field" },
          h("span", { className: "dmm-label" }, t("form.name")),
          h("input", {
            className: "dmm-input",
            value: form.serverName,
            placeholder: t("form.namePlaceholder"),
            disabled: Boolean(editing),
            onChange: (event) => set({ serverName: event.target.value }),
          }),
        ),
        h("div", { className: "dmm-field" },
          h("span", { className: "dmm-label" }, t("form.type")),
          h("select", {
            className: "dmm-input",
            value: form.transport,
            onChange: (event) => set({ transport: event.target.value }),
          },
            h("option", { value: "stdio" }, t("form.type.stdio")),
            h("option", { value: "streamable-http" }, t("form.type.http")),
          ),
        ),
        h("div", { className: "dmm-field" },
          h("span", { className: "dmm-label" }, t("form.timeout")),
          h("input", {
            className: "dmm-input",
            type: "number",
            min: "1",
            value: String(form.toolCallTimeoutMs),
            onChange: (event) => set({ toolCallTimeoutMs: event.target.value }),
          }),
        ),
        h("div", { className: "dmm-field" },
          h("span", { className: "dmm-label" }, t("form.protocol")),
          h("select", { className: "dmm-input", value: "auto", disabled: true },
            h("option", { value: "auto" }, t("form.protocol.auto")),
          ),
          h("div", { className: "dmm-hint" }, t("form.protocol.hint")),
        ),
        form.transport === "stdio"
          ? h(React.Fragment, null,
            h("div", { className: "dmm-field" },
              h("span", { className: "dmm-label" }, t("form.command")),
              h("input", {
                className: "dmm-input",
                value: form.command,
                placeholder: t("form.commandPlaceholder"),
                onChange: (event) => set({ command: event.target.value }),
              }),
            ),
            h("div", { className: "dmm-field" },
              h("span", { className: "dmm-label" }, t("form.args")),
              h("input", {
                className: "dmm-input",
                value: form.args,
                placeholder: t("form.argsPlaceholder"),
                onChange: (event) => set({ args: event.target.value }),
              }),
            ),
            h("div", { className: "dmm-field" },
              h("button", {
                type: "button",
                className: "dmm-disclosure",
                onClick: () => set({ env: form.env.trim() === "" ? "{\n  \"MY_API_KEY\": \"your-key\"\n}" : "" }),
              }, h(IconCaret, { width: 12, height: 12, style: { transform: form.env.trim() === "" ? "rotate(-90deg)" : "none" } }), h("span", null, t("form.env"))),
              form.env.trim() === "" ? null : h("textarea", {
                className: "dmm-textarea",
                style: { minHeight: "90px" },
                value: form.env,
                spellCheck: false,
                onChange: (event) => set({ env: event.target.value }),
              }),
            ),
          )
          : h(React.Fragment, null,
            h("div", { className: "dmm-field" },
              h("span", { className: "dmm-label" }, t("form.url")),
              h("input", {
                className: "dmm-input",
                value: form.url,
                placeholder: t("form.urlPlaceholder"),
                onChange: (event) => set({ url: event.target.value }),
              }),
            ),
            h("div", { className: "dmm-field" },
              h("button", {
                type: "button",
                className: "dmm-disclosure",
                onClick: () => set({ headers: form.headers.trim() === "" ? "{\n  \"Authorization\": \"Bearer token\"\n}" : "" }),
              }, h(IconCaret, { width: 12, height: 12, style: { transform: form.headers.trim() === "" ? "rotate(-90deg)" : "none" } }), h("span", null, t("form.headers"))),
              form.headers.trim() === "" ? null : h("textarea", {
                className: "dmm-textarea",
                style: { minHeight: "90px" },
                value: form.headers,
                spellCheck: false,
                onChange: (event) => set({ headers: event.target.value }),
              }),
            ),
          ),
      );
    }

    /** JSON 模式字段。 */
    function renderJson(s) {
      const { t, jsonText, setJsonText } = s;
      return h(React.Fragment, null,
        h("div", { className: "dmm-field" },
          h("span", { className: "dmm-label" }, t("form.jsonLabel")),
          h("textarea", {
            className: "dmm-textarea",
            style: { minHeight: "300px" },
            value: jsonText,
            spellCheck: false,
            onChange: (event) => setJsonText(event.target.value),
          }),
          h("div", { className: "dmm-hint" }, t("form.jsonHint")),
        ),
      );
    }

    /* ---------------------------------------------------------------- */
    /* 装配                                                              */
    /* ---------------------------------------------------------------- */

    /**
     * 插件入口：注册字典与设置分区。
     * @param {any} ctx
     */
    function apply(ctx) {
      ensureStyles();
      if (ctx === null || typeof ctx !== "object" || !ctx.slots) {
        console.warn("[dsh-mcp-manager] 宿主未提供 slots，设置分区未注册。");
        return;
      }
      // 国际化：宿主 @deepseek-ai/dsh-client-locale 提供 ctx.locale。
      // 字典注册走 ctx.effect——卸载时自动注销，避免热重载后「同一命名空间重复注册」抛错。
      let boundT = null;
      if (ctx.locale !== null && ctx.locale !== undefined) {
        ctx.effect(
          () => ctx.locale.register(LOCALE_NS, LOCALE_DICT),
          "dsh-mcp-manager: locale dictionary",
        );
        // 绑定函数引用稳定，但每次调用读**当前**语言——分区 label 用它即可跟随切换
        boundT = ctx.locale.bind(LOCALE_NS);
        currentT = boundT;
      } else {
        console.warn("[dsh-mcp-manager] 宿主未提供 locale，分区保持中文。");
      }
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "dsh-mcp-manager",
            // 10.5：紧贴「模型」(10) 下方、「技能」(11) 上方
            order: 10.5,
            // 声明 locale 命名空间：宿主据此注入 t prop（引用随语言切换而变 → 自动重渲染）
            locale: LOCALE_NS,
            label: () => tr(boundT, "section.title"),
          },
          Panel,
        ),
      );
    }

    const inject = ["slots", "locale"];

    exports.apply = apply;
    exports.inject = inject;
    // 纯函数直测面：不依赖 React/DOM 的部分可在 node 里直接断言。
    exports.__pure = Object.freeze({
      localeDict: LOCALE_DICT,
      localeNs: LOCALE_NS,
      interpolate,
      fallbackT,
      tr,
      localizeError,
      jsonTemplate: JSON_TEMPLATE,
    });
    return module.exports;
  },
});
