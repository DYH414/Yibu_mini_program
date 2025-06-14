# 一布校园外卖聚合平台

这是一个微信小程序项目，为大学生提供校园外卖聚合服务，让用户在一个平台上就能浏览和跳转至各种外卖服务商（美团、饿了么等）。

## 功能特点

- 分类浏览：支持按全部、快餐、小吃、汉堡、奶茶、外卖平台、其他等分类查看
- 商家评分：用户可以为商家评星（1-5星），每用户仅能评分一次
- 评论互动：支持用户评论和点赞评论，评论按点赞数排序
- 收藏商家：收藏喜欢的商家，方便下次访问
- 微信登录：使用微信官方登录功能，默认头像和昵称，支持自定义修改
- 多平台跳转：支持一键跳转到各外卖平台的小程序（如美团、饿了么等）

## 技术架构

- 前端：微信小程序原生开发
- 后端：微信云开发
  - 云数据库：存储商家、评分、评论等信息
  - 云函数：处理登录、评分、评论、收藏等功能
  - 云存储：存储商家logo和平台图标

## 数据库设计

### merchants（商家信息）
- name: 商家名称
- logoUrl: 商家logo图片地址（云存储外链）
- description: 商家描述
- category: 分类（快餐、小吃、汉堡、奶茶等）
- platforms: 平台信息数组 [ { name, appId, iconUrl } ]
- createTime: 创建时间

### ratings（用户评分）
- merchantId: 商家ID
- userOpenId: 用户OpenID
- score: 评分（1-5分）
- timestamp: 评分时间

### comments（用户评论）
- merchantId: 商家ID
- userOpenId: 用户OpenID
- content: 评论内容
- likes: 点赞数
- likedBy: 点赞用户OpenID数组
- timestamp: 评论时间

### favorites（用户收藏）
- merchantId: 商家ID
- userOpenId: 用户OpenID
- timestamp: 收藏时间

### users（用户信息）
- _id: 用户OpenID
- nickname: 用户昵称
- avatarUrl: 用户头像地址
- createTime: 创建时间

## 云函数设计

- login: 处理用户登录和信息更新
- rate: 处理用户评分，并更新商家平均分
- comment: 处理评论发布、删除和点赞
- favorite: 处理收藏添加和移除
- getMerchantDetail: 获取商家详情及关联数据

## 开发和运行

1. 在微信开发者工具中导入项目
2. 在project.config.json中替换为你的AppID
3. 在云开发控制台创建对应的集合
4. 上传云函数
5. 通过上传JSON文件到云数据库导入初始商家数据

## 图片资源管理

### 本地UI图标（存储在小程序项目中）

1. **分类图标**（放置在 images/categories/ 目录下）：
   - all.png - 全部分类图标
   - fast-food.png - 快餐图标
   - snack.png - 小吃图标
   - burger.png - 汉堡图标
   - milk-tea.png - 奶茶图标
   - delivery-platform.png - 外卖平台图标
   - other.png - 其他分类图标

2. **星级评分图标**（放置在 images/stars/ 目录下）：
   - star-full.png - 满星图标
   - star-half.png - 半星图标
   - star-empty.png - 空星图标

3. **功能图标**（放置在 images/icons/ 目录下）：
   - favorite.png - 收藏图标（空心）
   - favorite-filled.png - 收藏图标（实心）
   - like.png - 点赞图标（空心）
   - like-filled.png - 点赞图标（实心）
   - star.png - 星星图标（用于登录页）
   - comment.png - 评论图标
   - empty-favorite.png - 收藏为空图标

4. **Tab栏图标**（放置在 images/tabbar/ 目录下）：
   - home.png - 首页图标（未选中）
   - home_selected.png - 首页图标（已选中）
   - mine.png - 我的图标（未选中）
   - mine_selected.png - 我的图标（已选中）

5. **其他UI图片**：
   - default-avatar.png - 默认头像
   - logo.png - 小程序LOGO

### 云存储图片（需手动上传到云存储）

- **商家logo**：每个商家的logo图片，上传后获取cloudID或fileID
- **平台图标**：各外卖平台（如美团、饿了么等）的图标，上传后获取cloudID或fileID
饿了么：cloud://cloudbase-0gdnnqax782f54fa.636c-cloudbase-0gdnnqax782f54fa-1363163853/images/eleme.png
美团：cloud://cloudbase-0gdnnqax782f54fa.636c-cloudbase-0gdnnqax782f54fa-1363163853/images/meituan.png
京东：	cloud://cloudbase-0gdnnqax782f54fa.636c-cloudbase-0gdnnqax782f54fa-1363163853/images/jingdong.png

## 页面功能说明

### 首页
- 上方展示分类选择器
- 下方展示商家列表，包含logo、评分、简介
- 支持按评分排序或默认排序
- 点击商家卡片进入详情页

### 商家详情页
- 展示商家基本信息
- 显示关联平台列表，支持一键跳转
- 评分区：用户可点击星星评分（1-5星）
- 评论区：按点赞数排序，支持点赞和长按删除（仅自己的评论）

### 我的页面
- 显示用户信息（头像、昵称）
- 提供个人信息编辑功能
- 展示收藏的商家列表

## 用户交互说明

- 评分：用户只能对同一商家评分一次，评分后实时更新平均分
- 评论：用户可发表评论，长按自己的评论可删除
- 点赞：用户可点赞评论，每条评论只能点赞一次
- 收藏：用户可收藏/取消收藏商家
- 平台跳转：点击平台按钮，跳转至对应外卖平台小程序

## 商家json编写格式
{"_id":"c611b946684c375202b845c7615c0802","category":"fast-food","description":"文苑三楼","logoUrl":"cloud://cloudbase-0gdnnqax782f54fa.636c-cloudbase-0gdnnqax782f54fa-1363163853/images/shop_logo/xiaoage.jpg","name":"小阿哥煲仔饭","platforms":[{"appId":"wxdd01bfc7fb8cb134","iconUrl":"cloud://cloudbase-0gdnnqax782f54fa.636c-cloudbase-0gdnnqax782f54fa-1363163853/images/shop_logo/xiaoage.jpg","name":"自营"}]}


## 开发人员

- 开发者：[您的名字]
- 项目联系人：[联系人] 