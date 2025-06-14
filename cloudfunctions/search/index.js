// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
    const { keyword, category = 'all', sortBy = 'default', page = 1, pageSize = 10 } = event

    try {
        // 构建查询条件
        const condition = {}

        // 关键词搜索（支持商家名称和描述）
        if (keyword && keyword.trim()) {
            // 使用正则表达式进行模糊匹配，不区分大小写
            const keywordRegex = new RegExp(keyword.trim(), 'i')
            condition.$or = [
                { name: keywordRegex },
                { description: keywordRegex }
            ]
        }

        // 分类过滤
        if (category && category !== 'all') {
            condition.category = category
        }

        // 执行查询
        const countResult = await db.collection('merchants')
            .where(condition)
            .count()

        const total = countResult.total

        // 根据排序方式确定排序字段
        let orderField = 'createTime'
        if (sortBy === 'rating') {
            orderField = 'avgRating'
        }

        // 查询商家数据
        let merchantsQuery = db.collection('merchants')
            .where(condition)
            .skip((page - 1) * pageSize)
            .limit(pageSize)

        // 应用排序
        merchantsQuery = merchantsQuery.orderBy(orderField, 'desc')

        const merchantsResult = await merchantsQuery.get()
        const merchants = merchantsResult.data

        // 如果没有数据，直接返回
        if (merchants.length === 0) {
            return {
                success: true,
                data: {
                    merchants: [],
                    total,
                    page,
                    pageSize
                }
            }
        }

        // 获取商家ID列表
        const merchantIds = merchants.map(merchant => merchant._id)

        // 批量查询评分数据
        const ratingsResult = await db.collection('ratings')
            .where({
                merchantId: _.in(merchantIds)
            })
            .get()

        const ratings = ratingsResult.data

        // 计算每个商家的平均评分
        const merchantRatings = {}
        ratings.forEach(rating => {
            if (!merchantRatings[rating.merchantId]) {
                merchantRatings[rating.merchantId] = {
                    total: 0,
                    count: 0
                }
            }
            merchantRatings[rating.merchantId].total += rating.score
            merchantRatings[rating.merchantId].count += 1
        })

        // 更新商家数据，添加评分信息
        const updatedMerchants = merchants.map(merchant => {
            const rating = merchantRatings[merchant._id] || { total: 0, count: 0 }
            const avgRating = rating.count > 0 ? (rating.total / rating.count).toFixed(1) : '0.0'

            return {
                ...merchant,
                avgRating,
                ratingCount: rating.count
            }
        })

        // 如果是按评分排序，再次排序
        if (sortBy === 'rating') {
            updatedMerchants.sort((a, b) => b.avgRating - a.avgRating)
        }

        // 记录搜索日志（如果有关键词）
        if (keyword && keyword.trim() && context.OPENID) {
            try {
                await db.collection('search_logs').add({
                    data: {
                        keyword: keyword.trim(),
                        userOpenId: context.OPENID,
                        timestamp: db.serverDate()
                    }
                })
            } catch (logError) {
                console.error('记录搜索日志失败', logError)
            }
        }

        return {
            success: true,
            data: {
                merchants: updatedMerchants,
                total,
                page,
                pageSize
            }
        }
    } catch (error) {
        console.error('搜索失败', error)
        return {
            success: false,
            error: error.message
        }
    }
} 