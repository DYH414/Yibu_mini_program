// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

// 自定义Promise.allSettled实现，兼容旧版本Node.js
if (!Promise.allSettled) {
    Promise.allSettled = function (promises) {
        return Promise.all(
            promises.map(p =>
                Promise.resolve(p)
                    .then(value => ({ status: 'fulfilled', value }))
                    .catch(reason => ({ status: 'rejected', reason }))
            )
        );
    };
}

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        // 初始化管理员权限
        cloud.updateConfig({
            env: cloud.DYNAMIC_CURRENT_ENV
        })
        const db = cloud.database({
            env: cloud.DYNAMIC_CURRENT_ENV
        })

        // 1. 获取所有收藏记录
        const favoritesResult = await db.collection('favorites').get()
        const favorites = favoritesResult.data

        // 2. 按用户和商家分组，找出重复项
        const userMerchantMap = new Map()
        const duplicates = []
        const keepIds = new Set()

        favorites.forEach(favorite => {
            const key = `${favorite.userOpenId}_${favorite.merchantId}`

            if (!userMerchantMap.has(key)) {
                // 第一次出现，保留这条记录
                userMerchantMap.set(key, favorite)
                keepIds.add(favorite._id)
            } else {
                // 重复出现，记录为重复项
                // 如果这条记录比之前保留的记录更新，则替换
                const existingFavorite = userMerchantMap.get(key)

                if (favorite.timestamp && existingFavorite.timestamp &&
                    favorite.timestamp > existingFavorite.timestamp) {
                    // 新记录更新，保留新记录，将旧记录标为重复
                    duplicates.push(existingFavorite._id)
                    keepIds.delete(existingFavorite._id)
                    keepIds.add(favorite._id)
                    userMerchantMap.set(key, favorite)
                } else {
                    // 旧记录更新或时间相同，保留旧记录
                    duplicates.push(favorite._id)
                }
            }
        })

        // 3. 删除重复项
        let deletedCount = 0

        // 使用云函数的管理员权限进行批量删除
        if (duplicates.length > 0) {
            try {
                // 批量删除，每次最多删除20条
                const batchSize = 20;
                for (let i = 0; i < duplicates.length; i += batchSize) {
                    const batch = duplicates.slice(i, i + batchSize);
                    const deletePromises = batch.map(id => {
                        return db.collection('favorites').doc(id).remove()
                            .then(() => true)
                            .catch(err => {
                                console.error(`删除收藏记录 ${id} 失败:`, err);
                                return false;
                            });
                    });

                    const results = await Promise.allSettled(deletePromises);

                    // 统计成功删除的数量
                    results.forEach(result => {
                        if (result.status === 'fulfilled' && result.value === true) {
                            deletedCount++;
                        }
                    });
                }
            } catch (err) {
                console.error('批量删除收藏记录失败:', err);
            }
        }

        return {
            success: true,
            deleted: deletedCount,
            total: duplicates.length,
            message: `成功清理 ${deletedCount}/${duplicates.length} 条重复收藏`
        }
    } catch (error) {
        console.error('清理重复收藏失败:', error)
        return {
            success: false,
            error: error.message || error
        }
    }
} 