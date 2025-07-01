// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
    try {
        // 获取管理员权限
        cloud.updateConfig({
            env: cloud.DYNAMIC_CURRENT_ENV
        })

        // 检查dataCache集合是否存在，如果不存在则创建
        try {
            await db.createCollection('dataCache')
            console.log('dataCache集合创建成功')
        } catch (err) {
            // 如果集合已存在，会抛出错误，这是正常的
            console.log('dataCache集合已存在或创建失败:', err)
        }

        // 创建TTL索引，自动删除过期的缓存数据
        try {
            await db.collection('dataCache').createIndex({
                expireAt: 1
            }, {
                expireAfterSeconds: 0 // 到达expireAt时间后自动删除
            })
            console.log('TTL索引创建成功')

            return {
                success: true,
                message: 'dataCache集合和TTL索引创建成功'
            }
        } catch (err) {
            console.error('创建TTL索引失败:', err)
            return {
                success: false,
                message: '创建TTL索引失败',
                error: err
            }
        }
    } catch (error) {
        console.error('初始化dataCache失败:', error)
        return {
            success: false,
            message: '初始化dataCache失败',
            error: error
        }
    }
} 