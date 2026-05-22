# 竞品监测系统方案

## 1. 背景与目标

本系统用于持续监测美团、大众点评等本地生活平台上的竞品门店、商圈、商品 SKU、价格、促销与销量信号，帮助运营团队进行选址、定价、上新、促销和商圈竞争分析。

核心目标：

- 统一沉淀竞品门店与商品数据，支持跨平台、跨城市、跨商圈对比。
- 跟踪 SKU 上架、下架、改价、促销、销量信号、评价变化等动态。
- 建立商圈维度的竞争强度、价格带、热卖品类和门店覆盖分析。
- 对关键变化提供告警，例如竞品新品上架、价格下调、爆品销量异常增长。
- 保留数据来源、采集时间、置信度和审计信息，便于复核。

## 2. 合规边界

竞品监测必须基于合法、合规、可审计的数据来源。系统设计应遵守平台服务条款、robots 规则、隐私保护和数据安全要求。

允许的数据接入方式：

1. 平台官方、开放平台、合作伙伴或已授权 API。
2. 合法采购的第三方数据服务。
3. 企业自有账号、商家后台或经营系统中可导出的授权数据。
4. 人工调研、线下巡店或外部调研团队提供的结构化数据。
5. 在平台条款允许范围内的公开页面监测，且不绕过登录、验证码、限流、反爬或访问控制。

明确不做：

- 不绕过平台登录、验证码、签名、加密、风控或反爬机制。
- 不采集、存储或分析消费者个人身份信息。
- 不伪造设备、账号、地理位置或请求来源以规避平台限制。
- 不进行高频访问、批量压测或影响第三方平台稳定性的行为。

## 3. 监测范围

### 3.1 门店与位置

- 平台：美团、大众点评，后续可扩展抖音本地生活、高德、百度地图等。
- 门店基础信息：平台门店 ID、门店名称、品牌、品类、地址、经纬度、行政区、商圈、营业时间。
- 门店经营信息：评分、评价数、人均消费、榜单标签、服务标签、营业状态。
- 空间分析：门店周边竞品密度、距离最近竞品、商圈覆盖、半径竞争强度。

### 3.2 商品 SKU

- SKU 基础信息：商品名称、规格、品类、图片、描述、适用门店、平台 SKU ID。
- 价格信息：原价、到手价、团购价、折扣、券后价、起售门槛、配送/到店限制。
- 商品状态：上架、下架、售罄、限时促销、新品、热销。
- 销量信号：平台展示销量、销量区间、月售标签、评价增量、榜单排名等。

### 3.3 商圈与城市

- 城市、行政区、商圈、购物中心、交通枢纽、学校、写字楼等地理维度。
- 商圈价格带、热卖品类、竞品门店数量、竞品 SKU 覆盖率。
- 自有门店与竞品门店在同商圈、同半径、同品类下的对比。

## 4. 核心业务问题

系统需要回答以下问题：

- 某城市/商圈有哪些主要竞品？门店分布在哪里？
- 竞品最近上新了哪些 SKU？哪些 SKU 下架或改价？
- 同类 SKU 的价格带、折扣力度和促销频率如何？
- 某竞品或某商圈的销量信号是否明显变化？
- 自有门店周边 1 公里/3 公里内有哪些竞品，价格和热卖 SKU 如何？
- 哪些商圈存在高增长、高客单、低竞争或强竞争机会？

## 5. 系统架构

```text
数据源层
  ├─ 官方/授权 API
  ├─ 第三方数据供应商
  ├─ 商家后台授权导出
  ├─ 人工调研/CSV 导入
  └─ 合规公开页面监测

采集与治理层
  ├─ Source Connector：按来源封装接入逻辑
  ├─ Scheduler：任务调度、重试、限速
  ├─ Raw Store：保存原始响应/文件与采集证据
  ├─ Normalizer：字段标准化、单位换算、枚举映射
  ├─ Geo Processor：经纬度校验、地理编码、商圈归属
  ├─ SKU Matcher：跨平台/跨门店 SKU 匹配
  └─ Data Quality：完整性、重复、异常与置信度校验

数据服务层
  ├─ PostgreSQL + PostGIS：核心结构化与空间数据
  ├─ Object Storage：原始文件、截图、导入附件
  ├─ Metrics Engine：价格、销量信号、商圈指标计算
  ├─ Alert Engine：规则告警、阈值告警、变化告警
  └─ API Service：查询、导出、看板服务

应用层
  ├─ 竞品地图
  ├─ 商圈分析
  ├─ SKU 对比
  ├─ 价格/促销趋势
  ├─ 销量信号趋势
  ├─ 告警中心
  └─ 数据导入与审核后台
```

