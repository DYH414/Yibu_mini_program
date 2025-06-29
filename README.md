# 一布校园外卖聚合平台

## 🚀 项目简介

这是一个基于微信小程序云开发技术构建的校园外卖聚合平台。旨在解决当前校园内美团、饿了么、商家自营小程序等外卖平台分散，信息不统一，学生查找外卖商家不便的痛点。本平台统一整合校内优质外卖商家信息，提供集中展示、智能搜索、用户互动（评分、评论、收藏）以及多平台快捷跳转等功能，大幅提升学生点餐效率与体验。

## ✨ 功能特点

*   **分类浏览**：支持按"全部"、"正餐"、"小吃"、"汉堡"、"奶茶"、"外卖平台"等多种分类快速筛选商家。
*   **商家详情**：展示商家详细信息，包括 Logo、描述、评分、评论、支持的平台列表。
*   **评分系统**：用户可为商家进行 1-5 星评分，并查看平均评分及评分数量。
*   **评论互动**：支持用户发布评论，评论可被其他用户点赞，并按点赞数智能排序；用户可长按删除自己的评论。
*   **商家收藏**：用户可收藏喜欢的商家，方便在"我的"页面快速访问。
*   **智能搜索**：提供商家名称和描述的关键词搜索功能，支持搜索历史记录。
*   **多平台跳转**：实现一键快捷跳转至美团、饿了么等外部小程序，无缝切换不同外卖服务商。
*   **微信登录**：集成微信官方授权登录，获取用户基本信息（昵称、头像），支持用户自定义修改个人资料。
*   **个人中心**：展示用户信息、收藏列表、我的评论和我的评分，支持联系客服、查看用户协议和隐私政策。

## 🛠️ 技术栈

*   **前端**：
    *   微信小程序原生框架 (WXML / WXSS / JavaScript)
    *   响应式布局与 `rpx` 单位
    *   组件化开发（如 `search-history`, `custom-tab-bar`）
    *   页面生命周期管理
    *   自定义缓存服务 (`app.js` 中的 `cache` 对象)
*   **后端**：
    *   **微信云开发 (CloudBase)**
        *   **云数据库**：MongoDB 非关系型数据库，用于存储商家、用户、评分、评论、收藏、搜索日志等数据。
        *   **云函数**：`Node.js` 环境，处理核心业务逻辑，实现前后端分离。
        *   **云存储**：用于存储商家 Logo、平台图标、用户头像等图片资源。
*   **开发工具**：
    *   微信开发者工具
    *   Visual Studio Code
    *   Git (版本控制)
    *   AI 辅助编程工具 (如 Cursor，用于提高开发效率)

## 📊 数据库设计 (核心集合)

### `merchants` (商家信息)
*   `_id`: 商家唯一ID
*   `name`: 商家名称 (String)
*   `logoUrl`: 商家Logo图片地址 (云存储fileID/cloudID 或 CDN URL)
*   `description`: 商家描述 (String)
*   `category`: 分类 (String，如 'fast-food', 'snack')
*   `platforms`: 平台信息数组 (Array of Objects)
    *   `name`: 平台名称 (String，如 '美团', '饿了么', '自营')
    *   `appId`: 平台小程序 AppID (String)
    *   `iconUrl`: 平台图标地址 (云存储fileID/cloudID 或 CDN URL)
*   `avgRating`: 平均评分 (Number, 实时聚合)
*   `ratingCount`: 评分总数 (Number, 实时聚合)
*   `commentsCount`: 评论总数 (Number, 实时聚合)
*   `favoritesCount`: 收藏总数 (Number, 实时聚合)
*   `totalClicks`: 总点击量 (Number, 实时聚合)
*   `createTime`: 商家创建时间 (ServerDate)

