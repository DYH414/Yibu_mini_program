// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100

// 云函数入口函数
exports.main = async (event, context) => {
  const { userOpenId } = event
  
  // 如果没有提供userOpenId，则使用当前用户的openid
  const openid = userOpenId || context.OPENID
  
  if (!openid) {
    return {
      success: false,
      error: '未提供有效的用户ID'
    }
  }
  
  try {
    // 获取用户的所有搜索记录数量
    const countResult = await db.collection('search_logs')
      .where({
        userOpenId: openid
      })
      .count()
    
    const total = countResult.total
    
    // 计算需要分几批删除
    const batchTimes = Math.ceil(total / MAX_LIMIT)
    
    // 分批删除数据
    const tasks = []
    for (let i = 0; i < batchTimes; i++) {
      const promise = db.collection('search_logs')
        .where({
          userOpenId: openid
        })
        .limit(MAX_LIMIT)
        .get()
        .then(res => {
          // 获取这一批数据的ID列表
          const ids = res.data.map(item => item._id)
          
          // 批量删除
          const deleteTask = ids.map(id => {
            return db.collection('search_logs').doc(id).remove()
          })
          
          return Promise.all(deleteTask)
        })
      
      tasks.push(promise)
    }
    
    await Promise.all(tasks)
    
    return {
      success: true,
      deleted: total
    }
  } catch (error) {
    console.error('清空搜索历史失败', error)
    return {
      success: false,
      error: error.message
    }
  }
} 