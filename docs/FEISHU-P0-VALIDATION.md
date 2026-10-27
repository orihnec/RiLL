# 飞书连接验证说明

配置与使用见 [飞书投递导入](FEISHU-IMPORT-DELIVERY.md)。本文件不包含真实文档定位信息、私人记录或 OAuth 凭据。

## 授权

使用用户自己管理的飞书应用，在 RiLL 本机输入 App ID / App Secret。用户身份权限为 `sheets:spreadsheet:readonly`、`bitable:app:readonly`、`offline_access`；应用版本需发布并按租户要求完成审批，授权用户必须有文档访问权。

重定向地址必须完全一致：

```text
http://127.0.0.1:43829/feishu/callback
```

授权入口为 `accounts.feishu.cn/open-apis/authen/v1/authorize`，令牌交换 / 刷新使用 `accounts.feishu.cn/oauth/v3/token`。读取只向 `open.feishu.cn` 固定表格接口发送授权，禁止重定向。连接身份按应用与用户标识生成，重新连接同一身份可继续去重。

## 内嵌 Base

`/sheets/` 链接可能指向内嵌多维表格，不能直接用父表 token 调用 Base API。读取器先经 Sheets v3 工作表元数据和 v2 metainfo 的 `BITABLE_BLOCK.blockToken` 获取实际 Base token / table ID，再读取字段、视图和记录。

Windows 本机用户 OAuth 已验证真实内嵌关系、字段类型和指定视图的完整读取。源表缺少岗位列时需要补录实际岗位，“流程中”等含义不明的状态需要核对。分页读取不承诺跨请求的强一致快照。

报告仅由用户保存在本机，不能提交报告或包含签名参数的私人申请链接。自动测试使用虚构的资源标识与数据。

## Windows 长凭据

Windows keyring 单项限制为 UTF-16 编码后的 2560 字节。凭据 vault 每段最多 1000 个 UTF-16 代码单元，分段、索引和校验值均存入系统钥匙串。新代完整写入后切换索引，失败保留旧代，刷新和断开时清理分段。

系统文件锁串行处理跨窗口 / 实例的凭据读取与轮换，拿锁后重读最新令牌。锁文件没有密钥，进程退出自动释放锁，不按超时强行解锁活跃持有者。若持锁窗口崩溃，退出并重启 RiLL。

## 验证范围

- Windows 本机：自建应用 OAuth、长凭据保存、真实 Sheets 内嵌 Base 字段及全视图读取、旧数据库追加迁移。
- 自动测试：普通 Sheets / 独立 Base 模拟接口、规则标准化、日期、分类、身份、冲突、分页、凭据异常、原子提交及撤销保护。
- 虚构数据界面检查：映射、缺岗位补录、状态核对和分页。
- 待补充：普通 Sheets / 独立 Base 真实文档联调、macOS 真机验证。真实业务数据须由用户核对实际岗位后确认导入。

## 接口参考

- [飞书 OAuth 授权码](https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code)
- [工作表元数据](https://open.feishu.cn/document/server-docs/historic-version/docs/sheets/obtain-spreadsheet-metadata)
- [读取单个范围](https://open.feishu.cn/document/server-docs/docs/sheets-v3/data-operation/reading-a-single-range)
- [多维表格概述](https://open.feishu.cn/document/server-docs/docs/bitable-v1/bitable-overview)
