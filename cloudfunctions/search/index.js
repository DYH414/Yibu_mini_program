// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        const { keyword, category, sortBy = 'default', page = 1, pageSize = 10 } = event
        console.log('搜索参数:', { keyword, category, sortBy, page, pageSize })

        // 参数验证
        if (!keyword && !category) {
            return {
                success: false,
                message: '搜索关键词和分类不能同时为空'
            }
        }

        // 构建查询条件
        const aggregate = db.collection('merchants').aggregate()

        // 1. 关键词搜索
        if (keyword) {
            // 关键词搜索 - 匹配商家名称或描述
            aggregate.match(_.or([
                {
                    name: db.RegExp({
                        regexp: keyword,
                        options: 'i', // 不区分大小写
                    })
                },
                {
                    description: db.RegExp({
                        regexp: keyword,
                        options: 'i', // 不区分大小写
                    })
                }
            ]))
        }

        // 2. 分类筛选
        if (category && category !== 'all') {
            aggregate.match({
                category: category
            })
        }

        // 3. 获取商家ID列表，用于后续关联查询
        const merchantsResult = await aggregate.end()
        const merchants = merchantsResult.list

        if (merchants.length === 0) {
            return {
                success: true,
                data: {
                    merchants: [],
                    total: 0
                }
            }
        }

        const merchantIds = merchants.map(m => m._id)

        // 4. 获取评分数据
        const ratingsResult = await db.collection('ratings')
            .where({
                merchantId: _.in(merchantIds)
            })
            .get()

        const ratings = ratingsResult.data

        // 5. 获取评论数据
        const commentsResult = await db.collection('comments')
            .where({
                merchantId: _.in(merchantIds)
            })
            .get()

        const comments = commentsResult.data

        // 6. 获取收藏数据
        const favoritesResult = await db.collection('favorites')
            .where({
                merchantId: _.in(merchantIds)
            })
            .get()

        const favorites = favoritesResult.data

        // 6.1 获取点击量数据
        const clicksResult = await db.collection('merchantClicks')
            .where({
                merchantId: _.in(merchantIds)
            })
            .get()

        const clicks = clicksResult.data

        // 7. 处理数据，计算评分、评论数和收藏数
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
            const merchantClick = clicks.find(c => c.merchantId === merchant._id)
            const totalClicks = merchantClick ? (merchantClick.totalClicks || 0) : 0

            return {
                ...merchant,
                avgRating,
                ratingCount,
                commentsCount,
                favoritesCount,
                totalClicks
            }
        })

        // 8. 排序
        let sortedMerchants = merchantsWithData

        if (sortBy === 'rating') {
            // 确保将avgRating转换为数字后再排序
            sortedMerchants.forEach(merchant => {
                merchant.avgRating = parseFloat(merchant.avgRating || 0);
            });

            // 按评分排序 - 使用明确的降序排序
            sortedMerchants.sort((a, b) => {
                // 主要按评分排序（降序）
                if (a.avgRating !== b.avgRating) {
                    return b.avgRating - a.avgRating;
                }

                // 评分相同时，按评分数量排序（降序）
                return (b.ratingCount || 0) - (a.ratingCount || 0);
            });
        } else if (sortBy === 'clicks') {
            // 确保将totalClicks转换为数字后再排序
            sortedMerchants.forEach(merchant => {
                merchant.totalClicks = parseInt(merchant.totalClicks || 0);
            });

            // 按点击量排序（降序）
            sortedMerchants.sort((a, b) => {
                return (b.totalClicks || 0) - (a.totalClicks || 0);
            });

            console.log('热度排序结果:', sortedMerchants.map(m => ({ name: m.name, totalClicks: m.totalClicks })));
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

        // 9. 分页
        const total = sortedMerchants.length
        const paginatedMerchants = sortedMerchants.slice((page - 1) * pageSize, page * pageSize)

        return {
            success: true,
            data: {
                merchants: paginatedMerchants,
                total: total
            }
        }
    } catch (error) {
        console.error('搜索云函数执行失败', error)
        return {
            success: false,
            message: '搜索服务异常，请稍后重试',
            error: error
        }
    }
}

/**
 * 计算商家的综合分数
 * 综合评分、评论数和收藏数
 */
function calculateCompositeScore(merchant) {
    // 获取评分、评论数和收藏数
    const avgRating = parseFloat(merchant.avgRating || 0)
    const commentsCount = merchant.commentsCount || 0
    const favoritesCount = merchant.favoritesCount || 0
    const totalClicks = merchant.totalClicks || 0

    // 计算综合分数: 评分占40%，评论数占25%，收藏数占20%，点击量占15%
    const score = avgRating * 0.4 +
        (Math.log(commentsCount + 1) * 0.25) +
        (Math.log(favoritesCount + 1) * 0.2) +
        (Math.log(totalClicks + 1) * 0.15)

    // 如果是推荐商家，增加权重
    if (merchant.isFeatured) {
        return score * 1.2
    }

    return score
} 