## 6. 数据模型

### 6.1 关键实体

| 实体 | 说明 |
| --- | --- |
| `platform` | 数据平台，例如美团、大众点评 |
| `competitor_brand` | 竞品品牌 |
| `competitor_store` | 竞品门店主数据 |
| `business_district` | 商圈与地理边界 |
| `store_snapshot` | 门店在某一时间点的平台展示快照 |
| `sku` | 标准化商品 SKU |
| `platform_sku` | 平台侧 SKU，保留平台 ID 和原始名称 |
| `sku_snapshot` | SKU 在某一时间点的价格、状态、促销快照 |
| `sales_signal` | 销量相关信号，包含平台展示值、估算值和置信度 |
| `monitoring_task` | 监测任务配置 |
| `source_record` | 原始数据来源、采集证据与审计记录 |
| `alert_rule` | 告警规则 |
| `alert_event` | 告警事件 |

### 6.2 样例表结构

```sql
create table platform (
  id bigserial primary key,
  code text not null unique,
  name text not null
);

create table competitor_brand (
  id bigserial primary key,
  name text not null,
  category text,
  created_at timestamptz not null default now()
);

create table business_district (
  id bigserial primary key,
  city text not null,
  district text,
  name text not null,
  boundary geometry(MultiPolygon, 4326),
  center geometry(Point, 4326)
);

create table competitor_store (
  id bigserial primary key,
  brand_id bigint references competitor_brand(id),
  name text not null,
  address text,
  city text,
  district text,
  business_district_id bigint references business_district(id),
  location geometry(Point, 4326),
  normalized_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table store_snapshot (
  id bigserial primary key,
  store_id bigint not null references competitor_store(id),
  platform_id bigint not null references platform(id),
  platform_store_id text not null,
  captured_at timestamptz not null,
  rating numeric(3, 2),
  review_count integer,
  average_price numeric(12, 2),
  business_status text,
  rank_label text,
  source_record_id bigint,
  unique (platform_id, platform_store_id, captured_at)
);

create table sku (
  id bigserial primary key,
  canonical_name text not null,
  category text,
  specification text,
  unit text,
  created_at timestamptz not null default now()
);

create table platform_sku (
  id bigserial primary key,
  sku_id bigint references sku(id),
  platform_id bigint not null references platform(id),
  platform_sku_id text not null,
  platform_store_id text,
  raw_name text not null,
  raw_category text,
  unique (platform_id, platform_sku_id)
);

create table sku_snapshot (
  id bigserial primary key,
  platform_sku_id bigint not null references platform_sku(id),
  store_id bigint references competitor_store(id),
  captured_at timestamptz not null,
  list_price numeric(12, 2),
  sale_price numeric(12, 2),
  final_price numeric(12, 2),
  discount_text text,
  promotion_text text,
  inventory_status text,
  listing_status text,
  source_record_id bigint
);

create table sales_signal (
  id bigserial primary key,
  platform_sku_id bigint references platform_sku(id),
  store_id bigint references competitor_store(id),
  captured_at timestamptz not null,
  signal_type text not null,
  raw_value text,
  normalized_value numeric(18, 4),
  confidence numeric(5, 4) not null default 0,
  source_record_id bigint
);
```

### 6.3 销量字段处理原则

美团/大众点评等平台不一定公开精确销量。系统应区分“事实字段”和“推断字段”：

- 事实字段：平台明确展示的销量、月售、评价数、榜单名次、价格、状态。
- 推断字段：由评价增量、排名变化、展示销量区间、促销节奏等推算的销量趋势。
- 每个推断字段必须保存 `confidence`、计算方法版本和输入数据范围。
- 报表中应明确标注“平台展示值”“估算值”“趋势信号”，避免混用。

## 7. SKU 标准化与匹配

SKU 匹配建议分三层：

1. 规则匹配：品牌、品类、规格、单位、关键词、套餐人数。
2. 相似度匹配：名称分词、同义词、规格归一化、价格区间。
3. 人工审核：低置信度匹配进入待审核队列。

匹配结果需要记录：

- `canonical_sku_id`
- `match_method`
- `match_score`
- `review_status`
- `reviewer`
- `reviewed_at`

## 8. 指标体系

### 8.1 门店指标

