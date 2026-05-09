# ThinkingData MCP

ThinkingData TE Open API 的 stdio MCP server。它基于 ThinkingData Open API 文档整理了接口目录，并提供通用请求、SQL 查询、模型查询、文件上传等 MCP tools。

This is an unofficial community MCP server and is not affiliated with ThinkingData.

## 配置

先构建：

```bash
npm install
npm run build
```

在 MCP client 中配置：

```json
{
  "mcpServers": {
    "thinkingdata": {
      "command": "node",
      "args": ["C:/Users/BigFoot/Workspace/bigfoot/thinkingdata-mcp/dist/index.js"],
      "env": {
        "THINKINGDATA_BASE_URL": "http://ta2:8992",
        "THINKINGDATA_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

`THINKINGDATA_BASE_URL` 支持带路径前缀的地址，例如 `https://example.com/te/`。API secret 可以用文档里的 `ta-tool generate_root_secret` 或 `ta-tool generate_api_secret -appid ...` 生成。

## Tools

- `thinkingdata_catalog`: 搜索接口目录，返回 `endpointName`、路径、方法和文档链接。
- `thinkingdata_request`: 通用 Open API 调用器。传 `endpointName` 或 `path`，支持 JSON、form、multipart 和 raw body。
- `thinkingdata_sql_query`: 调用 `/querySql` 同步 SQL 查询。
- `thinkingdata_sql_submit`: 调用 `/open/submit-sql` 提交异步 SQL 任务。
- `thinkingdata_sql_task_info`: 查询 SQL 任务状态。
- `thinkingdata_sql_result_page`: 获取 SQL 分页结果。
- `thinkingdata_model_query`: 调用事件、留存、漏斗、分布、路径、间隔、用户属性、指标等模型查询接口。
- `thinkingdata_upload_file`: multipart 文件上传辅助工具，适用于数据表文件上传、上传 ID 分群等接口。

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
  "sql": "select \"#country\", \"#province\" from v_event_102 limit 100",
  "format": "json",
  "timeoutSeconds": 10
}
```

调用事件分析：

```json
{
  "endpointName": "event_analyze",
  "body": {
    "projectId": 0,
    "events": []
  }
}
```

也可以直接走通用请求：

```json
{
  "endpointName": "list_event_meta",
  "query": {
    "projectId": 0
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
