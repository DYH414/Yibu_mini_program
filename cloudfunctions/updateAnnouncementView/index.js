// 更新公告浏览量云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  try {
    const { announcementId } = event
    
    if (!announcementId) {
      return {
        success: false,
        error: '公告ID不能为空'
      }
    }
    
    // 增加浏览量
    await db.collection('announcements').doc(announcementId).update({
      data: {
        viewCount: db.command.inc(1),
        updateTime: new Date()
      }
    })
    
    return {
      success: true,
      message: '浏览量更新成功'
    }
  } catch (error) {
    console.error('更新公告浏览量失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}