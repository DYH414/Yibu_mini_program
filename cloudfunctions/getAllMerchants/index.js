// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const MAX_LIMIT = 100 // 云函数单次查询最大条数

// 云函数入口函数
exports.main = async (event, context) => {
    const {
        category,
        sortBy = 'default',
        page = 1,
        pageSize = 10,
        useCache = true
    } = event

    console.log('获取商家参数:', { category, sortBy, page, pageSize, useCache })

    try {
        // 构建缓存键
        const cacheKey = `merchants_${category || 'all'}_${sortBy}_${page}_${pageSize}`

        // 如果允许使用缓存，尝试从云数据库缓存集合获取
        if (useCache) {
            try {
                const cacheResult = await db.collection('dataCache')
                    .where({
                        key: cacheKey,
                        expireAt: _.gt(db.serverDate())
                    })
                    .limit(1)
                    .get()

                if (cacheResult.data && cacheResult.data.length > 0) {
                    console.log('使用缓存数据:', cacheKey)
                    return {
                        success: true,
                        data: cacheResult.data[0].data,
                        fromCache: true
                    }
                }
            } catch (cacheError) {
                console.error('获取缓存失败，继续使用实时数据:', cacheError)
            }
        }

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
                    total: 0,
                    page,
                    pageSize,
                    totalPages: 0
                }
            }
        }

        // 计算总页数
        const totalPages = Math.ceil(total / pageSize)

        // 验证页码是否有效
        const validPage = Math.min(Math.max(1, page), totalPages)
        const skip = (validPage - 1) * pageSize

        // 3. 获取当前页的商家数据
        const merchantsResult = await db.collection('merchants')
            .where(query)
            .skip(skip)
            .limit(pageSize)
            .get()

        const merchants = merchantsResult.data

        // 如果没有商家数据，直接返回
        if (!merchants || merchants.length === 0) {
            return {
                success: true,
                data: {
                    merchants: [],
                    total,
                    page: validPage,
                    pageSize,
                    totalPages
                }
            }
        }

        // 获取商家ID列表
        const merchantIds = merchants.map(m => m._id)

        // 4. 并行获取这些商家的评分、评论、收藏和点击量数据
        const [ratingsResult, commentsResult, favoritesResult, clicksResult] = await Promise.all([
            // 获取评分数据 - 只获取当前页面商家的评分
            db.collection('ratings')
                .where({
                    merchantId: _.in(merchantIds)
                })
                .get(),

            // 获取评论数据 - 只获取当前页面商家的评论数量
            db.collection('comments')
                .where({
                    merchantId: _.in(merchantIds)
                })
                .count(),

            // 获取收藏数据 - 只获取当前页面商家的收藏数量
            db.collection('favorites')
                .where({
                    merchantId: _.in(merchantIds)
                })
                .count(),

            // 获取点击量数据 - 只获取当前页面商家的点击量
            db.collection('merchantClicks')
                .where({
                    merchantId: _.in(merchantIds)
                })
                .get()
        ])

        // 5. 使用聚合查询获取每个商家的评论和收藏数量
        const commentsCountByMerchant = await db.collection('comments')
            .aggregate()
            .match({
                merchantId: _.in(merchantIds)
            })
            .group({
                _id: '$merchantId',
                count: $.sum(1)
            })
            .end()

        const favoritesCountByMerchant = await db.collection('favorites')
            .aggregate()
            .match({
                merchantId: _.in(merchantIds)
            })
            .group({
                _id: '$merchantId',
                count: $.sum(1)
            })
            .end()

        // 6. 创建评分、评论数、收藏数和点击量的映射
        const ratings = ratingsResult.data
        const clicks = clicksResult.data

        // 创建商家ID到评分、评论数、收藏数和点击量的映射
        const ratingsMap = {}
        const commentsCountMap = {}
        const favoritesCountMap = {}
        const clicksMap = {}

        // 处理评分数据
        ratings.forEach(rating => {
            if (!ratingsMap[rating.merchantId]) {
                ratingsMap[rating.merchantId] = {
                    scores: [],
                    count: 0,
                    total: 0
                }
            }
            ratingsMap[rating.merchantId].scores.push(rating.score)
            ratingsMap[rating.merchantId].count++
            ratingsMap[rating.merchantId].total += rating.score
        })

        // 处理评论数量
        commentsCountByMerchant.list.forEach(item => {
            commentsCountMap[item._id] = item.count
        })

        // 处理收藏数量
        favoritesCountByMerchant.list.forEach(item => {
            favoritesCountMap[item._id] = item.count
        })

        // 处理点击量
        clicks.forEach(click => {
            clicksMap[click.merchantId] = click.totalClicks || 0
        })

        // 7. 处理数据，计算评分、评论数、收藏数和点击量
        const merchantsWithData = merchants.map(merchant => {
            // 处理评分
            const merchantRating = ratingsMap[merchant._id] || { count: 0, total: 0 }
            const ratingCount = merchantRating.count
            let avgRating = 0

            if (ratingCount > 0) {
                avgRating = parseFloat((merchantRating.total / ratingCount).toFixed(1))
            }

            // 处理评论数
            const commentsCount = commentsCountMap[merchant._id] || 0

            // 处理收藏数
            const favoritesCount = favoritesCountMap[merchant._id] || 0

            // 处理点击量
            const totalClicks = clicksMap[merchant._id] || 0

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

        // 9. 构建返回数据
        const result = {
            merchants: sortedMerchants,
            total,
            page: validPage,
            pageSize,
            totalPages
        }

        // 10. 将结果存入缓存
        if (useCache) {
            try {
                // 设置缓存过期时间为5分钟
                const expireAt = new Date()
                expireAt.setMinutes(expireAt.getMinutes() + 5)

                await db.collection('dataCache').add({
                    data: {
                        key: cacheKey,
                        data: result,
                        createAt: db.serverDate(),
                        expireAt: expireAt
                    }
                })

                console.log('数据已缓存:', cacheKey)
            } catch (cacheError) {
                console.error('缓存数据失败:', cacheError)
            }
        }

        return {
            success: true,
            data: result
        }
    } catch (error) {
        console.error('获取商家数据失败:', error)
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