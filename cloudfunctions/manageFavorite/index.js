// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    if (!openid) {
        return {
            success: false,
            message: '未获取到用户身份'
        }
    }

    // 获取用户ID（优先使用_id，如果没有则使用openid）
    let userInfo = null
    try {
        const userResult = await db.collection('users').where({
            openid: openid
        }).get()

        if (userResult.data && userResult.data.length > 0) {
            userInfo = userResult.data[0]
        }
    } catch (e) {
        console.error('获取用户信息失败:', e)
    }

    const userOpenId = userInfo && userInfo._id ? userInfo._id : openid

    // 根据不同的操作执行不同的逻辑
    switch (event.action) {
        case 'add':
            return await addFavorite(event.merchantId, userOpenId)

        case 'remove':
            return await removeFavorite(event.favoriteId, userOpenId)

        case 'removeByMerchant':
            return await removeByMerchant(event.merchantId, userOpenId)

        case 'check':
            return await checkFavorite(event.merchantId, userOpenId)

        case 'list':
            return await listFavorites(userOpenId)

        default:
            return {
                success: false,
                message: '未知操作类型'
            }
    }
}

// 添加收藏
async function addFavorite(merchantId, userOpenId) {
    if (!merchantId) {
        return {
            success: false,
            message: '商家ID不能为空'
        }
    }

    try {
        // 先检查商家是否存在
        const merchantResult = await db.collection('merchants').doc(merchantId).get()
        if (!merchantResult.data) {
            return {
                success: false,
                message: '商家不存在'
            }
        }

        // 检查是否已经收藏过
        const favoriteResult = await db.collection('favorites')
            .where({
                merchantId: merchantId,
                userOpenId: userOpenId
            })
            .get()

        if (favoriteResult.data && favoriteResult.data.length > 0) {
            // 已经收藏过了，返回成功但不重复添加
            return {
                success: true,
                message: '已经收藏过该商家',
                data: favoriteResult.data[0]
            }
        }

        // 添加新收藏
        const result = await db.collection('favorites').add({
            data: {
                merchantId: merchantId,
                userOpenId: userOpenId,
                timestamp: db.serverDate()
            }
        })

        return {
            success: true,
            message: '收藏成功',
            data: result
        }
    } catch (e) {
        console.error('添加收藏失败:', e)
        return {
            success: false,
            message: '添加收藏失败: ' + e.message
        }
    }
}

// 通过收藏ID删除收藏
async function removeFavorite(favoriteId, userOpenId) {
    if (!favoriteId) {
        return {
            success: false,
            message: '收藏ID不能为空'
        }
    }

    try {
        // 先检查收藏是否存在，以及是否属于该用户
        const favoriteResult = await db.collection('favorites').doc(favoriteId).get()

        if (!favoriteResult.data) {
            return {
                success: false,
                message: '收藏记录不存在'
            }
        }

        if (favoriteResult.data.userOpenId !== userOpenId) {
            return {
                success: false,
                message: '无权限删除该收藏'
            }
        }

        // 删除收藏
        await db.collection('favorites').doc(favoriteId).remove()

        return {
            success: true,
            message: '取消收藏成功'
        }
    } catch (e) {
        console.error('取消收藏失败:', e)
        return {
            success: false,
            message: '取消收藏失败: ' + e.message
        }
    }
}

// 通过商家ID删除收藏
async function removeByMerchant(merchantId, userOpenId) {
    if (!merchantId) {
        return {
            success: false,
            message: '商家ID不能为空'
        }
    }

    try {
        // 查找用户对该商家的所有收藏
        const favoriteResult = await db.collection('favorites')
            .where({
                merchantId: merchantId,
                userOpenId: userOpenId
            })
            .get()

        if (!favoriteResult.data || favoriteResult.data.length === 0) {
            return {
                success: false,
                message: '未找到收藏记录'
            }
        }

        // 删除找到的所有收藏（通常只有一条）
        const deletePromises = favoriteResult.data.map(item => {
            return db.collection('favorites').doc(item._id).remove()
        })

        await Promise.all(deletePromises)

        return {
            success: true,
            message: '取消收藏成功',
            deleted: favoriteResult.data.length
        }
    } catch (e) {
        console.error('取消收藏失败:', e)
        return {
            success: false,
            message: '取消收藏失败: ' + e.message
        }
    }
}

// 检查是否已收藏
async function checkFavorite(merchantId, userOpenId) {
    if (!merchantId) {
        return {
            success: false,
            message: '商家ID不能为空',
            isFavorite: false
        }
    }

    try {
        const result = await db.collection('favorites')
            .where({
                merchantId: merchantId,
                userOpenId: userOpenId
            })
            .get()

        return {
            success: true,
            isFavorite: result.data && result.data.length > 0,
            data: result.data[0] || null
        }
    } catch (e) {
        console.error('检查收藏状态失败:', e)
        return {
            success: false,
            message: '检查收藏状态失败: ' + e.message,
            isFavorite: false
        }
    }
}

// 获取用户收藏列表
async function listFavorites(userOpenId) {
    try {
        // 获取用户的所有收藏
        const result = await db.collection('favorites')
            .where({
                userOpenId: userOpenId
            })
            .orderBy('timestamp', 'desc')
            .get()

        return {
            success: true,
            data: result.data
        }
    } catch (e) {
        console.error('获取收藏列表失败:', e)
        return {
            success: false,
            message: '获取收藏列表失败: ' + e.message
        }
    }
} 