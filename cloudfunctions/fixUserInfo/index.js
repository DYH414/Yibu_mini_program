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
    const _ = db.command

    console.log('修复用户信息云函数被调用, openid:', openid)
    console.log('传入的用户信息:', event.userInfo)

    try {
        // 检查用户是否存在
        const userCheck = await db.collection('users').doc(openid).get()
        console.log('用户已存在:', userCheck.data)

        // 用户存在，更新信息
        if (event.userInfo && (event.userInfo.nickname || event.userInfo.avatarUrl)) {
            const updateData = {}

            if (event.userInfo.nickname) {
                updateData.nickname = event.userInfo.nickname
            }

            if (event.userInfo.avatarUrl) {
                updateData.avatarUrl = event.userInfo.avatarUrl
            }

            // 添加更新时间
            updateData.updateTime = db.serverDate()

            console.log('准备更新用户信息:', updateData)

            // 更新用户信息
            await db.collection('users').doc(openid).update({
                data: updateData
            })

            console.log('用户信息更新成功')

            // 获取更新后的用户信息
            const updatedUser = await db.collection('users').doc(openid).get()

            return {
                success: true,
                openid: openid,
                userInfo: updatedUser.data
            }
        } else {
            return {
                success: false,
                message: '未提供有效的用户信息',
                openid: openid,
                currentUserInfo: userCheck.data
            }
        }
    } catch (err) {
        console.error('修复用户信息失败:', err)
        return {
            success: false,
            error: err,
            openid: openid
        }
    }
} 