### `ratings` (用户评分)
*   `_id`: 评分记录ID
*   `merchantId`: 商家ID (String)
*   `userOpenId`: 用户 OpenID (String)
*   `score`: 评分 (Number, 1-5)
*   `timestamp`: 评分时间 (ServerDate)

### `comments` (用户评论)
*   `_id`: 评论记录ID
*   `merchantId`: 商家ID (String)
*   `userOpenId`: 用户 OpenID (String)
*   `content`: 评论内容 (String)
*   `likes`: 点赞数 (Number)
*   `likedBy`: 点赞用户 OpenID 数组 (Array of String)
*   `timestamp`: 评论时间 (ServerDate)

### `favorites` (用户收藏)
*   `_id`: 收藏记录ID
*   `merchantId`: 商家ID (String)
*   `userOpenId`: 用户 OpenID (String)
*   `timestamp`: 收藏时间 (ServerDate)

### `users` (用户信息)
*   `_id`: 用户 OpenID (String, 作为文档ID)
*   `nickname`: 用户昵称 (String)
*   `avatarUrl`: 用户头像地址 (String)
*   `createTime`: 用户创建时间 (ServerDate)
*   `lastLoginTime`: 最后登录时间 (ServerDate) - 建议添加

### `search_logs` (搜索日志 - 可选)
*   `_id`: 日志ID
*   `userOpenId`: 用户 OpenID (String)
*   `keyword`: 搜索关键词 (String)
*   `timestamp`: 搜索时间 (ServerDate)

## ☁️ 云函数设计

项目核心业务逻辑通过以下云函数实现：

*   `login`: 处理用户登录，获取 `OpenID`，并查询或创建用户数据。
*   `getAllMerchants`: 获取所有商家列表，支持按分类、排序（评分、默认综合分）筛选，并在云端完成商家总评分、评论数、收藏数等聚合计算。
*   `rate`: 处理用户对商家的评分提交，并实时更新商家文档的 `avgRating` 和 `ratingCount` 字段。
*   `comment`: 处理用户评论的发布、删除、点赞功能，并更新商家文档的 `commentsCount` 字段及评论的点赞数。
*   `manageFavorite`: 处理用户收藏/取消收藏商家，并更新商家文档的 `favoritesCount` 字段。
*   `search`: 根据关键词、分类、排序等条件，在云端对商家进行模糊搜索，支持分页。
*   `updateMerchantClicks`: 更新商家的点击量（用于衡量热度或推荐权重）。
*   `getMerchantDetail`: 获取商家完整详情，包括其关联的评分、评论等数据。
*   `getPolicies`: 用于获取用户协议和隐私政策内容。
*   `getUsersInfo`: 获取用户信息。
*   `fixMerchantCategory` / `cleanAllDuplicates` / `cleanDuplicateFavorites` / `fixUserInfo` / `deleteComment` / `clearSearchHistory`: 各类数据维护和清理函数。

## 🚀 开发与运行

1.  **环境准备**：
    *   安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
    *   确保您的微信开发者工具基础库版本不低于 2.2.3。
2.  **导入项目**：
    *   在微信开发者工具中，选择"导入项目"。
    *   选择本项目根目录，填写您的微信小程序 AppID。
3.  **配置云环境**：
    *   在 `project.config.json` 中，确保 `cloudfunctionRoot` 指向 `cloudfunctions/` 目录。
    *   在微信开发者工具中开通云开发服务，并创建**云环境**。
    *   将 `app.js` 和 `cloudfunctions/*/index.js` 中所有云函数中的 `env` ID 替换为您自己的云环境 ID。
        *   `app.js` (`wx.cloud.init` 部分)
        *   `cloudfunctions/*/index.js` (所有云函数文件)
4.  **创建云数据库集合**：
    *   在云开发控制台，手动创建以下数据库集合：
        *   `merchants`
        *   `ratings`
        *   `comments`
        *   `favorites`
        *   `users`
        *   `search_logs` (如果需要记录搜索历史)