- 竞品门店数
- 商圈覆盖率
- 平均评分、评价数、人均消费
- 同半径竞品密度
- 门店新增/关闭/状态变化

### 8.2 SKU 指标

- SKU 数量、上新数、下架数
- 价格带分布
- 促销 SKU 占比
- 折扣深度
- 同款/相似 SKU 价格差
- 热卖 SKU 榜单变化

### 8.3 销量信号指标

- 平台展示销量变化
- 评价增量
- 销量趋势指数
- 商圈热度指数
- 品类增长信号

## 9. 告警规则

建议先支持规则型告警：

- 竞品在指定商圈新增门店。
- 竞品 SKU 新上架或下架。
- 同类 SKU 价格低于自有 SKU 超过指定比例。
- 竞品 SKU 在 24 小时内降价超过指定金额。
- 销量信号或评价增量超过过去 7 天均值的指定倍数。
- 指定竞品进入平台榜单或排名上升。

告警渠道：

- 站内通知
- 企业微信/飞书/钉钉
- 邮件
- Webhook

## 10. API 草案

```text
GET /api/competitors/stores
GET /api/competitors/stores/{store_id}
GET /api/competitors/stores/{store_id}/snapshots

GET /api/skus
GET /api/skus/{sku_id}/price-history
GET /api/skus/{sku_id}/sales-signals

GET /api/business-districts
GET /api/business-districts/{id}/competitor-summary

POST /api/imports/manual
GET /api/imports/{import_id}/errors

GET /api/alerts
POST /api/alerts/rules
PATCH /api/alerts/rules/{rule_id}
```

## 11. MVP 范围

第一阶段建议聚焦“可用且可审计”：

1. 支持手工 CSV/Excel 导入竞品门店、SKU、价格、销量信号。
2. 支持美团/大众点评两个平台的数据源字段映射。
3. 建立 PostgreSQL + PostGIS 数据模型。
4. 支持门店地图、商圈列表、SKU 价格对比、价格历史趋势。
5. 支持新品上架、下架、降价、销量信号变化四类告警。
6. 每条数据保留来源、采集/导入时间、负责人和备注。

第二阶段再扩展自动化：

1. 接入官方/授权 API 或第三方数据供应商。
2. 增加任务调度、增量同步、失败重试和数据质量规则。
3. 增加 SKU 自动匹配与人工审核工作台。
4. 增加商圈热度、价格带、促销节奏、竞品密度等分析模型。

## 12. 推荐技术栈

在没有既有技术栈约束时，建议：

- 后端：Python + FastAPI。
- 数据库：PostgreSQL + PostGIS。
- 异步任务：Celery/RQ 或 Airflow/Prefect，取决于任务复杂度。
- 前端：React + 地图 SDK。
- 数据导入：CSV/Excel 解析 + 字段映射模板。
- 可视化：地图、趋势折线、价格带箱线图、商圈热力图。
- 部署：Docker Compose 起步，后续迁移到 Kubernetes 或云托管服务。

## 13. 数据质量与审计

每次采集或导入都应生成 `source_record`：

- 数据来源类型。
- 来源名称和授权说明。
- 原始文件或响应摘要。
- 采集/导入时间。
- 操作人或任务 ID。
- 字段完整性检查结果。
- 去重和标准化结果。

关键质量规则：

- 经纬度不能为空且必须落在城市范围内。
- 同平台门店 ID 不应重复映射到多个门店。
- SKU 价格不能为负数。
- 同一 SKU 快照不应在同一时间窗口重复写入。
- 商圈归属变更需要记录原因。

## 14. 风险与应对

| 风险 | 应对 |
| --- | --- |
| 平台不公开精确销量 | 使用平台展示值与趋势信号，明确置信度 |
| 数据来源不稳定 | 多来源接入，保留原始证据，增加数据质量告警 |
| SKU 名称不统一 | 建立标准 SKU 与人工审核机制 |
| 商圈边界不一致 | 引入统一商圈边界，记录来源版本 |
| 合规风险 | 只接入授权数据，不绕过访问控制，保留审计记录 |
| 运营误读估算指标 | 报表标注事实/估算/趋势信号，并展示置信度 |

## 15. 后续实施清单

- 确认目标城市、品类、品牌和首批竞品清单。
- 确认数据来源授权方式和字段样例。
- 明确是否已有 BI、CRM、ERP、门店主数据系统需要对接。
- 设计首批 CSV/Excel 导入模板。
- 建立数据库迁移、后端 API 和前端看板项目骨架。
- 选定地图与商圈边界数据来源。
