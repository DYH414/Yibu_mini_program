// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
    const { merchantId, dateStr } = event

    if (!merchantId) {
        return {
            success: false,
            message: '商家ID不能为空'
        }
    }

    try {
        // 查询是否已存在该商家的点击记录
        const clicksRecord = await db.collection('merchantClicks').where({
            merchantId: merchantId
        }).get()

        let result

        if (clicksRecord.data.length === 0) {
            // 不存在记录，创建新记录
            const newRecord = {
                merchantId,
                totalClicks: 1,
                dailyClicks: {
                    [dateStr]: 1
                },
                lastUpdated: db.serverDate()
            }

            result = await db.collection('merchantClicks').add({
                data: newRecord
            })

            return {
                success: true,
                data: {
                    totalClicks: 1,
                    dailyClicks: 1
                },
                message: '创建点击记录成功'
            }
        } else {
            // 已存在记录，更新点击量
            const record = clicksRecord.data[0]
            const dailyClicks = record.dailyClicks || {}
            const todayClicks = dailyClicks[dateStr] || 0

            // 更新字段
            const updateData = {
                totalClicks: _.inc(1),
                lastUpdated: db.serverDate(),
                [`dailyClicks.${dateStr}`]: _.inc(1)
            }

            result = await db.collection('merchantClicks').doc(record._id).update({
                data: updateData
            })

            return {
                success: true,
                data: {
                    totalClicks: (record.totalClicks || 0) + 1,
                    dailyClicks: todayClicks + 1
                },
                message: '更新点击量成功'
            }
        }
    } catch (err) {
        console.error('更新点击量失败:', err)
        return {
            success: false,
            message: '更新点击量失败',
            error: err
        }
    }
} 