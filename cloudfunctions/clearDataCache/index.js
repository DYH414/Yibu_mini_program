// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
    const { prefix } = event

    try {
        // 获取管理员权限
        cloud.updateConfig({
            env: cloud.DYNAMIC_CURRENT_ENV
        })

        // 根据前缀查询要删除的缓存
        const MAX_LIMIT = 100
        const countResult = await db.collection('dataCache')
            .where({
                key: db.RegExp({
                    regexp: `^${prefix || ''}.*`,
                    options: 'i',
                })
            })
            .count()

        const total = countResult.total

        if (total === 0) {
            return {
                success: true,
                message: '没有找到符合条件的缓存数据',
                deleted: 0
            }
        }

        // 分批获取缓存ID
        const batchTimes = Math.ceil(total / MAX_LIMIT)
        let deletedCount = 0

        for (let i = 0; i < batchTimes; i++) {
            const cacheItems = await db.collection('dataCache')
                .where({
                    key: db.RegExp({
                        regexp: `^${prefix || ''}.*`,
                        options: 'i',
                    })
                })
                .skip(i * MAX_LIMIT)
                .limit(MAX_LIMIT)
                .get()

            // 删除这批缓存
            for (const item of cacheItems.data) {
                await db.collection('dataCache').doc(item._id).remove()
                deletedCount++
            }
        }

        return {
            success: true,
            message: `成功删除${deletedCount}条缓存数据`,
            deleted: deletedCount
        }
    } catch (error) {
        console.error('清除缓存失败:', error)
        return {
            success: false,
            message: '清除缓存失败',
            error: error
        }
    }
} 