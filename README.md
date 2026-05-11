# ThinkingData MCP

ThinkingData TE Open API 的 stdio MCP server。它基于 ThinkingData Open API 文档整理接口目录，并提供通用请求、SQL 查询、模型查询、文件上传等 MCP tools。

This is an unofficial community MCP server and is not affiliated with ThinkingData.

## 快速使用

推荐直接通过 `npx` 运行，无需全局安装：

```bash
npx -y thinkingdata-mcp
```

MCP client 配置示例：

```json
{
  "mcpServers": {
    "thinkingdata": {
      "command": "npx",
      "args": ["-y", "thinkingdata-mcp"],
      "env": {
        "THINKINGDATA_BASE_URL": "http://ta2:8992",
        "THINKINGDATA_API_SECRET": "your-api-secret",
        "THINKINGDATA_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

也可以全局安装后运行：

```bash
npm install -g thinkingdata-mcp
thinkingdata-mcp
```

本地开发运行：

```bash
npm install
npm run build
node dist/index.js
```

## 配置项

- `THINKINGDATA_BASE_URL`: TE Open API base URL，例如 `http://ta2:8992`，也支持 `https://example.com/te/` 这类路径前缀。
- `THINKINGDATA_API_SECRET`: Open API 查询密钥，也可用 `THINKINGDATA_TOKEN`。密钥可按官方文档使用 `ta-tool generate_root_secret` 或 `ta-tool generate_api_secret -appid ...` 生成。
- `THINKINGDATA_PROJECT_ID`: TE 项目 ID，请替换为你自己的数字项目 ID。SQL helper 会用它拼接表名：事件表 `v_event_<PROJECT_ID>`，用户表 `v_user_<PROJECT_ID>`。

## SQL 表名和日期规则

`thinkingdata_sql_query` 与 `thinkingdata_sql_submit` 支持这些 SQL 占位符：

- `{{event_table}}` -> `v_event_<PROJECT_ID>`
- `{{user_table}}` -> `v_user_<PROJECT_ID>`
- `{{project_id}}` -> `<PROJECT_ID>`

如果配置了 `THINKINGDATA_PROJECT_ID`，SQL 里的裸表名 `v_event` 和 `v_user` 也会自动展开为带项目 ID 的表名。

事件表查询必须包含 `$part_date` 过滤条件。若 SQL 引用了事件表但没有提供 `$part_date` 条件，MCP 会默认补上最近 7 天：

```sql
where "$part_date" between 'YYYY-MM-DD' and 'YYYY-MM-DD'
```

你可以显式写条件：

```sql
select "#country", count(*)
from {{event_table}}
where "$part_date" between '2026-05-05' and '2026-05-11'
group by "#country"
```

也可以不写 `$part_date`，让工具自动补最近 7 天：

```json
{
  "sql": "select \"#country\", count(*) from {{event_table}} group by \"#country\"",
  "format": "json"
}
```

需要指定默认日期范围时，传 `eventDateStart` / `eventDateEnd`：

```json
{
  "sql": "select count(*) from {{event_table}}",
  "eventDateStart": "2026-05-01",
  "eventDateEnd": "2026-05-07"
}
```

## Tools

- `thinkingdata_catalog`: 搜索接口目录，返回 `endpointName`、路径、方法和文档链接。
- `thinkingdata_request`: 通用 Open API 调用器。传 `endpointName` 或 `path`，支持 JSON、form、multipart 和 raw body。
- `thinkingdata_sql_query`: 调用 `/querySql` 同步 SQL 查询，并处理项目表名和事件表 `$part_date` 默认条件。
- `thinkingdata_sql_submit`: 调用 `/open/submit-sql` 提交异步 SQL 任务，并处理项目表名和事件表 `$part_date` 默认条件。
- `thinkingdata_sql_task_info`: 查询 SQL 任务状态。
- `thinkingdata_sql_result_page`: 获取 SQL 分页结果。
- `thinkingdata_model_query`: 调用事件、留存、漏斗、分布、路径、间隔、用户属性、指标等模型查询接口。
- `thinkingdata_upload_file`: multipart 文件上传辅助工具，适用于数据表文件上传、上传 ID 分群等接口。

SQL tools 的返回值里会包含 `preparedSql`，用于查看最终发送给 TE 的 SQL。

## 示例

搜索事件分析接口：

```json
{
  "query": "事件分析"
}
```

执行 SQL：

```json
{
  "sql": "select \"#country\", \"#province\" from {{event_table}} limit 100",
  "format": "json",
  "timeoutSeconds": 10
}
```

调用事件分析 Open API：

```json
{
  "endpointName": "event_analyze",
  "body": {
    "projectId": "<your-project-id>",
    "events": []
  }
}
```

也可以直接走通用请求：

```json
{
  "endpointName": "list_event_meta",
  "query": {
    "projectId": "<your-project-id>"
  }
}
```

## Resources

- `thinkingdata://openapi/catalog`: JSON 端点目录。
- `thinkingdata://openapi/usage`: MCP 使用说明。

## 文档来源

实现参考了 ThinkingData Open API 调用规则和各子章节接口，包括：

- https://docs-v2.thinkingdata.cn/?version=v4.4&lan=zh-CN&code=open_api&anchorId=
- https://docs.thinkingdata.cn/ta-manual/latest/technical_document/open_api/open_api.html
- https://docs.thinkingdata.cn/ta-manual/latest/technical_document/open_api/data_api.html
- https://docs.thinkingdata.cn/ta-manual/latest/technical_document/open_api/query_api/event_query_api.html

返回的 URL 会自动隐藏 `token` 值，但仍建议通过环境变量提供密钥。
