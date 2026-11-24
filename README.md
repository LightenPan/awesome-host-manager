# Awesome Host manager

> 又双叕一个浏览器 host 管理工具 Yet another host manager tools(Chrome / Firefox extension).

## Screenshot

![Awesome Host manager](https://user-images.githubusercontent.com/458894/32358417-e557f8ae-c080-11e7-9a62-c3b7d334e741.png)

## Features

* 秒切 host 无延迟 😎
* 基于浏览器代理 ❤️
* 已启用 host 的域名自动从 HTTPS 跳转到 HTTP 🔁
* 兼容 socket 代理 🤔
* 简洁好用，无多余功能 👏

## Install

- [Chrome 应用商店](https://chrome.google.com/webstore/detail/awesome-host-manager/pikaoeecieigblebdddckmlegonlogha?hl=zh-CN)（建议）
- [下载 .crx 文件](https://raw.githubusercontent.com/keelii/awesome-host-manager/master/awesome-host-manager.crx) chrome 中打开 chrome://extensions/ 将.crx 文件托进安装即可
- Firefox（142+）：运行 `npm run build:firefox`，在 `about:debugging#/runtime/this-firefox` 中选择“临时载入附加组件”，然后选择 `build/firefox/manifest.json`

Firefox 正式版不能永久安装未签名的扩展。`build/*.xpi` 可提交到 [Mozilla Add-ons](https://addons.mozilla.org/developers/) 签名后安装。若切换 hosts 时提示权限不足，请在 Firefox 的扩展管理中允许本扩展“在隐私窗口中运行”。

## Build

```bash
npm install
npm run build:chrome   # build/chrome + Chrome .zip
npm run build:firefox  # build/firefox + Firefox .xpi
npm run build:all      # 两个版本都构建
```

## Design previews

```bash
npm run preview:designs
```

打开 `http://127.0.0.1:4173/preview/` 可对比三套可交互界面设计：
`Obsidian Control`、`Host Ledger` 和 `Aurora Workspace`。

## HTTPS fallback

当某个分组已启用，且其中包含 IP 到域名的 host 映射时，扩展会自动把该域名的主页面请求从
`https://` 重定向到 `http://`，同时保留路径和查询参数。关闭分组或总开关后，对应规则会自动移除。

该功能依赖 `declarativeNetRequest`。如果目标站点启用了 HSTS，或 HTTP 服务器本身强制跳回
HTTPS，浏览器仍可能阻止降级访问。


## Host proxy

和 host 文件规则一致
```
192.168.100.1 your.domain.com your-anther.domain.com
```

## Socket proxy

新建分组加入以下规则（按自己实际情况修改）
```
SOCKS5 127.0.0.1:1080
SOCKS 127.0.0.1:1080
```

## License

[MIT](https://opensource.org/licenses/MIT)

## Thanks

* [bulma](https://bulma.io/)
* [react](https://reactjs.org/)

## Support

![Support this project](https://user-images.githubusercontent.com/458894/32358969-179e7a28-c085-11e7-882a-485164168f74.png)
