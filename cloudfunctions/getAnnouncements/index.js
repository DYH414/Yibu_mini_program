// 获取公告列表云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  try {
    console.log('getAnnouncements 云函数被调用，参数:', event)
    const { limit = 10, isActive = true } = event

    // 查询有效的公告，按优先级和创建时间排序
    let query = db.collection('announcements')
      .where({
        isActive: isActive,
        startTime: db.command.lte(new Date()),
        endTime: db.command.gte(new Date())
      })
      .orderBy('priority', 'desc')
      .orderBy('createTime', 'desc')
      .limit(limit)

    console.log('执行查询...')
    const result = await query.get()
    console.log('查询结果:', result)



    return {
      success: true,
      data: result.data,
      total: result.data.length
    }
  } catch (error) {
    console.error('获取公告列表失败:', error)
    return {
      success: false,
      error: error.message,
      stack: error.stack
    }
  }
}