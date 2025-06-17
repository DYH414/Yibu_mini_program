// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
    const { merchantId, getTopMerchants = false, limit = 10 } = event

    try {
        if (merchantId) {
            // 获取指定商家的点击量
            const result = await db.collection('merchantClicks').where({
                merchantId: merchantId
            }).get()

            if (result.data.length === 0) {
                return {
                    success: true,
                    data: {
                        totalClicks: 0,
                        dailyClicks: {}
                    },
                    message: '未找到点击量记录'
                }
            } else {
                return {
                    success: true,
                    data: result.data[0],
                    message: '获取点击量成功'
                }
            }
        } else if (getTopMerchants) {
            // 获取热门商家列表（按点击量排序）
            const clicksResult = await db.collection('merchantClicks')
                .orderBy('totalClicks', 'desc')
                .limit(limit)
                .get()

            // 如果需要获取对应的商家详细信息
            if (clicksResult.data.length > 0) {
                const merchantIds = clicksResult.data.map(item => item.merchantId)

                // 获取商家详情
                const merchantsResult = await db.collection('merchants').where({
                    _id: _.in(merchantIds)
                }).get()

                // 合并点击量信息与商家信息
                const merchants = merchantsResult.data.map(merchant => {
                    const clickInfo = clicksResult.data.find(click => click.merchantId === merchant._id)
                    return {
                        ...merchant,
                        totalClicks: clickInfo ? clickInfo.totalClicks : 0
                    }
                })

                // 按点击量排序
                merchants.sort((a, b) => b.totalClicks - a.totalClicks)

                return {
                    success: true,
                    data: merchants,
                    message: '获取热门商家成功'
                }
            } else {
                return {
                    success: true,
                    data: [],
                    message: '没有找到点击量记录'
                }
            }
        } else {
            return {
                success: false,
                message: '参数错误，请提供merchantId或设置getTopMerchants=true'
            }
        }
    } catch (err) {
        console.error('获取点击量数据失败:', err)
        return {
            success: false,
            message: '获取点击量数据失败',
            error: err
        }
    }
} 