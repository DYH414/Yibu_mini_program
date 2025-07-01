// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV // 使用动态当前环境，而不是硬编码环境ID
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const userOpenId = wxContext.OPENID
    const { merchantId } = event

    try {
        // 参数验证
        if (!merchantId) {
            return {
                success: false,
                message: '商家ID不能为空'
            }
        }

        // 并行获取所有数据
        const [merchantResult, ratingsResult, favoriteResult] = await Promise.all([
            // 1. 获取商家基本信息
            db.collection('merchants').doc(merchantId).get(),

            // 2. 获取评分数据
            db.collection('ratings').where({
                merchantId: merchantId
            }).get(),

            // 3. 使用manageFavorite云函数检查收藏状态
            userOpenId ? cloud.callFunction({
                name: 'manageFavorite',
                data: {
                    action: 'check',
                    merchantId: merchantId
                }
            }) : { result: { isFavorite: false } }
        ])

        // 处理商家数据
        const merchant = merchantResult.data

        // 处理评分数据
        const ratings = ratingsResult.data
        const ratingCount = ratings.length
        let avgRating = 0
        let userRating = 0

        if (ratingCount > 0) {
            const totalScore = ratings.reduce((sum, rating) => sum + rating.score, 0)
            avgRating = (totalScore / ratingCount).toFixed(1)

            // 查找用户评分
            if (userOpenId) {
                const userRatingObj = ratings.find(r => r.userOpenId === userOpenId)
                userRating = userRatingObj ? userRatingObj.score : 0
            }
        }

        // 处理收藏状态
        const isFavorite = favoriteResult.result && favoriteResult.result.success ?
            favoriteResult.result.isFavorite : false

        // 返回完整数据
        return {
            success: true,
            data: {
                merchant: {
                    ...merchant,
                    ratingCount,
                    avgRating
                },
                userRating,
                isFavorite
            }
        }
    } catch (error) {
        console.error('获取商家详情失败:', error)
        return {
            success: false,
            message: '获取商家详情失败',
            error
        }
    }
}