5.  **上传云函数**：
    *   在微信开发者工具中，右键点击 `cloudfunctions` 目录下的每个云函数文件夹（例如 `login`, `getAllMerchants` 等），选择"上传并部署：所有文件"。
6.  **导入初始商家数据**：
    *   项目根目录下可能存在一个 `database_export-vZiFfarNIOjE.json` 文件。此文件包含示例商家数据，可用于初始化 `merchants` 集合。
    *   在云开发控制台，进入"数据库"-> `merchants` 集合 -> "导入"功能，上传此 JSON 文件。
7.  **上传云存储图片**：
    *   商家 Logo 和平台图标需要手动上传到云存储，并将其 `cloudID` 或 `fileID` 更新到数据库中对应的商家文档。
        *   例如：美团 `cloud://your-env-id/images/meituan.png`，饿了么 `cloud://your-env-id/images/eleme.png`。
        *   用户头像将在用户首次登录或修改个人资料时自动上传。

## 🖼️ 图片资源管理

项目中的图片资源分为两类：

### 本地UI图标 (存储在小程序项目中)
存放于 `images/` 目录下，用于界面的静态图标和图片。
*   `images/categories/`: 分类图标 (如 `all.png`, `fast-food.png`)
*   `images/stars/`: 星级评分图标 (如 `star-full.png`, `star-half.png`)
*   `images/icons/`: 功能图标 (如 `favorite.png`, `like.png`)
*   `images/tabbar/`: 底部导航栏图标 (如 `home.png`, `mine.png`)
*   其他UI图片：`default-avatar.png`, `logo.png`

### 云存储图片 (需手动上传到云存储)
主要用于动态或用户生成的内容，上传后获取 `cloudID` 或 `fileID` 并在数据库中引用。
*   **商家Logo**: 每个商家的 Logo 图片。
*   **平台图标**: 各外卖平台（美团、饿了么等）的图标。
*   **用户头像**: 用户上传的自定义头像。

## 📋 页面功能说明

*   **首页 (`pages/index/index`)**:
    *   顶部展示分类选择器和搜索框。
    *   下方瀑布流展示商家列表，包含 Logo、平均评分、简介和支持的平台。
    *   支持按分类筛选和多种排序方式（默认、按评分）。
*   **商家详情页 (`pages/merchant/detail`)**:
    *   展示商家的基本信息和一键跳转到对应外卖平台的小程序链接。
    *   包含评分区，用户可点击星星评分（1-5星）。
    *   展示评论区，评论按点赞数排序，用户可发表评论、点赞，并长按删除自己的评论。
*   **我的页面 (`pages/mine/mine`)**:
    *   显示用户信息（头像、昵称）。
    *   提供个人信息编辑入口，可修改昵称和头像。
    *   展示用户收藏的商家列表、我的评论和我的评分。
    *   提供用户协议、隐私政策查看及联系客服功能。
*   **登录页 (`pages/login/login`)**:
    *   引导用户进行微信授权登录。
*   **个人资料编辑页 (`pages/profile/edit`)**:
    *   允许用户修改昵称和头像。
*   **搜索页 (`pages/search/search`)**:
    *   提供搜索功能及搜索历史展示。
*   **协议页 (`pages/agreement/agreement`)**:
    *   展示用户协议和隐私政策的具体内容。

## 💡 用户交互说明

*   **评分**: 每个用户只能对同一商家评分一次，评分后实时更新商家平均分。
*   **评论**: 用户可发表评论，长按自己的评论可删除；每条评论只能点赞一次。
*   **收藏**: 用户可方便地收藏/取消收藏商家。
*   **平台跳转**: 点击平台按钮，通过 `wx.navigateToMiniProgram` 一键跳转至对应外卖平台小程序。
*   **数据刷新**: 支持页面下拉刷新，重新加载数据。
*   **加载更多**: 列表支持上拉触底加载更多商家数据。



--- 