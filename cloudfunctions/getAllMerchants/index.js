// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const MAX_LIMIT = 100 // 云函数单次查询最大条数

// 云函数入口函数
exports.main = async (event, context) => {
    const { category, sortBy = 'default' } = event
    console.log('获取所有商家参数:', { category, sortBy })

    try {
        // 1. 构建查询条件
        let query = {}
        if (category && category !== 'all') {
            query.category = category
        }

        // 2. 获取商家总数
        const countResult = await db.collection('merchants').where(query).count()
        const total = countResult.total
        console.log('商家总数:', total)

        // 如果没有数据，直接返回
        if (total === 0) {
            return {
                success: true,
                data: {
                    merchants: [],
                    total: 0
                }
            }
        }

        // 3. 分批次获取所有商家数据
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        const tasks = []
        for (let i = 0; i < batchTimes; i++) {
            const promise = db.collection('merchants')
                .where(query)
                .skip(i * MAX_LIMIT)
                .limit(MAX_LIMIT)
                .get()
            tasks.push(promise)
        }

        // 4. 等待所有查询完成
        const results = await Promise.all(tasks)
        let merchants = []
        results.forEach(result => {
            merchants = merchants.concat(result.data)
        })

        // 5. 获取所有评分数据
        const ratingsResult = await db.collection('ratings').get()
        const ratings = ratingsResult.data

        // 6. 获取所有评论数据
        const commentsResult = await db.collection('comments').get()
        const comments = commentsResult.data

        // 7. 获取所有收藏数据
        const favoritesResult = await db.collection('favorites').get()
        const favorites = favoritesResult.data

        // 8. 获取所有点击量数据
        const clicksResult = await db.collection('merchantClicks').get()
        const clicks = clicksResult.data

        // 9. 处理数据，计算评分、评论数、收藏数和点击量
        const merchantsWithData = merchants.map(merchant => {
            // 处理评分
            const merchantRatings = ratings.filter(r => r.merchantId === merchant._id)
            const ratingCount = merchantRatings.length
            let avgRating = 0

            if (ratingCount > 0) {
                const totalScore = merchantRatings.reduce((sum, rating) => sum + rating.score, 0)
                avgRating = parseFloat((totalScore / ratingCount).toFixed(1))
            }

            // 处理评论数
            const merchantComments = comments.filter(c => c.merchantId === merchant._id)
            const commentsCount = merchantComments.length

            // 处理收藏数
            const merchantFavorites = favorites.filter(f => f.merchantId === merchant._id)
            const favoritesCount = merchantFavorites.length

            // 处理点击量
            const merchantClicks = clicks.find(c => c.merchantId === merchant._id)
            const totalClicks = merchantClicks ? merchantClicks.totalClicks : 0

            return {
                ...merchant,
                avgRating,
                ratingCount,
                commentsCount,
                favoritesCount,
                totalClicks
            }
        })

        // 10. 排序
        let sortedMerchants = merchantsWithData

        if (sortBy === 'rating') {
            // 确保将avgRating转换为数字后再排序
            sortedMerchants.forEach(merchant => {
                merchant.avgRating = parseFloat(merchant.avgRating || 0)
            })

            // 按评分排序 - 使用明确的降序排序
            sortedMerchants.sort((a, b) => {
                // 主要按评分排序（降序）
                if (a.avgRating !== b.avgRating) {
                    return b.avgRating - a.avgRating
                }

                // 评分相同时，按评分数量排序（降序）
                return (b.ratingCount || 0) - (a.ratingCount || 0)
            })
        } else if (sortBy === 'clicks') {
            // 按点击量排序（降序）
            sortedMerchants.sort((a, b) => {
                return (b.totalClicks || 0) - (a.totalClicks || 0)
            })
        } else if (sortBy === 'default') {
            // 默认排序 - 使用综合排序算法
            sortedMerchants.sort((a, b) => {
                // 计算综合分数
                const scoreA = calculateCompositeScore(a)
                const scoreB = calculateCompositeScore(b)

                // 按综合分数降序排序
                return scoreB - scoreA
            })
        }

        return {
            success: true,
            data: {
                merchants: sortedMerchants,
                total: total
            }
        }
    } catch (error) {
        console.error('获取所有商家数据失败:', error)
        return {
            success: false,
            message: '获取商家数据失败，请稍后重试',
            error: error
        }
    }
}

/**
 * 计算商家的综合分数
 * 综合评分、评论数、收藏数和点击量
 */
function calculateCompositeScore(merchant) {
    // 获取评分、评论数、收藏数和点击量
    const avgRating = parseFloat(merchant.avgRating || 0)
    const commentsCount = merchant.commentsCount || 0
    const favoritesCount = merchant.favoritesCount || 0
    const totalClicks = merchant.totalClicks || 0

    // 计算综合分数: 评分占40%，评论数占20%，收藏数占20%，点击量占20%
    const score = avgRating * 0.4 +
        (Math.log(commentsCount + 1) * 0.2) +
        (Math.log(favoritesCount + 1) * 0.2) +
        (Math.log(totalClicks + 1) * 0.2)

    // 如果是推荐商家，增加权重
    if (merchant.isFeatured) {
        return score * 1.2
    }

    return score
} 