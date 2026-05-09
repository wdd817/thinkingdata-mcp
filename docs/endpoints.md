# Endpoint Coverage

The catalog in `src/catalog.ts` contains 100 entries from the ThinkingData TE Open API documentation.

Main groups:

- 数据自定义查询 API: synchronous SQL, async SQL submit/status/page/cancel.
- 模型查询 API: event, retention, funnel, distribution, path, interval, user property, user list, and streaming download endpoints.
- 指标查询 API: metric list and metric data.
- 用户分群和标签 API: create, list, detail, update, refresh, delete, upload ID cluster, and tag date refresh.
- 维度表/数据表 API: dict create, datatable upload/create/update/bind/unbind.
- 生成 SQL 语句 API: generate user-search SQL.
- 元数据管理 API: events, properties, virtual events, SQL virtual properties, dimension property deletion.
- 看板报表管理 API: reports, dashboard import, spaces, members, deletion.
- 用户管理 API: user roles, groups, SSO users, lock/unlock, blacklists, MFA unbind.
- 项目管理 API: project list, create project app id, update project info.

Use `thinkingdata_catalog` at runtime for the exact endpoint names and paths.
