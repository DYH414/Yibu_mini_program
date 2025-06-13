// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: 'cloudbase-0gdnnqax782f54fa'
})

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    const db = cloud.database()
    const userCollection = db.collection('users')

    try {
        // 查询用户是否已存在
        const user = await userCollection.doc(openid).get()
        // 用户已存在，返回用户信息
        return {
            openid,
            user: user.data,
            isNew: false
        }
    } catch (err) {
        // 用户不存在，创建新用户
        await userCollection.add({
            data: {
                _id: openid,
                nickname: '微信用户', // 默认昵称
                avatarUrl: '/images/default-avatar.png', // 默认头像
                createTime: db.serverDate()
            }
        })

        return {
            openid,
            isNew: true
        }
    }
} 