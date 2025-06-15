// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: 'cloudbase-0gdnnqax782f54fa' // 您的云环境ID
})

const db = cloud.database()
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
    const { keyword, category, sortBy, page = 1, pageSize = 10 } = event

    try {
        if (!keyword) {
            return {
                success: false,
                message: '搜索关键词不能为空',
                data: { merchants: [], total: 0 }
            }
        }

        // 1. 构建匹配条件
        const matchStage = {}
        // 关键词模糊查询 (不区分大小写)
        if (keyword) {
            matchStage.$or = [
                { name: db.RegExp({ regexp: keyword, options: 'i' }) },
                { description: db.RegExp({ regexp: keyword, options: 'i' }) }
            ]
        }
        // 分类匹配
        if (category && category !== 'all') {
            matchStage.category = category
        }

        // 2. 聚合操作
        const aggregate = db.collection('merchants').aggregate().match(matchStage)

        // 3. 关联 ratings 集合
        aggregate.lookup({
            from: 'ratings',
            localField: '_id',
            foreignField: 'merchantId',
            as: 'ratingsData',
        })

        // 4. 计算平均分和评分数
        aggregate.addFields({
            ratingCount: $.size('$ratingsData'),
            avgRating: $.ifNull([$.avg('$ratingsData.score'), 0]), // 无评分时默认为0
        })

        // 5. 处理排序
        const sortStage = {}
        if (sortBy === 'rating') {
            sortStage.avgRating = -1
        }
        // 默认按相关性(数据库默认)或创建时间排序
        sortStage.createTime = -1
        aggregate.sort(sortStage)

        // 6. 分页查询，并获取总数
        const facetRes = await aggregate.facet({
            paginatedResults: [
                { $skip: (page - 1) * pageSize },
                { $limit: pageSize }
            ],
            totalCount: [
                { $count: 'count' }
            ]
        }).end()

        const merchants = facetRes.list[0].paginatedResults
        const totalCount = facetRes.list[0].totalCount.length > 0 ? facetRes.list[0].totalCount[0].count : 0

        return {
            success: true,
            data: {
                merchants: merchants,
                total: totalCount,
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