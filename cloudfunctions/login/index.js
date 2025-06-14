// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
    env: 'cloudbase-0gdnnqax782f54fa'
})

// 云函数入口函数
exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    console.log('云函数login被调用, openid:', openid)

    const db = cloud.database()
    const userCollection = db.collection('users')

    try {
        // 查询用户是否已存在
        console.log('尝试查询用户:', openid)
        const user = await userCollection.doc(openid).get()
        console.log('用户已存在:', user.data)

        // 用户已存在，返回用户信息
        return {
            openid,
            user: user.data,
            isNew: false
        }
    } catch (err) {
        // 用户不存在，创建新用户
        console.log('用户不存在，创建新用户:', err)

        try {
            const result = await userCollection.add({
                data: {
                    _id: openid,
                    nickname: '微信用户', // 默认昵称
                    avatarUrl: '/images/default-avatar.png', // 默认头像
                    createTime: db.serverDate()
                }
            })
            console.log('创建新用户成功:', result)

            // 创建成功后，再次查询用户信息并返回
            const newUser = await userCollection.doc(openid).get()

            return {
                openid,
                user: newUser.data,
                isNew: true
            }
        } catch (createErr) {
            console.error('创建新用户失败:', createErr)
            return {
                openid,
                error: createErr,
                isNew: true
            }
        }
    }
} 